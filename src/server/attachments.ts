import "server-only";
import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";
import { query, withTransaction } from "./db";
import { S3_BUCKET, s3 } from "./s3-client";
import { BOARD_STORAGE_LIMIT, formatBytes } from "../features/board/model";

export type Actor = { companyId: string; userId: string };

/**
 * 링크로 들어온 작업자. 토큰이 가리키는 작업지시 하나로 범위가 좁혀지고,
 * 소속 회사를 통해 요금제를 확인하는 경로는 로그인 사용자와 같다.
 * 설계 배경: docs/worker-access.md
 */
export type ScopedActor = Actor & { linkWorkOrderId?: string };

export const TARGET_TYPES = [
  "standard_step",
  "risk_item_before",
  "risk_item_after",
  "work_order",
  "inspection_result",
  "inspection_finding",
  "incident",
  "board_post",
] as const;
export type AttachmentTarget = (typeof TARGET_TYPES)[number];

/**
 * 토큰 링크로 들어온 사람이 붙일 수 있는 대상. 역할 때문이 아니라 **링크가 여는
 * 범위**가 작업지시 하나이기 때문이다. `/w` 화면이 보여 주는 문서가 늘면 여기도 는다.
 */
const LINK_TARGETS: ReadonlySet<AttachmentTarget> = new Set([
  "work_order",
  "inspection_result",
  "inspection_finding",
]);

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB (클라이언트 압축 후 여유 있게)
/** 자료실 글은 동영상도 받는다. 압축하지 않으므로 한 파일 200MB 까지. */
const MAX_BOARD_UPLOAD_BYTES = 200 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);
const BOARD_VIDEO_MIME = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
};
const maxBytesFor = (target: AttachmentTarget) =>
  target === "board_post" ? MAX_BOARD_UPLOAD_BYTES : MAX_UPLOAD_BYTES;
const mimeAllowed = (target: AttachmentTarget, mime: string) =>
  ALLOWED_MIME.has(mime) ||
  (target === "board_post" && BOARD_VIDEO_MIME.has(mime));

export class AttachmentError extends Error {}

/** 회사 멤버십 + Pro 여부 조회. RBAC 게이트. */
async function verifyActor(
  actor: ScopedActor,
  target: AttachmentTarget,
  upload = true,
): Promise<{ role: string; pro: boolean }> {
  const rows = await query<{ role: string; pro_state: string }>(
    `SELECT m.role, c.pro_state
       FROM company_members m JOIN companies c ON c.id = m.company_id
      WHERE m.company_id = $1 AND m.user_id = $2
        AND m.status = 'ACTIVE' AND m.left_at IS NULL
        AND c.withdrawn_at IS NULL`,
    [actor.companyId, actor.userId],
  );
  const row = rows[0];
  if (!row) throw new AttachmentError("권한이 없습니다.");
  const pro = row.pro_state !== "FREE";
  // 사진 첨부는 **요금제 하나만** 가른다. 역할에 따른 차이는 없다 —
  // 작업자도 표준서에 사진을 올릴 수 있다. 위험 앞에 서 있는 사람이 작업자다.
  if (upload && !pro)
    throw new AttachmentError(
      "사진·동영상 첨부는 유료 요금제에서 이용할 수 있습니다.",
    );
  // 링크 방문자는 회사에서 어떤 역할이든 현장 작업자 권한으로만 다룬다.
  // 토큰은 배정 하나를 여는 열쇠이지 관리자 자격을 옮겨 오지 않는다.
  const role = actor.linkWorkOrderId ? "WORKER" : row.role;
  // 자료실 글은 관리자만 쓰므로 첨부도 관리자만 올린다. 읽기는 구성원 전원.
  if (upload && target === "board_post" && role === "WORKER")
    throw new AttachmentError("자료실 첨부는 관리자만 올릴 수 있습니다.");
  return { role, pro };
}

/**
 * 작업자는 본인이 올린 첨부만 확정·삭제할 수 있다.
 * 관리자는 현장 기록을 정리해야 하므로 회사 내 첨부를 다룰 수 있다.
 */
function assertOwnAttachment(
  actor: ScopedActor,
  role: string,
  uploadedBy: string,
) {
  if (role === "WORKER" && uploadedBy !== actor.userId)
    throw new AttachmentError("본인이 올린 첨부만 처리할 수 있습니다.");
}

/**
 * 대상 엔티티가 실제로 이 회사 소속인지 검증. cross-tenant 오염 방지.
 * (composite FK 를 attachments 에 걸 수 없어 앱단에서 강제)
 */
async function verifyTargetOwnership(
  actor: ScopedActor,
  target: AttachmentTarget,
  targetId: string,
) {
  if (target === "incident")
    throw new AttachmentError("사고 첨부 기능은 아직 지원하지 않습니다.");
  const map: Record<AttachmentTarget, { table: string; join?: string }> = {
    standard_step: {
      table: "standard_steps ss JOIN standards s ON s.id = ss.standard_id",
      join: "ss.id = $1 AND s.company_id = $2",
    },
    risk_item_before: {
      table:
        "risk_assessment_items ri JOIN risk_assessments ra ON ra.id = ri.assessment_id",
      join: "ri.id = $1 AND ra.company_id = $2",
    },
    risk_item_after: {
      table:
        "risk_assessment_items ri JOIN risk_assessments ra ON ra.id = ri.assessment_id",
      join: "ri.id = $1 AND ra.company_id = $2",
    },
    work_order: {
      table: "work_orders",
      join: "id = $1 AND company_id = $2",
    },
    inspection_result: {
      table:
        "inspection_results r JOIN inspections i ON i.id = r.inspection_id JOIN work_sessions ws ON ws.id = i.session_id",
      join: "r.id = $1 AND ws.company_id = $2",
    },
    inspection_finding: {
      table:
        "inspection_findings f JOIN inspection_results r ON r.id = f.result_id JOIN inspections i ON i.id = r.inspection_id JOIN work_sessions ws ON ws.id = i.session_id JOIN work_orders wo ON wo.id = ws.work_order_id",
      join: "f.id = $1 AND wo.company_id = $2",
    },
    incident: {
      // 아직 사고 모듈 미구현. 스키마 대응만 해두고 실제 삽입은 UI 없음.
      table: "companies",
      join: "id = $2 AND $1::uuid = $1::uuid",
    },
    board_post: {
      table: "board_posts",
      join: "id = $1 AND company_id = $2 AND deleted_at IS NULL",
    },
  };
  const spec = map[target];
  const rows = await query<{ ok: boolean }>(
    `SELECT true AS ok FROM ${spec.table} WHERE ${spec.join} LIMIT 1`,
    [targetId, actor.companyId],
  );
  if (!rows[0])
    throw new AttachmentError("대상을 찾을 수 없거나 접근 권한이 없습니다.");
  await assertLinkScope(actor, target, targetId);
}

/**
 * 같은 회사라는 것만으로는 링크 방문자에게 충분하지 않다. 토큰이 가리키는
 * 작업지시(와 그 지시서에서 나온 부적합)에만 붙일 수 있어야 한다.
 */
/**
 * 승인된 판은 고치지 않는다 (0023). 단계 사진을 붙이거나 지우는 것도 개정 초안에서만.
 * 읽기는 어느 판이든 된다 — 옛 판 화면이 그때의 사진을 보여 준다.
 */
async function assertStepInDraft(stepId: string) {
  const rows = await query<{ status: string }>(
    `SELECT r.status FROM standard_steps ss
       JOIN standard_revisions r ON r.id = ss.revision_id
      WHERE ss.id = $1`,
    [stepId],
  );
  if (rows[0]?.status !== "DRAFT")
    throw new AttachmentError(
      "확정된 판의 사진은 고칠 수 없습니다. 개정을 시작한 뒤 초안에서 붙이거나 지우세요.",
    );
}

async function assertLinkScope(
  actor: ScopedActor,
  target: AttachmentTarget,
  targetId: string,
) {
  const scope = actor.linkWorkOrderId;
  if (!scope) return;
  // 공지 팝업은 링크 화면에도 뜨므로 그 안의 사진은 링크 방문자도 본다.
  // 올리는 쪽은 verifyActor 가 관리자만 통과시킨다.
  if (target === "board_post") return;
  if (!LINK_TARGETS.has(target))
    throw new AttachmentError("이 링크로 열 수 있는 문서가 아닙니다.");
  if (target === "work_order" && targetId !== scope)
    throw new AttachmentError("이 링크로 열 수 있는 작업지시가 아닙니다.");
  const inspectionScope: Partial<Record<AttachmentTarget, string>> = {
    inspection_result: `SELECT true AS ok FROM inspection_results r
         JOIN inspections i ON i.id = r.inspection_id
         JOIN work_sessions ws ON ws.id = i.session_id
        WHERE r.id = $1 AND ws.work_order_id = $2 LIMIT 1`,
    inspection_finding: `SELECT true AS ok FROM inspection_findings f
         JOIN inspection_results r ON r.id = f.result_id
         JOIN inspections i ON i.id = r.inspection_id
         JOIN work_sessions ws ON ws.id = i.session_id
        WHERE f.id = $1 AND ws.work_order_id = $2 LIMIT 1`,
  };
  const sql = inspectionScope[target];
  if (!sql) return;
  const rows = await query<{ ok: boolean }>(sql, [targetId, scope]);
  if (!rows[0])
    throw new AttachmentError("이 링크로 열 수 있는 작업지시가 아닙니다.");
}

const presignSchema = z
  .object({
    targetType: z.enum(TARGET_TYPES),
    targetId: z.string().uuid(),
    filename: z.string().min(1).max(200),
    mimeType: z.string().min(1).max(80),
    sizeBytes: z.number().int().positive(),
  })
  .superRefine((v, ctx) => {
    if (!mimeAllowed(v.targetType, v.mimeType))
      ctx.addIssue({ code: "custom", message: "지원하지 않는 파일 형식" });
    if (v.sizeBytes > maxBytesFor(v.targetType))
      ctx.addIssue({
        code: "custom",
        message: `파일이 너무 큽니다 (최대 ${formatBytes(maxBytesFor(v.targetType))})`,
      });
  });

/** 회사의 자료실 첨부 합계 — 1GB 를 넘기지 않는다. */
async function assertBoardQuota(companyId: string, adding: number) {
  const rows = await query<{ used: string }>(
    `SELECT coalesce(sum(size_bytes), 0)::text AS used FROM attachments
      WHERE company_id=$1 AND target_type='board_post'
        AND (status='READY' OR (status='PENDING' AND created_at > now() - interval '1 hour'))`,
    [companyId],
  );
  const used = Number(rows[0].used);
  if (used + adding > BOARD_STORAGE_LIMIT)
    throw new AttachmentError(
      `자료실 저장 공간이 부족합니다 (사용 ${formatBytes(used)} / ${formatBytes(BOARD_STORAGE_LIMIT)}). 오래된 첨부를 지우세요.`,
    );
}

/**
 * presigned PUT URL 발급 + attachments 행 PENDING 삽입.
 * 브라우저는 URL 로 직접 S3 업로드 후 confirmUpload 호출.
 */
export async function presignUpload(
  actor: ScopedActor,
  input: z.infer<typeof presignSchema>,
): Promise<{ attachmentId: string; uploadUrl: string; storageKey: string }> {
  const parsed = presignSchema.parse(input);
  await verifyActor(actor, parsed.targetType);
  await verifyTargetOwnership(actor, parsed.targetType, parsed.targetId);
  if (parsed.targetType === "standard_step")
    await assertStepInDraft(parsed.targetId);
  if (parsed.targetType === "board_post")
    await assertBoardQuota(actor.companyId, parsed.sizeBytes);

  const ext = EXTENSIONS[parsed.mimeType];
  const storageKey = `${actor.companyId}/${parsed.targetType}/${parsed.targetId}/${randomUUID()}${ext}`;

  const attachmentId = await withTransaction(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO attachments
         (company_id, target_type, target_id, storage_key,
          original_filename, mime_type, size_bytes, uploaded_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING')
       RETURNING id`,
      [
        actor.companyId,
        parsed.targetType,
        parsed.targetId,
        storageKey,
        parsed.filename,
        parsed.mimeType,
        parsed.sizeBytes,
        actor.userId,
      ],
    );
    return rows[0].id;
  });

  const uploadUrl = await getSignedUrl(
    s3(),
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: storageKey,
      ContentType: parsed.mimeType,
      ContentLength: parsed.sizeBytes,
    }),
    // 동영상은 느린 회선에서 오래 걸린다.
    { expiresIn: parsed.targetType === "board_post" ? 900 : 300 },
  );

  return { attachmentId, uploadUrl, storageKey };
}

/**
 * 업로드 완료 확인. S3 HeadObject 로 실제 파일 존재 검증 후 READY 승격.
 * width/height 는 클라이언트에서 미리 계산해 넘길 수 있음 (optional).
 */
export async function confirmUpload(
  actor: ScopedActor,
  attachmentId: string,
  meta?: { width?: number; height?: number; sizeBytes?: number },
): Promise<void> {
  const rows = await query<{
    storage_key: string;
    company_id: string;
    status: string;
    target_type: AttachmentTarget;
    target_id: string;
    mime_type: string;
    size_bytes: string;
    uploaded_by: string;
  }>(
    `SELECT storage_key, company_id, status, target_type, target_id, mime_type, size_bytes, uploaded_by FROM attachments WHERE id = $1`,
    [attachmentId],
  );
  const row = rows[0];
  if (!row || row.company_id !== actor.companyId)
    throw new AttachmentError("첨부를 찾을 수 없습니다.");
  const { role } = await verifyActor(actor, row.target_type);
  assertOwnAttachment(actor, role, row.uploaded_by);
  await verifyTargetOwnership(actor, row.target_type, row.target_id);
  if (row.status === "READY") return; // idempotent
  if (row.status !== "PENDING")
    throw new AttachmentError("잘못된 상태의 첨부입니다.");

  // S3 실제 존재 검증 (다른 사람이 URL 만 받고 안 올린 경우 방지)
  try {
    const head = await s3().send(
      new HeadObjectCommand({ Bucket: S3_BUCKET, Key: row.storage_key }),
    );
    const actualSize = Number(head.ContentLength ?? 0);
    if (
      !actualSize ||
      actualSize > maxBytesFor(row.target_type) ||
      actualSize !== Number(row.size_bytes) ||
      head.ContentType !== row.mime_type
    )
      throw new AttachmentError(
        "업로드된 파일의 크기 또는 형식이 요청과 다릅니다.",
      );
    await query(
      `UPDATE attachments
          SET status = 'READY',
              ready_at = now(),
              size_bytes = COALESCE($2, size_bytes),
              width = COALESCE($3, width),
              height = COALESCE($4, height)
        WHERE id = $1 AND status = 'PENDING'`,
      [attachmentId, actualSize, meta?.width ?? null, meta?.height ?? null],
    );
  } catch (error) {
    if (error instanceof AttachmentError) throw error;
    throw new AttachmentError("업로드 확인 실패. 다시 시도해 주세요.");
  }
}

export type AttachmentSummary = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  createdAt: string;
};

/** target 하나에 붙은 READY 첨부 목록. presigned GET URL 은 별도 호출. */
export async function listAttachments(
  actor: ScopedActor,
  target: AttachmentTarget,
  targetId: string,
): Promise<AttachmentSummary[]> {
  await verifyActor(actor, target, false);
  await verifyTargetOwnership(actor, target, targetId);
  const rows = await query<{
    id: string;
    original_filename: string;
    mime_type: string;
    size_bytes: string | null;
    width: number | null;
    height: number | null;
    created_at: string;
  }>(
    `SELECT id, original_filename, mime_type, size_bytes, width, height, created_at::text
       FROM attachments
      WHERE company_id = $1 AND target_type = $2 AND target_id = $3
        AND status = 'READY'
      ORDER BY created_at ASC`,
    [actor.companyId, target, targetId],
  );
  return rows.map((r) => ({
    id: r.id,
    filename: r.original_filename,
    mimeType: r.mime_type,
    sizeBytes: r.size_bytes ? Number(r.size_bytes) : null,
    width: r.width,
    height: r.height,
    createdAt: r.created_at,
  }));
}

/** 조회용 signed GET URL 발급. 짧은 TTL (5분). */
export async function presignRead(
  actor: ScopedActor,
  attachmentId: string,
): Promise<string> {
  const rows = await query<{
    storage_key: string;
    company_id: string;
    target_type: AttachmentTarget;
    target_id: string;
  }>(
    `SELECT storage_key, company_id, target_type, target_id FROM attachments
      WHERE id = $1 AND status = 'READY'`,
    [attachmentId],
  );
  const row = rows[0];
  if (!row || row.company_id !== actor.companyId)
    throw new AttachmentError("첨부를 찾을 수 없습니다.");
  await verifyActor(actor, row.target_type, false);
  await verifyTargetOwnership(actor, row.target_type, row.target_id);
  return getSignedUrl(
    s3(),
    new GetObjectCommand({ Bucket: S3_BUCKET, Key: row.storage_key }),
    { expiresIn: 300 },
  );
}

/**
 * Soft delete + best-effort S3 삭제.
 * S3 삭제 실패해도 DB 는 DELETED 로 마킹 (버킷 lifecycle 로 결국 정리).
 */
export async function deleteAttachment(
  actor: ScopedActor,
  attachmentId: string,
): Promise<void> {
  const rows = await query<{
    storage_key: string;
    company_id: string;
    target_type: AttachmentTarget;
    target_id: string;
    uploaded_by: string;
  }>(
    `SELECT storage_key, company_id, target_type, target_id, uploaded_by FROM attachments
      WHERE id = $1 AND status <> 'DELETED'`,
    [attachmentId],
  );
  const row = rows[0];
  if (!row || row.company_id !== actor.companyId)
    throw new AttachmentError("첨부를 찾을 수 없습니다.");
  const { role } = await verifyActor(actor, row.target_type, false);
  assertOwnAttachment(actor, role, row.uploaded_by);
  await verifyTargetOwnership(actor, row.target_type, row.target_id);
  if (row.target_type === "standard_step") await assertStepInDraft(row.target_id);
  await query(
    `UPDATE attachments SET status = 'DELETED', deleted_at = now() WHERE id = $1`,
    [attachmentId],
  );
  // 표준서 개정본이 같은 파일을 다른 단계로 가리킬 수 있다 (0023). 마지막 참조일
  // 때만 파일을 지운다 — 옛 판의 사진이 새 판에서 지웠다고 사라지면 안 된다.
  const others = await query<{ n: string }>(
    `SELECT count(*) AS n FROM attachments
      WHERE storage_key = $1 AND status <> 'DELETED'`,
    [row.storage_key],
  );
  if (Number(others[0]?.n ?? 0) > 0) return;
  try {
    await s3().send(
      new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: row.storage_key }),
    );
  } catch {
    /* silent - lifecycle 로 정리 */
  }
}

type Q = {
  query: <T = unknown>(
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: T[] }>;
};

/**
 * 대상이 사라질 때(단계 삭제·초안 버리기·표준서 폐기) 그 첨부를 DELETED 로 표시하고,
 * 이제 아무 행도 가리키지 않게 된 파일 키를 돌려준다. 트랜잭션 안에서 부르고 커밋
 * 뒤에 `deleteObjects` 로 파일을 지운다 — 롤백되면 파일은 그대로다. 개정본이 같은
 * 파일을 나눠 쓰므로(0023) 행만 보고 파일을 지우면 다른 판의 사진이 사라진다.
 */
export async function retireAttachments(
  client: Q,
  target: AttachmentTarget,
  targetIds: string[],
): Promise<string[]> {
  if (targetIds.length === 0) return [];
  const gone = await client.query<{ storage_key: string }>(
    `UPDATE attachments SET status = 'DELETED', deleted_at = now()
      WHERE target_type = $1 AND target_id = ANY($2::uuid[]) AND status <> 'DELETED'
      RETURNING storage_key`,
    [target, targetIds],
  );
  const keys = [...new Set(gone.rows.map((r) => r.storage_key))];
  if (keys.length === 0) return [];
  const live = await client.query<{ storage_key: string }>(
    `SELECT DISTINCT storage_key FROM attachments
      WHERE storage_key = ANY($1::text[]) AND status <> 'DELETED'`,
    [keys],
  );
  const stillUsed = new Set(live.rows.map((r) => r.storage_key));
  return keys.filter((k) => !stillUsed.has(k));
}

/** best-effort S3 삭제. 실패해도 버킷 lifecycle 이 결국 정리한다. */
export async function deleteObjects(keys: string[]): Promise<void> {
  for (const key of keys) {
    try {
      await s3().send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    } catch {
      /* lifecycle */
    }
  }
}

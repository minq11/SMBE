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

export type Actor = { companyId: string; userId: string };

export const TARGET_TYPES = [
  "standard_step",
  "risk_item_before",
  "risk_item_after",
  "work_order",
  "inspection_finding",
  "incident",
] as const;
export type AttachmentTarget = (typeof TARGET_TYPES)[number];

/**
 * 작업자가 다룰 수 있는 대상. 표준서·위험성평가는 관리자가 쓰는 문서라 제외한다.
 * 역할은 "첨부할 수 있는가"가 아니라 "어떤 문서에 붙이는가"만 가른다.
 */
const WORKER_TARGETS: ReadonlySet<AttachmentTarget> = new Set([
  "work_order",
  "inspection_finding",
]);

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB (클라이언트 압축 후 여유 있게)
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);

export class AttachmentError extends Error {}

/** 회사 멤버십 + Pro 여부 조회. RBAC 게이트. */
async function verifyActor(
  actor: Actor,
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
  // 사진 첨부 가능 여부는 요금제만 가른다. 작업자도 Pro 회사면 첨부할 수 있다.
  if (upload && !pro)
    throw new AttachmentError("사진 첨부는 Pro 요금제에서 이용할 수 있습니다.");
  if (row.role === "WORKER" && !WORKER_TARGETS.has(target))
    throw new AttachmentError(
      "작업자는 작업지시와 점검 부적합에만 첨부할 수 있습니다.",
    );
  return { role: row.role, pro };
}

/**
 * 작업자는 본인이 올린 첨부만 확정·삭제할 수 있다.
 * 관리자는 현장 기록을 정리해야 하므로 회사 내 첨부를 다룰 수 있다.
 */
function assertOwnAttachment(actor: Actor, role: string, uploadedBy: string) {
  if (role === "WORKER" && uploadedBy !== actor.userId)
    throw new AttachmentError("본인이 올린 첨부만 처리할 수 있습니다.");
}

/**
 * 대상 엔티티가 실제로 이 회사 소속인지 검증. cross-tenant 오염 방지.
 * (composite FK 를 attachments 에 걸 수 없어 앱단에서 강제)
 */
async function verifyTargetOwnership(
  actor: Actor,
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
  };
  const spec = map[target];
  const rows = await query<{ ok: boolean }>(
    `SELECT true AS ok FROM ${spec.table} WHERE ${spec.join} LIMIT 1`,
    [targetId, actor.companyId],
  );
  if (!rows[0])
    throw new AttachmentError("대상을 찾을 수 없거나 접근 권한이 없습니다.");
}

const presignSchema = z.object({
  targetType: z.enum(TARGET_TYPES),
  targetId: z.string().uuid(),
  filename: z.string().min(1).max(200),
  mimeType: z
    .string()
    .refine((m) => ALLOWED_MIME.has(m), { message: "지원하지 않는 파일 형식" }),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(MAX_UPLOAD_BYTES, "파일이 너무 큽니다 (최대 10MB)"),
});

/**
 * presigned PUT URL 발급 + attachments 행 PENDING 삽입.
 * 브라우저는 URL 로 직접 S3 업로드 후 confirmUpload 호출.
 */
export async function presignUpload(
  actor: Actor,
  input: z.infer<typeof presignSchema>,
): Promise<{ attachmentId: string; uploadUrl: string; storageKey: string }> {
  const parsed = presignSchema.parse(input);
  await verifyActor(actor, parsed.targetType);
  await verifyTargetOwnership(actor, parsed.targetType, parsed.targetId);

  const ext = (
    {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
      "image/heic": ".heic",
    } as Record<string, string>
  )[parsed.mimeType];
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
    { expiresIn: 300 },
  );

  return { attachmentId, uploadUrl, storageKey };
}

/**
 * 업로드 완료 확인. S3 HeadObject 로 실제 파일 존재 검증 후 READY 승격.
 * width/height 는 클라이언트에서 미리 계산해 넘길 수 있음 (optional).
 */
export async function confirmUpload(
  actor: Actor,
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
      actualSize > MAX_UPLOAD_BYTES ||
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
  actor: Actor,
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
  actor: Actor,
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
  actor: Actor,
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
  await query(
    `UPDATE attachments SET status = 'DELETED', deleted_at = now() WHERE id = $1`,
    [attachmentId],
  );
  try {
    await s3().send(
      new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: row.storage_key }),
    );
  } catch {
    /* silent - lifecycle 로 정리 */
  }
}

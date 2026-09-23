import type { PoolClient } from "@neondatabase/serverless";
import { z } from "zod";
import { memberAccess, type Actor } from "./work-order-service";
import { seoulToday } from "../features/work-orders/model";
import {
  BoardError,
  EMPTY_DOC,
  docAttachmentIds,
  docText,
  parseDoc,
  type BoardDoc,
  type BoardKind,
  type PostDetail,
  type PostSummary,
} from "../features/board/model";

/**
 * 통합자료실 — 공지사항·자료실.
 *
 * 쓰기는 관리자(관리감독자·안전관리자), 읽기는 회사 구성원 전원. 초안은 회사의
 * 관리자 모두가 보고 이어 쓴다. 발행된 글도 관리자가 고칠 수 있다 — 공지는
 * 틀리면 바로 고쳐야지 새로 올리는 것이 아니다.
 *
 * 글을 먼저 만들고(초안) 편집 화면으로 간다. 사진·동영상 첨부는 붙일 대상
 * (글 id)이 있어야 하기 때문이다. 지시서 초안과 같은 흐름이다.
 */

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();

export async function createDraft(
  client: PoolClient,
  actor: Actor,
  kind: BoardKind,
): Promise<string> {
  await memberAccess(client, actor, true);
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO board_posts (company_id, kind, created_by, updated_by)
     VALUES ($1, $2, $3, $3) RETURNING id`,
    [actor.companyId, kind, actor.userId],
  );
  return rows[0].id;
}

export type SaveInput = {
  id: string;
  title: string;
  body: unknown;
  popup?: boolean;
  popupFrom?: string | null;
  popupUntil?: string | null;
  /** true 면 발행 (이미 발행된 글은 그대로 발행 상태). */
  publish: boolean;
};

export type SaveResult = {
  id: string;
  kind: BoardKind;
  /** 이번 저장으로 처음 발행됐고, 유료 회사라 푸시를 보내야 한다. */
  notify: { title: string; body: string } | null;
};

export async function savePost(
  client: PoolClient,
  actor: Actor,
  input: SaveInput,
): Promise<SaveResult> {
  const access = await memberAccess(client, actor, true);
  const { rows } = await client.query<{
    kind: BoardKind;
    status: "DRAFT" | "PUBLISHED";
    push_sent_at: string | null;
  }>(
    `SELECT kind, status, push_sent_at FROM board_posts
      WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL FOR UPDATE`,
    [input.id, actor.companyId],
  );
  const post = rows[0];
  if (!post) throw new BoardError("글을 찾을 수 없습니다.");

  const title = input.title.trim();
  if (input.publish && !title) throw new BoardError("제목을 입력하세요.");
  if (title.length > 120) throw new BoardError("제목은 120자까지입니다.");
  const body = parseDoc(input.body);
  await assertAttachmentsOwned(client, actor.companyId, input.id, body);

  const popup = post.kind === "NOTICE" && Boolean(input.popup);
  const from = popup
    ? (dateSchema.parse(input.popupFrom ?? null) ?? null)
    : null;
  const until = popup
    ? (dateSchema.parse(input.popupUntil ?? null) ?? null)
    : null;
  if (from && until && from > until)
    throw new BoardError("공지 기간의 시작일이 종료일보다 늦습니다.");

  const publishNow = input.publish && post.status === "DRAFT";
  await client.query(
    `UPDATE board_posts
        SET title=$3, body=$4, popup=$5, popup_from=$6, popup_until=$7,
            status = CASE WHEN $8 THEN 'PUBLISHED' ELSE status END,
            published_at = CASE WHEN $8 AND published_at IS NULL THEN now() ELSE published_at END,
            updated_by=$2, updated_at=now()
      WHERE id=$1`,
    [
      input.id,
      actor.userId,
      title,
      JSON.stringify(body),
      popup,
      from,
      until,
      input.publish,
    ],
  );

  const notify =
    publishNow && access.pro_state !== "FREE" && !post.push_sent_at
      ? { title, body: docText(body, 80) }
      : null;
  if (notify)
    await client.query(
      "UPDATE board_posts SET push_sent_at = now() WHERE id=$1",
      [input.id],
    );
  return { id: input.id, kind: post.kind, notify };
}

/** 본문이 가리키는 첨부가 이 글에 붙은 것인지 확인한다. 남의 회사 첨부를 끼워
 *  넣어 서명 URL 을 얻는 길을 막는다. */
async function assertAttachmentsOwned(
  client: PoolClient,
  companyId: string,
  postId: string,
  body: BoardDoc,
) {
  const ids = docAttachmentIds(body);
  if (!ids.length) return;
  const { rows } = await client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM attachments
      WHERE id = ANY($1::uuid[]) AND company_id=$2
        AND target_type='board_post' AND target_id=$3 AND status='READY'`,
    [ids, companyId, postId],
  );
  if (rows[0].n !== ids.length)
    throw new BoardError("본문에 이 글의 첨부가 아닌 파일이 있습니다.");
}

export async function deletePost(
  client: PoolClient,
  actor: Actor,
  id: string,
): Promise<BoardKind> {
  await memberAccess(client, actor, true);
  const { rows } = await client.query<{ kind: BoardKind }>(
    `UPDATE board_posts SET deleted_at=now(), updated_by=$3, updated_at=now()
      WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL RETURNING kind`,
    [id, actor.companyId, actor.userId],
  );
  if (!rows[0]) throw new BoardError("글을 찾을 수 없습니다.");
  // 첨부는 DELETED 로만 표시한다. 버킷 정리는 lifecycle 의 몫이다.
  await client.query(
    `UPDATE attachments SET status='DELETED', deleted_at=now()
      WHERE company_id=$1 AND target_type='board_post' AND target_id=$2 AND status<>'DELETED'`,
    [actor.companyId, id],
  );
  return rows[0].kind;
}

const summarySelect = `
  SELECT p.id, p.kind, p.status, p.title, p.body, p.popup,
         p.popup_from::text, p.popup_until::text,
         u.display_name AS author, p.published_at::text, p.updated_at::text,
         EXISTS (SELECT 1 FROM attachments a
                  WHERE a.target_type='board_post' AND a.target_id=p.id AND a.status='READY') AS has_media
    FROM board_posts p JOIN users u ON u.id = p.created_by`;

type SummaryRow = Omit<PostSummary, "excerpt"> & { body: BoardDoc };

const toSummary = (r: SummaryRow): PostSummary => {
  const { body, ...rest } = r;
  return { ...rest, excerpt: docText(body) };
};

/** 발행된 글 (구성원 전원) + 초안 (관리자만). */
export async function listPosts(
  client: PoolClient,
  actor: Actor,
  kind: BoardKind,
): Promise<{
  published: PostSummary[];
  drafts: PostSummary[];
  manager: boolean;
}> {
  const access = await memberAccess(client, actor);
  const manager = access.role !== "WORKER";
  const { rows } = await client.query<SummaryRow>(
    `${summarySelect}
      WHERE p.company_id=$1 AND p.kind=$2 AND p.deleted_at IS NULL
        AND (p.status='PUBLISHED' OR $3)
      ORDER BY p.status DESC, p.published_at DESC NULLS LAST, p.updated_at DESC
      LIMIT 200`,
    [actor.companyId, kind, manager],
  );
  const all = rows.map(toSummary);
  return {
    published: all.filter((p) => p.status === "PUBLISHED"),
    drafts: all.filter((p) => p.status === "DRAFT"),
    manager,
  };
}

export async function readPost(
  client: PoolClient,
  actor: Actor,
  id: string,
): Promise<{ post: PostDetail; manager: boolean }> {
  const access = await memberAccess(client, actor);
  const manager = access.role !== "WORKER";
  const { rows } = await client.query<PostDetail>(
    `SELECT p.id, p.kind, p.status, p.title, p.body, p.popup,
            p.popup_from::text, p.popup_until::text,
            u.display_name AS author, p.created_by,
            p.published_at::text, p.updated_at::text
       FROM board_posts p JOIN users u ON u.id = p.created_by
      WHERE p.id=$1 AND p.company_id=$2 AND p.deleted_at IS NULL
        AND (p.status='PUBLISHED' OR $3)`,
    [id, actor.companyId, manager],
  );
  if (!rows[0]) throw new BoardError("글을 찾을 수 없습니다.");
  const post = rows[0];
  // 옛 행에 이상한 본문이 남아 있어도 화면은 열려야 한다.
  try {
    post.body = parseDoc(post.body);
  } catch {
    post.body = EMPTY_DOC;
  }
  return { post, manager };
}

export type PopupNotice = {
  id: string;
  title: string;
  body: BoardDoc;
  published_at: string | null;
};

/** 오늘 팝업으로 띄울 공지. 홈·작업자 링크 화면이 부른다. 회사 소속 확인은
 *  부르는 쪽이 이미 했다 (세션 또는 링크 토큰). */
export async function activePopupNotices(
  client: PoolClient,
  companyId: string,
  today = seoulToday(),
): Promise<PopupNotice[]> {
  const { rows } = await client.query<PopupNotice>(
    `SELECT id, title, body, published_at::text
       FROM board_posts
      WHERE company_id=$1 AND kind='NOTICE' AND status='PUBLISHED'
        AND deleted_at IS NULL AND popup
        AND (popup_from IS NULL OR popup_from <= $2::date)
        AND (popup_until IS NULL OR popup_until >= $2::date)
      ORDER BY published_at DESC LIMIT 5`,
    [companyId, today],
  );
  return rows.flatMap((r) => {
    try {
      return [{ ...r, body: parseDoc(r.body) }];
    } catch {
      return [];
    }
  });
}

/** 회사의 자료실 첨부 합계 (READY + 한 시간 안의 PENDING). */
export async function boardStorageUsed(
  client: PoolClient,
  companyId: string,
): Promise<number> {
  const { rows } = await client.query<{ used: string }>(
    `SELECT coalesce(sum(size_bytes), 0)::text AS used FROM attachments
      WHERE company_id=$1 AND target_type='board_post'
        AND (status='READY' OR (status='PENDING' AND created_at > now() - interval '1 hour'))`,
    [companyId],
  );
  return Number(rows[0].used);
}

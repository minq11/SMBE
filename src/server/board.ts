import type { PoolClient } from "@neondatabase/serverless";
import { z } from "zod";
import { memberAccess, type Actor } from "./work-order-service";
import { seoulToday } from "../features/work-orders/model";
import {
  BoardError,
  EMPTY_DOC,
  docAttachmentIds,
  docText,
  isGlobalKind,
  parseDoc,
  popupAllowed,
  type BoardDoc,
  type BoardKind,
  type PostBrief,
  type PostDetail,
  type PostSummary,
} from "../features/board/model";

/**
 * 통합자료실 — 공지사항·자료실·오늘의 안전소식.
 *
 * 공지·자료는 회사 안의 글이다. 쓰기는 관리자(관리감독자·안전관리자), 읽기는 회사
 * 구성원 전원. 초안은 회사의 관리자 모두가 보고 이어 쓴다. 발행된 글도 관리자가
 * 고칠 수 있다 — 공지는 틀리면 바로 고쳐야지 새로 올리는 것이 아니다.
 *
 * 오늘의 안전소식은 회사가 없는 글이다 (company_id NULL). 심플안전 운영자만 쓰고
 * 모든 회사의 구성원이 읽는다. 운영자 여부는 부르는 쪽이 `actor.operator` 로
 * 넘긴다 (SMBE_OPERATOR_EMAILS, src/server/operator.ts).
 *
 * 글을 먼저 만들고(초안) 편집 화면으로 간다. 사진·동영상 첨부는 붙일 대상
 * (글 id)이 있어야 하기 때문이다. 지시서 초안과 같은 흐름이다.
 */

export type BoardActor = Actor & { operator?: boolean };

/** 글 하나에 쓸 수 있는가. 회사 글은 그 회사 관리자, 안전소식은 운영자. */
const writeWhere = `p.deleted_at IS NULL AND (
  (p.kind <> 'NEWS' AND p.company_id = $2) OR (p.kind = 'NEWS' AND $3)
)`;

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();

export async function createDraft(
  client: PoolClient,
  actor: BoardActor,
  kind: BoardKind,
): Promise<string> {
  const global = isGlobalKind(kind);
  if (global && !actor.operator)
    throw new BoardError("오늘의 안전소식은 심플안전 운영자만 씁니다.");
  await memberAccess(client, actor, !global);
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO board_posts (company_id, kind, created_by, updated_by)
     VALUES ($1, $2, $3, $3) RETURNING id`,
    [global ? null : actor.companyId, kind, actor.userId],
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
  actor: BoardActor,
  input: SaveInput,
): Promise<SaveResult> {
  const access = await memberAccess(client, actor, !actor.operator);
  const { rows } = await client.query<{
    kind: BoardKind;
    status: "DRAFT" | "PUBLISHED";
    push_sent_at: string | null;
  }>(
    `SELECT p.kind, p.status, p.push_sent_at FROM board_posts p
      WHERE p.id=$1 AND ${writeWhere} FOR UPDATE`,
    [input.id, actor.companyId, Boolean(actor.operator)],
  );
  const post = rows[0];
  if (!post) throw new BoardError("글을 찾을 수 없습니다.");
  if (!isGlobalKind(post.kind) && access.role === "WORKER")
    throw new BoardError("글쓰기는 관리자만 할 수 있습니다.");

  const title = input.title.trim();
  if (input.publish && !title) throw new BoardError("제목을 입력하세요.");
  if (title.length > 120) throw new BoardError("제목은 120자까지입니다.");
  const body = parseDoc(input.body);
  await assertAttachmentsOwned(client, actor.companyId, input.id, body);

  const popup = popupAllowed(post.kind) && Boolean(input.popup);
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

  // 푸시는 회사 글에만. 안전소식은 모든 회사에 가는 글이라 기기마다 울리면 잡음이다.
  const notify =
    publishNow &&
    !isGlobalKind(post.kind) &&
    access.pro_state !== "FREE" &&
    !post.push_sent_at
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
  actor: BoardActor,
  id: string,
): Promise<BoardKind> {
  const access = await memberAccess(client, actor, !actor.operator);
  const { rows } = await client.query<{ kind: BoardKind }>(
    `UPDATE board_posts p SET deleted_at=now(), updated_by=$4, updated_at=now()
      WHERE p.id=$1 AND ${writeWhere} RETURNING kind`,
    [id, actor.companyId, Boolean(actor.operator), actor.userId],
  );
  if (!rows[0]) throw new BoardError("글을 찾을 수 없습니다.");
  if (!isGlobalKind(rows[0].kind) && access.role === "WORKER")
    throw new BoardError("글쓰기는 관리자만 할 수 있습니다.");
  // 첨부는 DELETED 로만 표시한다. 버킷 정리는 lifecycle 의 몫이다.
  await client.query(
    `UPDATE attachments SET status='DELETED', deleted_at=now()
      WHERE target_type='board_post' AND target_id=$1 AND status<>'DELETED'`,
    [id],
  );
  return rows[0].kind;
}

// 안전소식의 작성자는 사람 이름이 아니라 "심플안전" — 다른 회사에는 그 이름이 남이다.
const authorExpr = `CASE WHEN p.kind = 'NEWS' THEN '심플안전' ELSE u.display_name END`;

const summarySelect = `
  SELECT p.id, p.kind, p.status, p.title, p.body, p.popup,
         p.popup_from::text, p.popup_until::text,
         ${authorExpr} AS author, p.published_at::text, p.updated_at::text,
         EXISTS (SELECT 1 FROM attachments a
                  WHERE a.target_type='board_post' AND a.target_id=p.id AND a.status='READY') AS has_media
    FROM board_posts p JOIN users u ON u.id = p.created_by`;

type SummaryRow = Omit<PostSummary, "excerpt"> & { body: BoardDoc };

const toSummary = (r: SummaryRow): PostSummary => {
  const { body, ...rest } = r;
  return { ...rest, excerpt: docText(body) };
};

/** 이 글 종류에 쓸 수 있는 사람인가. 회사 글은 관리자, 안전소식은 운영자. */
const canWrite = (actor: BoardActor, kind: BoardKind, role: string) =>
  isGlobalKind(kind) ? Boolean(actor.operator) : role !== "WORKER";

/** 회사 글은 그 회사 것만, 안전소식은 회사를 가리지 않는다. */
const kindWhere = `p.deleted_at IS NULL AND p.kind = $2
  AND (p.kind = 'NEWS' OR p.company_id = $1)`;

/** 발행된 글 (구성원 전원) + 초안 (쓸 수 있는 사람만). */
export async function listPosts(
  client: PoolClient,
  actor: BoardActor,
  kind: BoardKind,
): Promise<{
  published: PostSummary[];
  drafts: PostSummary[];
  /** 글쓰기·고치기가 보이는가. */
  manager: boolean;
}> {
  const access = await memberAccess(client, actor);
  const manager = canWrite(actor, kind, access.role);
  const { rows } = await client.query<SummaryRow>(
    `${summarySelect}
      WHERE ${kindWhere} AND (p.status='PUBLISHED' OR $3)
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
  actor: BoardActor,
  id: string,
): Promise<{ post: PostDetail; manager: boolean }> {
  const access = await memberAccess(client, actor);
  const { rows } = await client.query<PostDetail>(
    `SELECT p.id, p.kind, p.status, p.title, p.body, p.popup,
            p.popup_from::text, p.popup_until::text,
            ${authorExpr} AS author, p.created_by,
            p.published_at::text, p.updated_at::text
       FROM board_posts p JOIN users u ON u.id = p.created_by
      WHERE p.id=$1 AND p.deleted_at IS NULL
        AND (p.kind = 'NEWS' OR p.company_id = $2)`,
    [id, actor.companyId],
  );
  const post = rows[0];
  if (!post) throw new BoardError("글을 찾을 수 없습니다.");
  const manager = canWrite(actor, post.kind, access.role);
  // 초안은 쓸 수 있는 사람에게만 있다.
  if (post.status !== "PUBLISHED" && !manager)
    throw new BoardError("글을 찾을 수 없습니다.");
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
  kind: BoardKind;
  title: string;
  body: BoardDoc;
  published_at: string | null;
};

/** 오늘 팝업으로 띄울 글 — 우리 회사 공지와 안전소식. 홈·작업자 링크 화면이
 *  부른다. 회사 소속 확인은 부르는 쪽이 이미 했다 (세션 또는 링크 토큰). */
export async function activePopupNotices(
  client: PoolClient,
  companyId: string,
  today = seoulToday(),
): Promise<PopupNotice[]> {
  const { rows } = await client.query<PopupNotice>(
    `SELECT id, kind, title, body, published_at::text
       FROM board_posts
      WHERE ((kind='NOTICE' AND company_id=$1) OR kind='NEWS')
        AND status='PUBLISHED' AND deleted_at IS NULL AND popup
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

/** 홈에 보이는 최신 글 — 우리 회사 공지 두 건, 안전소식 두 건. */
export async function homePosts(
  client: PoolClient,
  companyId: string,
  limit = 2,
): Promise<{ notices: PostBrief[]; news: PostBrief[] }> {
  const pick = async (kind: BoardKind) => {
    const { rows } = await client.query<{
      id: string;
      title: string;
      body: BoardDoc;
      published_at: string | null;
    }>(
      `SELECT id, title, body, published_at::text FROM board_posts
        WHERE kind=$2 AND (kind='NEWS' OR company_id=$1)
          AND status='PUBLISHED' AND deleted_at IS NULL
        ORDER BY published_at DESC LIMIT $3`,
      [companyId, kind, limit],
    );
    return rows.map((r) => {
      let excerpt = "";
      try {
        excerpt = docText(parseDoc(r.body), 60);
      } catch {
        /* 옛 행의 이상한 본문은 요약 없이 제목만 */
      }
      return {
        id: r.id,
        title: r.title,
        excerpt,
        published_at: r.published_at,
      };
    });
  };
  return { notices: await pick("NOTICE"), news: await pick("NEWS") };
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

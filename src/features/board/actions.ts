"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/session";
import { isCurrentUserOperator } from "@/server/operator";
import { withTransaction } from "@/server/db";
import {
  boardStorageUsed,
  createDraft,
  deletePost,
  savePost,
} from "@/server/board";
import { pushToCompany } from "@/server/push";
import { WorkOrderError } from "@/features/work-orders/model";
import {
  BOARD_STORAGE_LIMIT,
  BoardError,
  KIND_BY_SLUG,
  KIND_LABEL,
  SLUG_BY_KIND,
  isKindSlug,
  type BoardKindSlug,
} from "./model";

export type BoardActionState =
  { error?: string; message?: string; savedAt?: string } | undefined;

async function actor() {
  const s = await getCurrentSession();
  if (!s?.membership || s.membership.status !== "ACTIVE")
    throw new BoardError("로그인과 회사 소속을 확인하세요.");
  // 역할 검사는 글 종류를 아는 서버 쪽(board.ts)이 한다 — 회사 글은 관리자,
  // 안전소식은 운영자.
  return {
    companyId: s.membership.company_id,
    userId: s.user.id,
    operator: await isCurrentUserOperator(),
  };
}

function message(error: unknown): string {
  return error instanceof BoardError || error instanceof WorkOrderError
    ? error.message
    : "처리하지 못했습니다. 잠시 후 다시 시도하세요.";
}

function refresh(kind: BoardKindSlug, id?: string) {
  revalidatePath("/board/" + kind);
  if (id) {
    revalidatePath(`/board/${kind}/${id}`);
    revalidatePath(`/board/${kind}/${id}/edit`);
  }
  revalidatePath("/");
}

/** 글쓰기 단추. 초안을 만들고 편집 화면으로 간다. */
export async function createPostAction(form: FormData): Promise<void> {
  const slug = String(form.get("kind") ?? "");
  if (!isKindSlug(slug)) throw new BoardError("잘못된 게시판입니다.");
  const context = await actor();
  const id = await withTransaction((c) =>
    createDraft(c, context, KIND_BY_SLUG[slug]),
  );
  refresh(slug);
  redirect(`/board/${slug}/${id}/edit`);
}

export type SavePayload = {
  id: string;
  title: string;
  body: unknown;
  popup: boolean;
  popupFrom: string | null;
  popupUntil: string | null;
  publish: boolean;
};

export async function savePostAction(
  payload: SavePayload,
): Promise<
  | { ok: true; published: boolean; pushed: number }
  | { ok: false; error: string }
> {
  try {
    const context = await actor();
    const result = await withTransaction((c) => savePost(c, context, payload));
    const slug = SLUG_BY_KIND[result.kind];
    let pushed = 0;
    if (result.notify) {
      // 커밋 뒤에 보낸다. 실패해도 발행은 끝났다.
      const sent = await pushToCompany(
        context.companyId,
        {
          title: `[${KIND_LABEL[result.kind]}] ${result.notify.title}`,
          body: result.notify.body,
          path: `/board/${slug}/${result.id}`,
          tag: "board-" + result.id,
        },
        { exceptUserId: context.userId },
      ).catch(() => ({ sent: 0 }));
      pushed = sent.sent;
    }
    refresh(slug, result.id);
    return { ok: true, published: payload.publish, pushed };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export async function deletePostAction(
  id: string,
): Promise<{ ok: true; kind: BoardKindSlug } | { ok: false; error: string }> {
  try {
    const context = await actor();
    const kind = await withTransaction((c) => deletePost(c, context, id));
    refresh(SLUG_BY_KIND[kind], id);
    return { ok: true, kind: SLUG_BY_KIND[kind] };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export async function boardUsageAction(): Promise<{
  used: number;
  limit: number;
}> {
  const context = await actor();
  const used = await withTransaction((c) =>
    boardStorageUsed(c, context.companyId),
  );
  return { used, limit: BOARD_STORAGE_LIMIT };
}

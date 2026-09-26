import { notFound } from "next/navigation";
import { z } from "zod";
import { withTransaction } from "@/server/db";
import { boardStorageUsed, readPost } from "@/server/board";
import { BoardShell } from "@/features/board/board-shell";
import { boardSession } from "@/features/board/board-session";
import { PostForm } from "@/features/board/post-form";
import {
  BOARD_STORAGE_LIMIT,
  BoardError,
  KIND_BY_SLUG,
  KIND_LABEL,
  isKindSlug,
} from "@/features/board/model";
import "@/features/board/board.css";

export const metadata = { title: "글 편집 · 심플안전" };

export default async function BoardEditPage({
  params,
}: {
  params: Promise<{ kind: string; id: string }>;
}) {
  const { kind, id } = await params;
  if (!isKindSlug(kind) || !z.string().uuid().safeParse(id).success) notFound();
  const { session, actor } = await boardSession(`/board/${kind}/${id}/edit`);
  const data = await withTransaction((c) => readPost(c, actor, id)).catch(
    (error) => {
      if (error instanceof BoardError) return null;
      throw error;
    },
  );
  if (!data || data.post.kind !== KIND_BY_SLUG[kind]) notFound();
  // 쓸 수 없는 사람에게는 편집 화면이 없다 (안전소식은 운영자만).
  if (!data.manager) notFound();
  // 안전소식 첨부는 심플안전이 올리는 것이라 회사 요금제와 무관하다.
  const canAttach =
    data.post.kind === "NEWS" || session.membership!.pro_state !== "FREE";
  const usage = canAttach
    ? {
        used: await withTransaction((c) =>
          boardStorageUsed(c, actor.companyId),
        ),
        limit: BOARD_STORAGE_LIMIT,
      }
    : null;

  return (
    <BoardShell
      session={session}
      kind={kind}
      title={
        data.post.status === "DRAFT"
          ? `${KIND_LABEL[data.post.kind]} 쓰기`
          : "글 고치기"
      }
    >
      <PostForm post={data.post} canAttach={canAttach} usage={usage} />
    </BoardShell>
  );
}

import { notFound } from "next/navigation";
import { z } from "zod";
import { withTransaction } from "@/server/db";
import { workSession } from "@/server/work-orders";
import { boardStorageUsed, readPost } from "@/server/board";
import { BoardShell } from "@/features/board/board-shell";
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
  const { session, actor } = await workSession(
    `/board/${kind}/${id}/edit`,
    true,
  );
  const data = await withTransaction((c) => readPost(c, actor, id)).catch(
    (error) => {
      if (error instanceof BoardError) return null;
      throw error;
    },
  );
  if (!data || data.post.kind !== KIND_BY_SLUG[kind]) notFound();
  const canAttach = session.membership!.pro_state !== "FREE";
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

import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PenLine } from "lucide-react";
import { withTransaction } from "@/server/db";
import { workSession } from "@/server/work-orders";
import { readPost } from "@/server/board";
import { PageHeader } from "@/components/ui/page-header";
import { BoardShell } from "@/features/board/board-shell";
import {
  BoardError,
  KIND_BY_SLUG,
  isKindSlug,
  postDate,
  renderDoc,
} from "@/features/board/model";
import "@/features/board/board.css";

export const metadata = { title: "통합자료실 · 심플안전" };

export default async function BoardPostPage({
  params,
}: {
  params: Promise<{ kind: string; id: string }>;
}) {
  const { kind, id } = await params;
  if (!isKindSlug(kind) || !z.string().uuid().safeParse(id).success) notFound();
  const { session, actor } = await workSession(`/board/${kind}/${id}`);
  const data = await withTransaction((c) => readPost(c, actor, id)).catch(
    (error) => {
      if (error instanceof BoardError) return null;
      throw error;
    },
  );
  if (!data || data.post.kind !== KIND_BY_SLUG[kind]) notFound();
  const { post, manager } = data;

  return (
    <BoardShell session={session} kind={kind} title={post.title}>
      <PageHeader
        title={post.title}
        description={
          <span className="board-post-meta">
            {post.author} · {postDate(post.published_at ?? post.updated_at)}
            {post.status === "DRAFT" && " · 작성 중"}
            {post.popup && " · 팝업 공지"}
            {post.popup && (post.popup_from || post.popup_until) && (
              <>
                {" "}
                ({post.popup_from ?? "…"} ~ {post.popup_until ?? "…"})
              </>
            )}
          </span>
        }
        actions={
          manager ? (
            <Link href={`/board/${kind}/${id}/edit`} className="btn-secondary">
              <PenLine size={15} /> 고치기
            </Link>
          ) : undefined
        }
      />
      <article
        className="board-content board-post"
        dangerouslySetInnerHTML={{ __html: renderDoc(post.body) }}
      />
    </BoardShell>
  );
}

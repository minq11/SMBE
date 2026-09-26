import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PenLine } from "lucide-react";
import { withTransaction } from "@/server/db";
import { readPost } from "@/server/board";
import { BoardShell } from "@/features/board/board-shell";
import { boardSession } from "@/features/board/board-session";
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
  const { session, actor } = await boardSession(`/board/${kind}/${id}`);
  const data = await withTransaction((c) => readPost(c, actor, id)).catch(
    (error) => {
      if (error instanceof BoardError) return null;
      throw error;
    },
  );
  if (!data || data.post.kind !== KIND_BY_SLUG[kind]) notFound();
  const { post, manager } = data;

  return (
    // 상단바는 게시판 이름(공지사항·자료실). 제목은 문서의 일부라 본문 위에 둔다.
    <BoardShell session={session} kind={kind}>
      <div className="board-post-head">
        <h1 className="board-post-title">{post.title}</h1>
        <p className="board-post-meta">
          <span>
            {post.author} · {postDate(post.published_at ?? post.updated_at)}
          </span>
          {post.status === "DRAFT" && (
            <span className="board-tag">작성 중</span>
          )}
          {post.popup && (
            <span className="board-tag">
              팝업
              {(post.popup_from || post.popup_until) &&
                ` ${post.popup_from ?? "…"} ~ ${post.popup_until ?? "…"}`}
            </span>
          )}
          {manager && (
            <Link
              href={`/board/${kind}/${id}/edit`}
              className="board-post-edit"
            >
              <PenLine size={13} /> 고치기
            </Link>
          )}
        </p>
      </div>
      <article
        className="board-content board-post"
        dangerouslySetInnerHTML={{ __html: renderDoc(post.body) }}
      />
    </BoardShell>
  );
}

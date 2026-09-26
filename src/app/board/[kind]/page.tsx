import Link from "next/link";
import { notFound } from "next/navigation";
import {
  FolderOpen,
  Megaphone,
  Newspaper,
  Paperclip,
  PenLine,
} from "lucide-react";
import { withTransaction } from "@/server/db";
import { listPosts } from "@/server/board";
import { Pager } from "@/components/ui/pager";
import { pageOf, parsePage } from "@/lib/paging";
import { PageHeader } from "@/components/ui/page-header";
import { BoardShell } from "@/features/board/board-shell";
import { boardSession } from "@/features/board/board-session";
import { createPostAction } from "@/features/board/actions";
import {
  KIND_BY_SLUG,
  KIND_LABEL,
  isKindSlug,
  postDate,
  type PostSummary,
} from "@/features/board/model";
import "@/features/board/board.css";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ kind: string }>;
}) {
  const { kind } = await params;
  return {
    title: `${isKindSlug(kind) ? KIND_LABEL[KIND_BY_SLUG[kind]] : "통합자료실"} · 심플안전`,
  };
}

const DESCRIPTION = {
  NOTICE: "회사 구성원 모두에게 알리는 글. 팝업으로 띄울 수 있습니다.",
  NEWS: "심플안전이 전하는 사고 사례와 안전 소식. 모든 회사에 같이 보입니다.",
  RESOURCE: "표준서·점검표·교육자료처럼 두고 보는 자료.",
};
const ICON = { NOTICE: Megaphone, NEWS: Newspaper, RESOURCE: FolderOpen };

export default async function BoardListPage({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { kind } = await params;
  const { page: pageParam } = await searchParams;
  if (!isKindSlug(kind)) notFound();
  const { session, actor } = await boardSession("/board/" + kind);
  const boardKind = KIND_BY_SLUG[kind];
  const { published, drafts, manager } = await withTransaction((c) =>
    listPosts(c, actor, boardKind),
  );
  const paged = pageOf(published, parsePage(pageParam));
  const EmptyIcon = ICON[boardKind];

  return (
    <BoardShell session={session} kind={kind}>
      <PageHeader
        title={KIND_LABEL[boardKind]}
        description={DESCRIPTION[boardKind]}
        actions={
          manager ? (
            <form action={createPostAction}>
              <input type="hidden" name="kind" value={kind} />
              <button type="submit" className="btn-primary">
                <PenLine size={15} /> 글쓰기
              </button>
            </form>
          ) : undefined
        }
      />

      {manager && drafts.length > 0 && (
        <section className="board-section" aria-label="작성 중">
          <h2 className="board-section-title">작성 중 · {drafts.length}</h2>
          <PostRows posts={drafts} kind={kind} edit />
        </section>
      )}

      <section className="board-section" aria-label={KIND_LABEL[boardKind]}>
        {published.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-icon">
              <EmptyIcon size={20} />
            </span>
            <p>
              {manager
                ? `아직 ${KIND_LABEL[boardKind]} 글이 없습니다. 첫 글을 써 보세요.`
                : `아직 올라온 ${KIND_LABEL[boardKind]} 글이 없습니다.`}
            </p>
          </div>
        ) : (
          <>
            <PostRows posts={paged.rows} kind={kind} />
            <Pager
              page={paged.page}
              pageCount={paged.pageCount}
              hrefFor={(n) => `/board/${kind}` + (n > 1 ? `?page=${n}` : "")}
            />
          </>
        )}
      </section>
    </BoardShell>
  );
}

function PostRows({
  posts,
  kind,
  edit = false,
}: {
  posts: PostSummary[];
  kind: string;
  edit?: boolean;
}) {
  return (
    <ul className="board-list">
      {posts.map((p) => (
        <li key={p.id}>
          <Link
            href={`/board/${kind}/${p.id}${edit ? "/edit" : ""}`}
            className="board-row"
          >
            <span className="board-row-main">
              <strong>{p.title || "(제목 없음)"}</strong>
              {p.excerpt && (
                <span className="board-row-excerpt">{p.excerpt}</span>
              )}
            </span>
            <span className="board-row-meta">
              {p.popup && <span className="board-tag">팝업</span>}
              {p.has_media && (
                <span className="board-tag board-tag--quiet">
                  <Paperclip size={11} /> 첨부
                </span>
              )}
              <span>{p.author}</span>
              <span>{postDate(p.published_at ?? p.updated_at)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * 쪽 넘기기 (서버 화면용, 링크). 한 쪽뿐이면 그리지 않는다.
 * 쪽 수를 알면 "2 / 5", 다음 쪽이 있는지만 알면(서버가 잘라 오는 목록) "2페이지".
 */
export function Pager({
  page,
  pageCount,
  hasMore,
  hrefFor,
}: {
  page: number;
  pageCount?: number;
  hasMore?: boolean;
  hrefFor: (page: number) => string;
}) {
  const next = pageCount ? page < pageCount : Boolean(hasMore);
  const prev = page > 1;
  if (!prev && !next) return null;
  return (
    <nav className="pager" aria-label="페이지 이동">
      {prev ? (
        <Link className="pager-btn" href={hrefFor(page - 1)} rel="prev">
          <ChevronLeft size={16} /> 이전
        </Link>
      ) : (
        <span className="pager-btn" aria-disabled="true">
          <ChevronLeft size={16} /> 이전
        </span>
      )}
      <span className="pager-pos">
        {pageCount ? `${page} / ${pageCount}` : `${page}페이지`}
      </span>
      {next ? (
        <Link className="pager-btn" href={hrefFor(page + 1)} rel="next">
          다음 <ChevronRight size={16} />
        </Link>
      ) : (
        <span className="pager-btn" aria-disabled="true">
          다음 <ChevronRight size={16} />
        </span>
      )}
    </nav>
  );
}

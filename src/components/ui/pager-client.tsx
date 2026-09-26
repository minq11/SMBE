"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** 쪽 넘기기 (클라이언트 목록용, 단추). 모양은 pager.tsx 와 같다. */
export function ClientPager({
  page,
  pageCount,
  onPage,
}: {
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav className="pager" aria-label="페이지 이동">
      <button
        type="button"
        className="pager-btn"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        <ChevronLeft size={16} /> 이전
      </button>
      <span className="pager-pos">
        {page} / {pageCount}
      </span>
      <button
        type="button"
        className="pager-btn"
        disabled={page >= pageCount}
        onClick={() => onPage(page + 1)}
      >
        다음 <ChevronRight size={16} />
      </button>
    </nav>
  );
}

/**
 * 목록은 10건씩 한 쪽이다 (헌법 1장). 좁은 화면에서 한 쪽이 한두 번 스크롤 안에
 * 들어오고, 쪽 넘기기는 아래 한 줄이면 된다. 서버가 잘라 오든(작업지시 목록)
 * 메모리에서 자르든(나머지) 같은 크기.
 */
export const PAGE_SIZE = 10;

/** "?page=3" 같은 글자를 1 이상의 정수로. 이상하면 1. */
export function parsePage(value: string | undefined): number {
  const n = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 100000) : 1;
}

export type Paged<T> = {
  rows: T[];
  page: number;
  pageCount: number;
  total: number;
};

/** 메모리에 있는 목록을 한 쪽만 남긴다. 범위를 넘는 쪽은 마지막 쪽으로 붙인다. */
export function pageOf<T>(rows: T[], page: number, size = PAGE_SIZE): Paged<T> {
  const pageCount = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(Math.max(1, page), pageCount);
  return {
    rows: rows.slice((current - 1) * size, current * size),
    page: current,
    pageCount,
    total: rows.length,
  };
}

import type { ReactNode } from "react";

export type HistoryLogRow = {
  at: string;
  who?: string | null;
  what: ReactNode;
};

/**
 * 기록 구역의 줄 목록(헌법 4장): 언제 · 누가 · 무엇 한 줄. 사유·메모는 펼치지
 * 않는다. 최근 몇 줄만 보이고 나머지는 접힌다 — 기록은 읽는 것이 아니라 찾는 것이다.
 */
export function HistoryLog({
  rows,
  initial = 5,
  empty = "기록이 없습니다.",
}: {
  rows: HistoryLogRow[];
  initial?: number;
  empty?: string;
}) {
  if (rows.length === 0) return <p className="history-empty">{empty}</p>;
  const head = rows.slice(0, initial);
  const rest = rows.slice(initial);
  const list = (items: HistoryLogRow[], offset: number) => (
    <ul className="history-log" role="list">
      {items.map((r, i) => (
        <li key={offset + i}>
          <time>{r.at}</time>
          {r.who ? <span className="history-who">{r.who}</span> : null}
          <span className="history-what">{r.what}</span>
        </li>
      ))}
    </ul>
  );
  return (
    <>
      {list(head, 0)}
      {rest.length > 0 && (
        <details className="history-more">
          <summary>이전 {rest.length}건 더 보기</summary>
          {list(rest, head.length)}
        </details>
      )}
    </>
  );
}

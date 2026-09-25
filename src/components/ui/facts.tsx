import type { ReactNode } from "react";

export type Tone = "ok" | "warn" | "danger" | "info" | "plain";

/**
 * 성격이 다른 값들은 문장으로 잇지 않는다 ("관리자 · 웹 · 사후 입력" 식).
 * 이름표 있는 줄(`Facts`)이나 이름표 있는 값 띠(`StatStrip`)로 놓는다 — 어느
 * 값이 무엇인지 읽는 사람이 맞추지 않아도 된다 (헌법 1장).
 */
export function Facts({
  rows,
  className = "",
}: {
  /** [이름, 값]. 값이 비면 줄을 그리지 않는다. */
  rows: Array<[string, ReactNode] | null | false | undefined>;
  className?: string;
}) {
  const shown = rows.filter(
    (r): r is [string, ReactNode] =>
      Array.isArray(r) && r[1] !== null && r[1] !== undefined && r[1] !== "",
  );
  if (shown.length === 0) return null;
  return (
    <dl className={"wo-facts" + (className ? " " + className : "")}>
      {shown.map(([name, value]) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export type Stat = {
  label: string;
  value: ReactNode;
  tone?: Tone;
};

/** 이름표 위, 값 아래. 지시서 상세의 상태 4칸과 같은 문법의 작은 판. */
export function StatStrip({
  items,
  compact = false,
  className = "",
}: {
  items: Array<Stat | null | false | undefined>;
  /** 목록 줄 안에 넣을 때. 이름표가 더 작다. */
  compact?: boolean;
  className?: string;
}) {
  const shown = items.filter((i): i is Stat => Boolean(i));
  if (shown.length === 0) return null;
  return (
    <div
      className={
        "stat-strip" +
        (compact ? " stat-strip--compact" : "") +
        (className ? " " + className : "")
      }
    >
      {shown.map((s) => (
        <div key={s.label}>
          <small>{s.label}</small>
          <strong data-tone={s.tone ?? "plain"}>{s.value}</strong>
        </div>
      ))}
    </div>
  );
}

import type { LogRow } from "@/server/inspection-service";

/**
 * 점검 기록의 빠른 필터 칩. 서버는 기간·작업명으로 한 번 조회하고, 칩은 받은
 * 목록을 화면에서만 거른다 — 누를 때마다 서버를 다녀오지 않는다(사장님 2026-10-05).
 */
export const LOG_CHIPS = [
  ["all", "전체"],
  ["today", "오늘"],
  ["week", "이번 주"],
  ["missing", "미이행"],
  ["fail", "미조치 있음"],
] as const;
export type LogChip = (typeof LOG_CHIPS)[number][0];

/** 회차 한 줄이 이행됐는가 — 배정 전원 TBM + 작업 중 1건 이상. */
export function isDone(r: LogRow) {
  return r.expected > 0 && r.tbm_done >= r.expected && r.during_count > 0;
}

/** 그 날이 든 주의 월요일 (YYYY-MM-DD). */
export function weekStartOf(day: string) {
  const d = new Date(day + "T00:00:00+09:00");
  const dow = (d.getUTCDay() + 6) % 7; // 월요일 = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

/** 잠긴 회차(무료의 열람 창 밖)는 집계가 없어 이행·미조치를 따질 수 없다. */
export function matchesChip(r: LogRow, chip: LogChip, today: string) {
  switch (chip) {
    case "today":
      return r.work_date === today;
    case "week":
      return r.work_date >= weekStartOf(today) && r.work_date <= today;
    case "missing":
      return !r.locked && !isDone(r) && r.work_date <= today;
    case "fail":
      return !r.locked && r.open_findings > 0;
    default:
      return true;
  }
}

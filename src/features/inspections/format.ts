import { validDate } from "@/features/work-orders/model";

const DAY_KO = ["일", "월", "화", "수", "목", "금", "토"];
/** "2026-09-24" → "9/24 (목)". 날짜 글자 그대로 — 시간대로 하루가 밀리지 않게. */
export function dayLabel(date: string) {
  if (!validDate(date)) return date;
  const d = new Date(date + "T00:00:00Z");
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} (${DAY_KO[d.getUTCDay()]})`;
}
function hhmm(value: string) {
  return new Date(value).toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
/** 회차의 시작~종료를 "09:00 ~ 17:00" 로. 다음 날 종료면 "(다음 날)". */
export function timeRange(startsAt: string, endsAt: string) {
  const s = new Date(startsAt);
  const e = new Date(endsAt);
  const nextDay =
    s.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" }) !==
    e.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
  return `${hhmm(startsAt)} ~ ${hhmm(endsAt)}${nextDay ? " (다음 날)" : ""}`;
}
/** 저장 시각을 "9. 24. 10:12" 로. 초와 연도는 화면에서 읽을 일이 없다. */
export function shortTime(value: string) {
  return new Date(value).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

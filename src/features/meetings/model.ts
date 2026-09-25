/**
 * 주간 안전점검 회의의 주 단위 계산.
 *
 * 주는 한국시간 기준 **월요일 시작**이다. 회차(작업일자)와 같은 시간대를 쓰지
 * 않으면 금요일 야간작업의 불량이 다음 주 회의로 밀린다.
 */
const DAY = 86400_000;
const KST = 9 * 3600_000;

export function weekStartKst(at: Date = new Date()): string {
  const kst = new Date(at.getTime() + KST);
  const monday = (kst.getUTCDay() + 6) % 7;
  kst.setUTCDate(kst.getUTCDate() - monday);
  return kst.toISOString().slice(0, 10);
}

export function weekEnd(weekStart: string): string {
  return new Date(Date.parse(weekStart + "T00:00:00Z") + 6 * DAY)
    .toISOString()
    .slice(0, 10);
}

/** "9/22 ~ 9/28" — 목록에서 주를 알아보는 최소 단위. */
export function weekLabel(weekStart: string): string {
  const short = (iso: string) => {
    const [, m, d] = iso.split("-");
    return `${Number(m)}/${Number(d)}`;
  };
  return `${short(weekStart)} ~ ${short(weekEnd(weekStart))}`;
}

/** 최신 주부터 과거로 n주. 미실시 주를 드러내려면 주 자체를 먼저 세워야 한다. */
export function recentWeeks(n: number, from: Date = new Date()): string[] {
  const first = weekStartKst(from);
  return Array.from({ length: n }, (_, i) =>
    new Date(Date.parse(first + "T00:00:00Z") - i * 7 * DAY)
      .toISOString()
      .slice(0, 10),
  );
}

export const SOURCE_LABEL: Record<string, string> = {
  INSPECTION_FINDING: "점검 불량",
  RISK_MEASURE: "평가 감소대책 미조치",
  INCIDENT: "안전사고",
};

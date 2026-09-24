import Link from "next/link";
import { CheckCircle2, Search } from "lucide-react";
import { sessionState, SESSION_LABEL, type SessionRow } from "./model";
import { dayLabel, timeRange } from "./format";

/**
 * 발급된 지시서의 "오늘 할 일" 카드. 오늘 회차 한 줄(날짜·시간·TBM·작업 중 점검)과
 * 단추 둘, 기록 링크 하나. 설명 문장은 두지 않는다 — 단추 이름이 말한다.
 */
export function InspectionSummary({
  id,
  current,
  now,
  canceled,
  ownId,
  via = "web",
}: {
  id: string;
  current: SessionRow | null;
  now: string;
  canceled: boolean;
  ownId: string;
  via?: string;
}) {
  const root = "/work-orders/" + id + "/inspections";
  const path = via === "qr" ? "qr" : via === "link" ? "link" : "web";
  const state = current ? sessionState(current, new Date(now)) : null;
  return (
    <section className="tbm-today wo-no-print" aria-label="오늘 회차">
      {current && !canceled ? (
        <>
          <div className="tbm-today-head">
            <strong>
              오늘 회차: {dayLabel(current.work_date)} ·{" "}
              {SESSION_LABEL[state!.state]}
            </strong>
            <span className="wo-muted">
              {timeRange(current.starts_at, current.ends_at)}
            </span>
          </div>
          <p className="tbm-today-line">
            TBM {current.expected_assignees.length - state!.missing.length}/
            {current.expected_assignees.length}명 · 작업 중 점검{" "}
            {current.during_count}건
            {state!.missing.length > 0 &&
              ` · 미확인 ${state!.missing.map((a) => a.name).join(", ")}`}
          </p>
          <div className="tbm-today-actions">
            {current.tbm_users.includes(ownId) ? (
              <span className="tbm-today-done">
                <CheckCircle2 size={14} /> 내 TBM 확인 완료
              </span>
            ) : (
              <Link
                className="btn-primary"
                href={root + "?type=TBM&via=" + path}
              >
                <CheckCircle2 size={14} /> TBM 확인하기
              </Link>
            )}
            <Link
              className="btn-secondary"
              href={root + "?type=DURING_WORK&via=" + path}
            >
              <Search size={14} /> 작업 중 점검하기
            </Link>
          </div>
        </>
      ) : (
        <p className="wo-muted">
          {canceled ? "취소된 작업은 점검을 입력할 수 없습니다." : "오늘 회차가 없습니다."}
        </p>
      )}
      <Link className="text-button tbm-today-log" href={root}>
        점검 기록 보기
      </Link>
    </section>
  );
}

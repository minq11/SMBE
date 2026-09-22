import Link from "next/link";
import { NavSpinner } from "@/components/ui/nav-spinner";
import { CheckCircle2, Search } from "lucide-react";
import { sessionState, SESSION_LABEL, type SessionRow } from "./model";

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
    <section className="wo-section wo-no-print">
      <h2>TBM · 작업 중 점검</h2>
      {current && !canceled ? (
        <>
          <p>
            오늘 회차: {current.work_date} · {SESSION_LABEL[state!.state]}
          </p>
          <p>
            TBM {current.expected_assignees.length - state!.missing.length}/
            {current.expected_assignees.length}명 확인 · 작업 중 점검{" "}
            {current.during_count}건
          </p>
          {state!.missing.length > 0 && (
            <p className="wo-muted">
              TBM 미확인: {state!.missing.map((a) => a.name).join(", ")}
            </p>
          )}
          <div className="wo-actions">
            {current.tbm_users.includes(ownId) ? (
              <span>내 TBM 확인 완료</span>
            ) : (
              <Link
                className="btn-primary"
                href={root + "?type=TBM&via=" + path}
              >
                <CheckCircle2 size={14} /> TBM 확인하기
                <NavSpinner />
              </Link>
            )}
            <Link
              className="btn-secondary"
              href={root + "?type=DURING_WORK&via=" + path}
            >
              <Search size={14} /> 작업 중 점검하기
              <NavSpinner />
            </Link>
          </div>
        </>
      ) : (
        <p className="wo-muted">
          {canceled
            ? "취소된 작업은 새 점검을 입력할 수 없습니다."
            : "오늘 회차가 없습니다. 아래 목록에서 회차를 선택해 이어 입력할 수 있습니다."}
        </p>
      )}
      <p>
        <Link className="text-link" href={root}>
          회차별 점검 기록·부적합 보기
        </Link>
      </p>
    </section>
  );
}

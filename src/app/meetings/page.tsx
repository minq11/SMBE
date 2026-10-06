import Link from "next/link";
import { ArrowRight, CircleHelp } from "lucide-react";
import { notFound } from "next/navigation";
import { withTransaction } from "@/server/db";
import { workSession } from "@/server/work-orders";
import { listMeetings, monthlyTally } from "@/server/safety-meeting";
import { OrderShell } from "@/features/work-orders/order-shell";
import { PageHeader } from "@/components/ui/page-header";
import { HelpDialog } from "@/components/ui/help-dialog";
import { OpenMeetingButton } from "@/features/meetings/meeting-forms";
import { weekLabel, weekStartKst } from "@/features/meetings/model";
import "@/features/work-orders/work-orders.css";
import "@/features/meetings/meetings.css";

export const metadata = { title: "주간 안전점검 회의 · 심플안전" };

export default async function MeetingsPage() {
  const { session, actor } = await workSession("/meetings", true);
  if (session.membership?.role === "WORKER") notFound();
  const thisWeek = weekStartKst();
  const [weeks, tally] = await Promise.all([
    withTransaction((c) => listMeetings(c, actor)),
    withTransaction((c) => monthlyTally(c, actor)),
  ]);

  return (
    <OrderShell session={session} title="주간 안전점검 회의" active="meetings">
      <PageHeader title="주간 안전점검 회의" />
      <section className="wo-section">
        <div className="wo-section-head">
          <h2>이번 달 집계</h2>
          <HelpDialog title="이번 달 집계" variant="icon">
            <dl className="help-rows">
              <dt>무엇</dt>
              <dd>상시 위험성평가의 월간 요건 근거. 불량 발생일(작업일자) 기준.</dd>
            </dl>
          </HelpDialog>
        </div>
        <p>
          {tally.month} · 발굴 {tally.found}건 · 조치 완료 {tally.resolved}건
        </p>
      </section>

      <section className="wo-section">
        <div className="wo-section-head">
          <h2>최근 12주</h2>
          <HelpDialog title="주간 회의" variant="icon">
            <dl className="help-rows">
              <dt>무엇</dt>
              <dd>매주 점검 불량·감소대책·사고를 모아 논의하고 이행을 확인한 기록.</dd>
              <dt>원본</dt>
              <dd>회의에서 확인해도 원본은 종결되지 않습니다. 종결은 각 처리 화면에서.</dd>
              <dt>알림</dt>
              <dd>주가 끝났는데 기록이 없으면 관리감독자·안전관리자에게 메일 한 번.</dd>
            </dl>
          </HelpDialog>
        </div>
        <ul className="meeting-weeks">
          {weeks.map((w) => (
            <li
              key={w.week_start}
              className={
                "meeting-week" +
                (w.status === "COMPLETED"
                  ? " is-done"
                  : w.status === "DRAFT"
                    ? " is-draft"
                    : " is-missing") +
                (w.week_start === thisWeek ? " is-current" : "")
              }
            >
              <div className="meeting-week-main">
                <strong>
                  {weekLabel(w.week_start)}
                  {w.week_start === thisWeek && (
                    // "지금·여기" 는 포인트색(노랑) — 오늘 배지와 같은 칩 (헌법 2장).
                    <span className="wo-risk-level" data-tone="accent">
                      이번 주
                    </span>
                  )}
                </strong>
                <span className="meeting-week-state">
                  {w.status === "COMPLETED"
                    ? "실시 완료"
                    : w.status === "DRAFT"
                      ? "작성 중"
                      : "미실시"}
                </span>
                {w.meeting_id && (
                  <span className="wo-muted">
                    수집 {w.item_count}건 · 확인 {w.reviewed_count}건
                    {w.created_by_name ? ` · 작성 ${w.created_by_name}` : ""}
                  </span>
                )}
                {!w.meeting_id && w.reminded_at && (
                  <span className="wo-muted">
                    미실시 알림 발송 {w.reminded_at.slice(0, 10)}
                  </span>
                )}
              </div>
              {w.meeting_id ? (
                <Link className="go-link" href={"/meetings/" + w.week_start}>
                  {w.status === "COMPLETED" ? (
                    <>
                      <CircleHelp size={14} /> 회의록 보기
                    </>
                  ) : (
                    <>
                      이어서 작성 <ArrowRight size={14} />
                    </>
                  )}
                </Link>
              ) : (
                <OpenMeetingButton week={w.week_start} />
              )}
            </li>
          ))}
        </ul>
      </section>
    </OrderShell>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { withTransaction } from "@/server/db";
import { workSession } from "@/server/work-orders";
import { listMeetings, monthlyTally } from "@/server/safety-meeting";
import { OrderShell } from "@/features/work-orders/order-shell";
import { PageHeader } from "@/components/ui/page-header";
import { OpenMeetingButton } from "@/features/meetings/meeting-forms";
import { weekLabel } from "@/features/meetings/model";
import "@/features/work-orders/work-orders.css";
import "@/features/meetings/meetings.css";

export const metadata = { title: "주간 안전점검 회의 · 심플안전" };

export default async function MeetingsPage() {
  const { session, actor } = await workSession("/meetings", true);
  if (session.membership?.role === "WORKER") notFound();
  const [weeks, tally] = await Promise.all([
    withTransaction((c) => listMeetings(c, actor)),
    withTransaction((c) => monthlyTally(c, actor)),
  ]);

  return (
    <OrderShell session={session} title="주간 안전점검 회의" active="meetings">
      <PageHeader
        title="주간 안전점검 회의"
        description="상시 위험성평가의 매주 논의·공유·이행점검 기록"
      />
      <section className="wo-section">
        <h2>이번 달 집계</h2>
        <p>
          {tally.month} · 발굴 {tally.found}건 · 조치 완료 {tally.resolved}건
        </p>
        <p className="wo-muted">
          상시평가의 월간 요건 근거로 쓰입니다. 불량 발생일(작업일자) 기준으로
          셉니다.
        </p>
      </section>

      <section className="wo-section">
        <h2>최근 12주</h2>
        <p className="wo-muted">
          회의에서 항목을 확인해도 원본 불량·평가 대책은 종결되지 않습니다.
          종결은 각 처리 화면에서 합니다. 주가 끝났는데 회의 기록이 없으면
          관리감독자·안전관리자에게 메일로 한 번 알립니다.
        </p>
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
                    : " is-missing")
              }
            >
              <div className="meeting-week-main">
                <strong>{weekLabel(w.week_start)}</strong>
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
                <Link
                  className="btn-secondary"
                  href={"/meetings/" + w.week_start}
                >
                  {w.status === "COMPLETED" ? "회의록 보기" : "이어서 작성"}
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

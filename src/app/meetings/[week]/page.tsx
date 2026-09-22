import Link from "next/link";
import { notFound } from "next/navigation";
import { withTransaction } from "@/server/db";
import { workSession } from "@/server/work-orders";
import { readMeeting } from "@/server/safety-meeting";
import { WorkOrderError } from "@/features/work-orders/model";
import { OrderShell } from "@/features/work-orders/order-shell";
import { PageHeader } from "@/components/ui/page-header";
import {
  MeetingItemForm,
  CompleteMeetingForm,
  OpenMeetingButton,
} from "@/features/meetings/meeting-forms";
import { SOURCE_LABEL, weekLabel } from "@/features/meetings/model";
import "@/features/work-orders/work-orders.css";
import "@/features/meetings/meetings.css";

export const metadata = { title: "주간 안전점검 회의 · 심플안전" };

const at = (value: string) =>
  new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

export default async function MeetingPage({
  params,
}: {
  params: Promise<{ week: string }>;
}) {
  const { week } = await params;
  const { session, actor } = await workSession("/meetings/" + week, true);
  if (session.membership?.role === "WORKER") notFound();
  const data = await withTransaction((c) => readMeeting(c, actor, week)).catch(
    (error) => {
      if (error instanceof WorkOrderError) notFound();
      throw error;
    },
  );

  const done = data.meeting?.status === "COMPLETED";
  const unreviewed = data.items.filter((i) => !i.reviewed).length;

  return (
    <OrderShell
      session={session}
      title={weekLabel(week) + " 주간 회의"}
      active="meetings"
    >
      <PageHeader
        title={weekLabel(week) + " 주간 회의"}
        description={
          data.meeting
            ? done
              ? `실시 완료 · 작성 ${data.meeting.created_by_name}`
              : `작성 중 · 작성 ${data.meeting.created_by_name}`
            : "아직 열지 않은 주입니다."
        }
        actions={
          <Link className="btn-secondary" href="/meetings">
            회의 목록
          </Link>
        }
      />

      {!data.meeting && (
        <section className="wo-section">
          <p className="wo-muted">
            회의를 열면 그 주의 점검 부적합과 기한이 지난 감소대책을 모아
            보여줍니다.
          </p>
          <OpenMeetingButton week={week} label="이 주 회의 열기" />
        </section>
      )}

      {data.meeting && (
        <>
          <section className="wo-section">
            <h2>수집 항목 {data.items.length}건</h2>
            <p className="wo-muted">
              그 주에 발생한 점검 부적합과, 기한이 지났는데 완료되지 않은
              위험성평가 감소대책을 모았습니다. 안전사고는 등록 기능을 만든 뒤
              연결합니다. 여기서 확인해도 원본은 종결되지 않습니다.
            </p>
            {!data.items.length && (
              <p>이 주에 모을 항목이 없습니다. 참석자만 기록하고 완료하세요.</p>
            )}
            {data.items.map((item) => (
              <article className="wo-risk" key={item.id}>
                <h3>
                  <span className="meeting-source">
                    {SOURCE_LABEL[item.source_type] ?? item.source_type}
                  </span>{" "}
                  {item.summary}
                </h3>
                <MeetingItemForm week={week} item={item} readOnly={done} />
              </article>
            ))}
            {!done && (
              <div className="meeting-recollect">
                <p className="wo-muted">
                  주 중간에 새로 생긴 항목은 다시 수집해 덧붙일 수 있습니다.
                  이미 적은 확인·비고는 그대로 보존됩니다.
                </p>
                <OpenMeetingButton week={week} label="다시 수집" />
              </div>
            )}
          </section>

          <section className="wo-section">
            <h2>{done ? "회의 기록" : "참석자 · 논의 내용"}</h2>
            {done ? (
              <>
                <p>
                  참석자:{" "}
                  {data.attendees
                    .map((a) => a.snapshot_display_name)
                    .join(", ") || "기록 없음"}
                </p>
                <p className="wo-detail-text">
                  {data.meeting.discussion || "논의 내용 없음"}
                </p>
                <p className="wo-muted">
                  완료{" "}
                  {data.meeting.completed_at
                    ? at(data.meeting.completed_at)
                    : "-"}{" "}
                  (한국시간) · {data.meeting.completed_by_name}
                </p>
                <p className="wo-muted">
                  완료한 회의는 수정할 수 없습니다. 다음 주 회의에서 이어
                  다룹니다.
                </p>
              </>
            ) : (
              <CompleteMeetingForm
                week={week}
                members={data.members}
                attendees={data.attendees.map((a) => a.user_id)}
                discussion={data.meeting.discussion}
                unreviewed={unreviewed}
              />
            )}
          </section>
        </>
      )}
    </OrderShell>
  );
}

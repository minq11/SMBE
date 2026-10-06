import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronRight,
  ListChecks,
  SquareCheckBig,
  TriangleAlert,
} from "lucide-react";
import { withTransaction } from "@/server/db";
import { workSession } from "@/server/work-orders";
import { readMeeting } from "@/server/safety-meeting";
import { WorkOrderError } from "@/features/work-orders/model";
import { OrderShell } from "@/features/work-orders/order-shell";
import { PageHeader } from "@/components/ui/page-header";
import { HelpDialog } from "@/components/ui/help-dialog";
import {
  MeetingItemForm,
  CompleteMeetingForm,
  OpenMeetingButton,
} from "@/features/meetings/meeting-forms";
import {
  SOURCE_LABEL,
  SOURCE_ROUTE,
  weekLabel,
} from "@/features/meetings/model";
import "@/features/work-orders/work-orders.css";
import "@/features/meetings/meetings.css";

export const metadata = { title: "주간 안전점검 회의 · 심플안전" };

const at = (value: string) =>
  new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

/* 항목이 온 길을 칩으로 — 사이드바 메뉴와 같은 그림. 누르면 원본으로 간다. */
const ROUTE_ICON = {
  INSPECTION_FINDING: SquareCheckBig,
  RISK_MEASURE: ListChecks,
  INCIDENT: TriangleAlert,
} as const;

function RouteChip({
  type,
  href,
}: {
  type: keyof typeof ROUTE_ICON;
  href: string | null;
}) {
  const Icon = ROUTE_ICON[type];
  const body = (
    <>
      <Icon size={13} />
      <span>
        {SOURCE_ROUTE[type]} · {SOURCE_LABEL[type]}
      </span>
      {href && <ChevronRight size={12} />}
    </>
  );
  return href ? (
    <Link href={href} className="meeting-source" data-source={type}>
      {body}
    </Link>
  ) : (
    <span className="meeting-source" data-source={type}>
      {body}
    </span>
  );
}

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
        /* [회의 목록] 단추는 뒀다가 뺐다. PageHeader 의 뒤로가기(←)가 히스토리가
           아니라 구조로 한 단계 위(/meetings)로 가므로, 글자 그대로 같은 곳으로
           가는 단추가 제목 양쪽에 둘 있었다. */
      />

      {!data.meeting && (
        <section className="wo-section">
          <p className="wo-muted">
            열면 그 주의 점검 불량·기한 지난 감소대책·사고를 모읍니다.
          </p>
          <OpenMeetingButton week={week} label="이 주 회의 열기" />
        </section>
      )}

      {data.meeting && (
        <>
          <section className="wo-section">
            <div className="wo-section-head">
              <h2>수집 항목 {data.items.length}건</h2>
              <HelpDialog title="수집 항목" variant="icon">
                <dl className="help-rows">
                  <dt>무엇</dt>
                  <dd>
                    그 주의 점검 불량, 기한이 지났는데 안 끝난 위험성평가
                    감소대책, 그 주의 사고·아차사고와 기한이 온 사고 할 일.
                  </dd>
                  <dt>원본</dt>
                  <dd>
                    칩을 누르면 원본으로 갑니다. 여기서 확인해도 원본은
                    종결되지 않습니다. 종결은 각 처리 화면에서.
                  </dd>
                  <dt>다시</dt>
                  <dd>
                    주 중간에 생긴 항목은 [다시 수집]으로 덧붙입니다. 이미 적은
                    확인·비고는 그대로.
                  </dd>
                </dl>
              </HelpDialog>
            </div>
            {!data.items.length && (
              <p>이 주에 모을 항목이 없습니다. 참석자만 기록하고 완료하세요.</p>
            )}
            {data.items.map((item) => (
              <article className="wo-risk meeting-item" key={item.id}>
                <RouteChip type={item.source_type} href={item.href} />
                <h3>{item.summary}</h3>
                <MeetingItemForm week={week} item={item} readOnly={done} />
              </article>
            ))}
            {!done && (
              <div className="meeting-recollect">
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

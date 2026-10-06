import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PenLine, CircleHelp } from "lucide-react";
import { withTransaction } from "@/server/db";
import { workSession } from "@/server/work-orders";
import { readIncident } from "@/server/incidents";
import { listAttachments } from "@/server/attachments";
import { AppShell } from "@/components/shell/app-shell";
import { tierOf } from "@/components/shell/tier";
import { isCurrentUserOperator } from "@/server/operator";
import { PageHeader } from "@/components/ui/page-header";
import { PaidLockButton } from "@/components/ui/paid-lock";
import { Facts, StatStrip } from "@/components/ui/facts";
import { HistoryLog } from "@/components/ui/history-log";
import { AttachmentUploader } from "@/features/attachments/attachment-uploader";
import { AttachmentList } from "@/features/attachments/attachment-list";
import {
  ActionList,
  CloseButtons,
  DutyList,
} from "@/features/incidents/detail-parts";
import {
  DUTY_LABEL,
  GRADE_LABEL,
  GRADE_TONE,
  INCIDENT_HISTORY_LABEL,
  IncidentError,
  KIND_LABEL,
  OCCURRENCE_LABEL,
  STATUS_LABEL,
  incidentTitle,
  occurredClock,
  occurredDate,
} from "@/features/incidents/model";
import { seoulToday } from "@/features/work-orders/model";
import { koDate } from "@/features/assessments/model";
import "@/features/work-orders/work-orders.css";
import "@/features/incidents/incidents.css";

export const metadata = { title: "안전사고 · 심플안전" };

/**
 * 사고 상세. 맨 위가 "해야 할 일" — 이 화면의 일은 기록을 보여 주는 것이 아니라
 * 남은 일을 끝내게 하는 것이다. 그 아래 내용·다친 사람·조치·원인과 대책·사진.
 * 그 뒤에 딸린 문서(산업재해조사표)와 기록(처리 기록) — 헌법 4장 세 구역.
 */
export default async function IncidentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { session, actor } = await workSession(`/incidents/${id}`, true);
  const detail = await withTransaction((c) => readIncident(c, actor, id)).catch(
    (error) => {
      if (error instanceof IncidentError) return null;
      throw error;
    },
  );
  if (!detail) notFound();
  const paid = session.membership!.pro_state !== "FREE";
  const [isOperator, photos] = await Promise.all([
    isCurrentUserOperator(),
    paid
      ? listAttachments(actor, "incident", id).catch(() => [])
      : Promise.resolve([]),
  ]);
  const today = seoulToday();
  const locked = detail.status === "CLOSED";
  const openDuties = detail.duties.filter((d) => !d.done_at).length;
  const openActions = detail.actions.filter((a) => !a.done_at).length;
  const title = incidentTitle(detail);
  const path = `/incidents/${id}`;
  const surveyDuty = detail.duties.find((d) => d.kind === "SURVEY_FORM");
  const clock = (iso: string) =>
    new Date(iso).toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

  return (
    <AppShell
      active="incident"
      breadcrumb={[{ label: "안전사고", href: "/incidents" }, { label: title }]}
      companyName={session.membership?.company_name}
      tier={tierOf(session.membership)}
      userName={session.user.displayName ?? undefined}
      isAuthenticated
      isOperator={isOperator}
    >
      <PageHeader
        title={title}
        description={
          <>
            {occurredDate(detail.occurred_at)}{" "}
            {occurredClock(detail.occurred_at)} ·{" "}
            {detail.location || "장소 미입력"}
            {detail.location_detail ? ` ${detail.location_detail}` : ""}
          </>
        }
        actions={
          <div className="wo-actions">
            {!locked && (
              <Link href={`${path}/edit`} className="btn-secondary">
                <PenLine size={14} /> 고치기
              </Link>
            )}
            <CloseButtons
              incidentId={id}
              status={detail.status}
              remaining={openDuties + openActions}
            />
          </div>
        }
      />

      <StatStrip
        className="inc-strip"
        items={[
          { label: "구분", value: KIND_LABEL[detail.kind] },
          {
            label: "등급",
            value:
              GRADE_LABEL[detail.grade] +
              (detail.serious_under_scpa ? " · 중대산업재해" : ""),
            tone: GRADE_TONE[detail.grade],
          },
          {
            label: "상태",
            value: STATUS_LABEL[detail.status],
            // 종결은 회색 — 초록은 "끝냈다" 가 아니라 "여기를 누르면 앞으로 간다" 다.
            tone: detail.status === "CLOSED" ? "plain" : "info",
          },
          {
            label: "남은 할 일",
            value: `${openDuties}개`,
            tone: openDuties > 0 ? "danger" : "ok",
          },
        ]}
      />

      <section className="wo-section" aria-labelledby="inc-duties-h">
        <h2 id="inc-duties-h">해야 할 일</h2>
        <p className="wo-muted">
          등급에 따라 법이 요구하는 일입니다. 끝낼 때 누가 언제 무엇을 했는지 한
          줄 남기세요 — 감독이 보는 것은 그 줄입니다.
        </p>
        <DutyList
          incidentId={id}
          duties={detail.duties}
          today={today}
          locked={locked}
          paid={paid}
          riskAssessmentHref={
            detail.standard_id
              ? `/standards/${detail.standard_id}/assessments/new`
              : null
          }
        />
      </section>

      <section className="wo-section" aria-labelledby="inc-what-h">
        <h2 id="inc-what-h">사고 내용</h2>
        <Facts
          rows={[
            [
              "발생",
              `${occurredDate(detail.occurred_at)} ${occurredClock(detail.occurred_at)}`,
            ],
            ["장소", detail.location || "미입력"],
            Boolean(detail.location_detail) && [
              "상세 위치",
              detail.location_detail,
            ],
            ["발생형태", OCCURRENCE_LABEL[detail.occurrence_type]],
            [
              "연결 지시서",
              detail.work_order_id ? (
                <Link href={`/work-orders/${detail.work_order_id}`}>
                  {detail.work_order_name}
                </Link>
              ) : (
                "없음"
              ),
            ],
            [
              "등록",
              `${detail.reported_by_name} (${detail.reported_via === "WORKER" ? "작업자 신고" : "관리자"})`,
            ],
            Boolean(detail.closed_at) && [
              "종결",
              `${koDate(detail.closed_at)} ${detail.closed_by_name ?? ""}`,
            ],
          ]}
        />
        <p className="wo-detail-text">{detail.description}</p>
      </section>

      {detail.kind === "INJURY" && (
        <section className="wo-section" aria-labelledby="inc-victims-h">
          <h2 id="inc-victims-h">다친 사람</h2>
          <ul className="inc-cards" role="list">
            {detail.victims.map((v) => (
              <li key={v.id} className="inc-card">
                <div className="inc-card-head">
                  <strong>{v.name}</strong>
                  {v.fatal && (
                    <span className="inc-grade" data-tone="danger">
                      사망
                    </span>
                  )}
                </div>
                <Facts
                  className="wo-facts--tight"
                  rows={[
                    ["다친 부위", v.body_part || "미입력"],
                    ["부상·질병", v.injury || "미입력"],
                    ["예상 휴업", `${v.expected_leave_days}일`],
                    v.treatment_months > 0 && [
                      "예상 치료",
                      `${v.treatment_months}개월`,
                    ],
                    Boolean(v.hospital) && ["병원", v.hospital],
                  ]}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="wo-section" aria-labelledby="inc-response-h">
        <h2 id="inc-response-h">바로 한 조치</h2>
        <Facts
          rows={[
            [
              "작업 중지",
              <span key="s" data-tone={detail.work_stopped ? "ok" : "danger"}>
                {detail.work_stopped ? "했음" : "안 함"}
              </span>,
            ],
            [
              "대피",
              <span key="e" data-tone={detail.evacuated ? "ok" : "plain"}>
                {detail.evacuated ? "했음" : "해당 없음"}
              </span>,
            ],
          ]}
        />
        {detail.immediate_action ? (
          <p className="wo-detail-text">{detail.immediate_action}</p>
        ) : (
          <p className="wo-muted">응급조치 기록이 없습니다.</p>
        )}
      </section>

      <section className="wo-section" aria-labelledby="inc-cause-h">
        <h2 id="inc-cause-h">원인·재발방지</h2>
        {detail.cause ? (
          <p className="wo-detail-text">{detail.cause}</p>
        ) : (
          <p className="wo-muted">원인이 아직 없습니다. 고치기에서 적으세요.</p>
        )}
        <h3>재발방지대책</h3>
        <ActionList
          incidentId={id}
          actions={detail.actions}
          today={today}
          locked={locked}
        />
      </section>

      <section className="wo-section" aria-labelledby="inc-photos-h">
        <h2 id="inc-photos-h">사진</h2>
        {paid ? (
          <>
            {photos.length > 0 && (
              <AttachmentList
                items={photos}
                canDelete={!locked}
                invalidatePath={path}
              />
            )}
            {!locked && (
              <AttachmentUploader
                targetType="incident"
                targetId={id}
                invalidatePath={path}
                label="사진 붙이기"
              />
            )}
            {photos.length === 0 && locked && (
              <p className="wo-muted">붙인 사진이 없습니다.</p>
            )}
          </>
        ) : (
          !locked && (
            <PaidLockButton
              className="btn-secondary"
              message="현장 사진 첨부는 유료 요금제에서 씁니다."
            >
              사진 붙이기
            </PaidLockButton>
          )
        )}
      </section>

      {detail.kind === "INJURY" && (
        <div className="zone">
          <div className="std-form-divider" aria-hidden="true">
            <span>별도 문서 · 산업재해조사표</span>
          </div>
          <section
            className="std-detail-section std-detail-section--assessment wo-doc"
            aria-labelledby="inc-survey-h"
          >
            <p className="std-assessment-eyebrow">
              이 사고 기록으로 채우는 별도 서식 · 별지 30호
            </p>
            <h2 id="inc-survey-h">산업재해조사표</h2>
            <Facts
              className="wo-facts--tight"
              rows={[
                ["근거", DUTY_LABEL.SURVEY_FORM.basis],
                surveyDuty
                  ? [
                      "제출",
                      surveyDuty.done_at
                        ? `${koDate(surveyDuty.done_at)} 끝냄`
                        : `기한 ${koDate(surveyDuty.due_on)}`,
                    ]
                  : null,
              ]}
            />
            <div className="wo-doc-links">
              <Link href={`${path}/survey`} className="go-link">
                <CircleHelp size={14} /> 산업재해조사표 열기
              </Link>
            </div>
          </section>
        </div>
      )}

      <div className="zone">
        <div
          className="std-form-divider std-form-divider--log"
          aria-hidden="true"
        >
          <span>기록</span>
        </div>
        <section
          className="std-detail-section std-detail-section--log"
          aria-labelledby="inc-log-h"
        >
          <h2 id="inc-log-h">처리 기록 ({detail.history.length}건)</h2>
          <HistoryLog
            rows={detail.history.map((h) => {
              const label =
                h.action === "INCIDENT_ACTION_DONE" && h.done === false
                  ? INCIDENT_HISTORY_LABEL.INCIDENT_ACTION_UNDONE
                  : (INCIDENT_HISTORY_LABEL[h.action] ?? h.action);
              // 어느 할 일·대책인지까지 한 줄에. 메모는 펼치지 않는다.
              const target = h.duty_kind
                ? DUTY_LABEL[h.duty_kind].title
                : h.action_measure;
              return {
                at: clock(h.at),
                who: h.actor_name,
                what: target ? `${label} · ${target}` : label,
              };
            })}
          />
        </section>
      </div>
    </AppShell>
  );
}

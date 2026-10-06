import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, Plus, CircleHelp } from "lucide-react";
import { getCurrentSession } from "@/server/session";
import { withTransaction } from "@/server/db";
import { workSession } from "@/server/work-orders";
import { incidentOverview, listIncidents } from "@/server/incidents";
import { AppShell } from "@/components/shell/app-shell";
import { tierOf } from "@/components/shell/tier";
import { isCurrentUserOperator } from "@/server/operator";
import { PageHeader } from "@/components/ui/page-header";
import { IncidentsListView } from "@/features/incidents/list-view";
import {
  KIND_LABEL,
  OCCURRENCE_LABEL,
  shortDay,
} from "@/features/incidents/model";
import "@/features/assessments/assessments.css";
import "@/features/work-orders/work-orders.css";
import "@/features/incidents/incidents.css";

export const metadata = { title: "안전사고 · 심플안전" };

/**
 * 안전사고 메뉴. 위험성평가 메뉴와 같은 틀: 숫자 셋 → 지금 봐야 할 것(기한이
 * 다가온 할 일) → 목록. 감독이 "사고 뒤 뭘 했습니까" 를 물으면 이 화면이 답한다.
 */
export default async function IncidentsPage() {
  // 작업자에게 이 메뉴는 신고 화면이다.
  const current = await getCurrentSession();
  if (current?.membership?.role === "WORKER") redirect("/incidents/report");
  const { session, actor } = await workSession("/incidents", true);
  const [overview, items, isOperator] = await Promise.all([
    withTransaction((c) => incidentOverview(c, actor)),
    withTransaction((c) => listIncidents(c, actor)),
    isCurrentUserOperator(),
  ]);

  return (
    <AppShell
      active="incident"
      breadcrumb={[{ label: "안전사고" }]}
      companyName={session.membership?.company_name}
      tier={tierOf(session.membership)}
      userName={session.user.displayName ?? undefined}
      isAuthenticated
      isOperator={isOperator}
    >
      <PageHeader
        title="안전사고"
        actions={
          <div className="wo-actions">
            <Link href="/company/incident-manual" className="go-link">
              <CircleHelp size={14} /> 대응 절차
            </Link>
            <Link href="/incidents/new" className="btn-primary">
              <Plus size={15} /> 사고 등록
            </Link>
          </div>
        }
      />

      <div className="asmt-tiles" aria-label="현황">
        <div
          className={`asmt-tile${overview.year_injuries > 0 ? " is-alert" : ""}`}
        >
          <strong>{overview.year_injuries}건</strong>
          <small>{overview.year}년 재해</small>
        </div>
        <div className="asmt-tile">
          <strong>{overview.year_near_misses}건</strong>
          <small>{overview.year}년 아차사고</small>
        </div>
        <div
          className={`asmt-tile${overview.open_duties > 0 ? " is-alert" : ""}`}
        >
          <strong>{overview.open_duties}개</strong>
          <small>처리 중 할 일</small>
        </div>
      </div>

      {overview.due_soon.length > 0 && (
        // 기본은 접힘 — 목록이 먼저다. 건수가 머리에 보이니 열어 볼지 정할 수 있다
        // (사장님 2026-10-06).
        <details className="std-fold inc-due-fold">
          <summary>
            <CalendarClock size={15} aria-hidden="true" /> 기한이 다가온 할 일 ·{" "}
            {overview.due_soon.length}건
          </summary>
          <ul className="asmt-needs">
            {overview.due_soon.map((d) => (
              <li key={d.incident_id + d.kind} className="asmt-need">
                <span className="asmt-need-main">
                  <strong>{d.title}</strong>
                  <small>
                    {OCCURRENCE_LABEL[d.occurrence_type]}{" "}
                    {KIND_LABEL[d.incident_kind]} · {shortDay(d.occurred_at)}{" "}
                    발생 ·{" "}
                    <span className={d.overdue ? "inc-overdue" : undefined}>
                      {d.overdue ? "기한 지남" : "기한"} {shortDay(d.due_on)}
                    </span>
                  </small>
                </span>
                <Link
                  href={`/incidents/${d.incident_id}`}
                  className={d.overdue ? "btn-primary" : "btn-secondary"}
                >
                  처리하기
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}

      <IncidentsListView items={items} />
    </AppShell>
  );
}

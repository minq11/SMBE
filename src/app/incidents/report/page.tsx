import { withTransaction } from "@/server/db";
import { workSession } from "@/server/work-orders";
import { listMyReports } from "@/server/incidents";
import { AppShell } from "@/components/shell/app-shell";
import { tierOf } from "@/components/shell/tier";
import { isCurrentUserOperator } from "@/server/operator";
import { PageHeader } from "@/components/ui/page-header";
import { WorkerReportForm } from "@/features/incidents/report-form";
import { KIND_LABEL, STATUS_LABEL, shortDay } from "@/features/incidents/model";
import "@/features/work-orders/work-orders.css";
import "@/features/incidents/incidents.css";

export const metadata = { title: "사고 신고 · 심플안전" };

/** 로그인한 구성원의 신고 화면. 작업자 홈의 단추가 여기로 온다. */
export default async function ReportIncidentPage() {
  const { session, actor } = await workSession("/incidents/report");
  const [mine, isOperator] = await Promise.all([
    withTransaction((c) => listMyReports(c, actor)),
    isCurrentUserOperator(),
  ]);
  const manager = session.membership?.role !== "WORKER";

  return (
    <AppShell
      active="incident"
      breadcrumb={
        manager
          ? [{ label: "안전사고", href: "/incidents" }, { label: "사고 신고" }]
          : [{ label: "사고 신고" }]
      }
      companyName={session.membership?.company_name}
      tier={tierOf(session.membership)}
      userName={session.user.displayName ?? undefined}
      isAuthenticated
      isOperator={isOperator}
    >
      <PageHeader
        title="사고 신고"
        description="다칠 뻔한 일도 알려 주세요. 관리자에게 바로 갑니다."
        back={manager}
      />
      <WorkerReportForm backHref="/" backLabel="홈으로" />
      {mine.length > 0 && (
        <section className="wo-section" aria-label="내가 신고한 사고">
          <h2>내가 신고한 사고</h2>
          <ul className="row-list" role="list">
            {mine.map((r) => (
              <li key={r.id} className="row row--static">
                <span className="row-main">
                  <strong>
                    {KIND_LABEL[r.kind]} · {r.location}
                  </strong>
                  <small>{r.description}</small>
                </span>
                <span className="row-meta">
                  <span className="row-fact">{shortDay(r.occurred_at)}</span>
                  <span className="row-state">{STATUS_LABEL[r.status]}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </AppShell>
  );
}

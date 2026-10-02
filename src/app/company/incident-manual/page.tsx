import { withTransaction } from "@/server/db";
import { workSession } from "@/server/work-orders";
import { readIncidentManual } from "@/server/company-settings";
import { AppShell } from "@/components/shell/app-shell";
import { tierOf } from "@/components/shell/tier";
import { isCurrentUserOperator } from "@/server/operator";
import { PageHeader } from "@/components/ui/page-header";
import { IncidentManualForm } from "@/features/incidents/manual-form";
import "@/features/profile/profile.css";

export const metadata = { title: "중대재해 대응 절차 · 심플안전" };

export default async function IncidentManualPage() {
  const { session, actor } = await workSession("/company/incident-manual");
  const [manual, isOperator] = await Promise.all([
    withTransaction((c) => readIncidentManual(c, actor.companyId)),
    isCurrentUserOperator(),
  ]);
  const readOnly = session.membership?.role === "WORKER";

  return (
    <AppShell
      active="manual"
      breadcrumb={[{ label: "기준정보" }, { label: "중대재해 대응 절차" }]}
      companyName={session.membership?.company_name}
      tier={tierOf(session.membership)}
      userName={session.user.displayName ?? undefined}
      isAuthenticated
      isOperator={isOperator}
    >
      <PageHeader title="중대재해 대응 절차" />
      <section className="account-panel">
        <p className="wo-muted">
          사고가 나면 누가 무엇을 어떤 순서로 하는지 정해 둔 글입니다 (중처법
          시행령 4조 8호). 기본 문안이 들어 있으니 연락처와 담당만 채워도
          됩니다. 반기 점검 때 이 절차가 지켜졌는지 함께 봅니다.
        </p>
        <IncidentManualForm manual={manual} readOnly={readOnly} />
      </section>
    </AppShell>
  );
}

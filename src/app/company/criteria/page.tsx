import { withTransaction } from "@/server/db";
import { workSession } from "@/server/work-orders";
import { readRiskCriteria } from "@/server/company-settings";
import { OrderShell } from "@/features/work-orders/order-shell";
import { RiskCriteriaForm } from "@/features/company/criteria-form";
import "@/features/profile/profile.css";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "위험성 판단 기준 · 심플안전" };

export default async function CriteriaPage() {
  const { session, actor } = await workSession("/company/criteria");
  const criteria = await withTransaction((c) =>
    readRiskCriteria(c, actor.companyId),
  );
  const readOnly = session.membership?.role === "WORKER";

  return (
    <OrderShell
      session={session}
      title="위험성 수준 판단 기준"
      active="criteria"
    >
      <PageHeader title="위험성 수준 판단 기준" />
      <section className="account-panel">
        <p className="wo-muted">
          위험요인의 위험성을 상·중·하 중 무엇으로 볼지, 어디까지를 허용 가능한
          수준으로 볼지 회사가 정하는 기준입니다. 위험성평가를 만들 때 이 기준이
          자동으로 적용됩니다.
        </p>
        <RiskCriteriaForm criteria={criteria} readOnly={readOnly} />
      </section>
    </OrderShell>
  );
}

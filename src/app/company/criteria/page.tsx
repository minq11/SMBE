import { withTransaction } from "@/server/db";
import { workSession } from "@/server/work-orders";
import {
  readAssessmentPolicy,
  readRiskCriteria,
} from "@/server/company-settings";
import { AssessmentPolicyForm } from "@/features/company/policy-form";
import { OrderShell } from "@/features/work-orders/order-shell";
import { RiskCriteriaForm } from "@/features/company/criteria-form";
import "@/features/profile/profile.css";
import { PageHeader } from "@/components/ui/page-header";
import { HelpDialog } from "@/components/ui/help-dialog";

export const metadata = { title: "위험성 판단 기준 · 심플안전" };

export default async function CriteriaPage() {
  const { session, actor } = await workSession("/company/criteria");
  const [criteria, policy] = await withTransaction(async (c) => [
    await readRiskCriteria(c, actor.companyId),
    await readAssessmentPolicy(c, actor.companyId),
  ]);
  const readOnly = session.membership?.role === "WORKER";

  return (
    <OrderShell
      session={session}
      title="위험성 수준 판단 기준"
      active="criteria"
    >
      <PageHeader title="위험성 수준 판단 기준" />
      <section className="account-panel">
        <div className="wo-section-head">
          <h2>판단 기준</h2>
          <HelpDialog title="판단 기준" variant="icon">
            <dl className="help-rows">
              <dt>무엇</dt>
              <dd>위험요인을 상·중·하 중 무엇으로 볼지, 어디까지 허용할지 회사가 정한 기준.</dd>
              <dt>어디</dt>
              <dd>위험성평가를 만들 때 자동으로 적용됩니다.</dd>
            </dl>
          </HelpDialog>
        </div>
        <RiskCriteriaForm criteria={criteria} readOnly={readOnly} />
      </section>
      <section className="account-panel">
        <div className="wo-section-head">
          <h2>위험성평가 실시규정</h2>
          <HelpDialog title="위험성평가 실시규정" variant="icon">
            <dl className="help-rows">
              <dt>무엇</dt>
              <dd>평가를 왜, 어떤 방법으로, 언제, 누가 하는지 회사가 정해 둔 글.</dd>
              <dt>왜</dt>
              <dd>감독이 오면 판단 기준과 함께 먼저 보는 문서입니다.</dd>
            </dl>
          </HelpDialog>
        </div>
        <AssessmentPolicyForm policy={policy} readOnly={readOnly} />
      </section>
    </OrderShell>
  );
}

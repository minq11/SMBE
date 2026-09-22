import Link from "next/link";
import { withTransaction } from "@/server/db";
import { workSession } from "@/server/work-orders";
import { readRiskCriteria } from "@/server/company-settings";
import { OrderShell } from "@/features/work-orders/order-shell";
import { RiskCriteriaForm } from "@/features/company/criteria-form";
import "@/features/profile/profile.css";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "위험성 판단 기준 · SMBE" };

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
      <section className="account-panel">
        <h2>기준을 바꾸면</h2>
        <p className="wo-muted">
          <strong>이미 승인된 평가는 그대로 유지됩니다.</strong> 평가는 만들 때
          그 시점의 기준을 사본으로 보관하므로, 기준을 바꿔도 과거 기록이 소급해
          바뀌지 않습니다. 새 기준은 이후 만드는 평가부터 적용됩니다.
        </p>
        <p className="wo-muted">
          등급은 상·중·하 3단계로 고정입니다. 회사가 정하는 것은 단계 수가
          아니라 각 단계의 의미와 허용 가능 경계입니다.{" "}
          <Link href="/standards">작업표준서</Link> 의 위험성평가도 이 기준을
          따릅니다.
        </p>
      </section>
    </OrderShell>
  );
}

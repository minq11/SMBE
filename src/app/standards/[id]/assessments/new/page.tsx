import { notFound, redirect } from "next/navigation";
import { tierOf } from "@/components/shell/tier";
import { AppShell } from "@/components/shell/app-shell";
import { getCurrentSession } from "@/server/session";
import { isCurrentUserOperator } from "@/server/operator";
import {
  getStandardDetail,
  listCompanyMembersForPicker,
} from "@/server/standards-service";
import { withTransaction } from "@/server/db";
import { readRiskCriteria } from "@/server/company-settings";
import { AssessmentForm } from "@/features/standards/assessment-form";
import { riskSeedFromItem } from "@/features/standards/constants";

export const metadata = { title: "평가 회차 추가 · 심플안전" };

export default async function NewAssessmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (!session.membership || session.membership.status !== "ACTIVE")
    redirect("/onboarding");
  if (session.membership.role === "WORKER") redirect("/");

  const { id } = await params;
  const companyId = session.membership.company_id;
  const [detail, members, isOperator, criteria] = await Promise.all([
    getStandardDetail(companyId, id),
    listCompanyMembersForPicker(companyId),
    isCurrentUserOperator(),
    withTransaction((c) => readRiskCriteria(c, companyId)),
  ]);
  if (!detail) notFound();
  if (detail.status === "ARCHIVED") redirect(`/standards/${id}`);

  // 정기평가는 지난 평가를 다시 보는 일이다. 지난 회차의 위험요인·대책까지
  // 채워 두고 바뀐 것만 고치게 한다 (조치 끝난 항목은 조치 후 판정으로).
  const cur = detail.current_assessment;
  const seed = cur
    ? {
        work_method: cur.work_method,
        safety_info: cur.safety_info,
        risks: cur.risks.map(riskSeedFromItem),
      }
    : undefined;

  return (
    <AppShell
      active="standards"
      breadcrumb={[
        { label: "작업표준서", href: "/standards" },
        { label: detail.name, href: `/standards/${id}` },
        { label: "평가 회차 추가" },
      ]}
      companyName={session.membership.company_name}
      tier={tierOf(session.membership)}
      userName={session.user.displayName ?? undefined}
      isAuthenticated={true}
      isOperator={isOperator}
    >
      <AssessmentForm
        standardId={id}
        standardName={detail.name}
        members={members}
        criteria={criteria}
        seed={seed}
      />
    </AppShell>
  );
}

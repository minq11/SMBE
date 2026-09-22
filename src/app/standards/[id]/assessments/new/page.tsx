import { notFound, redirect } from "next/navigation";
import { tierOf } from "@/components/shell/tier";
import { AppShell } from "@/components/shell/app-shell";
import { getCurrentSession } from "@/server/session";
import { isCurrentUserOperator } from "@/server/operator";
import {
  getStandardDetail,
  listCompanyMembersForPicker,
} from "@/server/standards-service";
import { AssessmentForm } from "@/features/standards/assessment-form";

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
  const [detail, members, isOperator] = await Promise.all([
    getStandardDetail(session.membership.company_id, id),
    listCompanyMembersForPicker(session.membership.company_id),
    isCurrentUserOperator(),
  ]);
  if (!detail) notFound();
  if (detail.status === "ARCHIVED") redirect(`/standards/${id}`);

  // 이전 회차 값을 재사용해 입력 부담을 줄이기 위한 seed
  const seed = detail.current_assessment
    ? {
        work_method: detail.current_assessment.work_method,
        criteria: detail.current_assessment.criteria,
        safety_info: detail.current_assessment.safety_info,
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
        seed={seed}
      />
    </AppShell>
  );
}

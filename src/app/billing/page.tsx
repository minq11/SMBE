import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/session";
import { isCurrentUserOperator } from "@/server/operator";
import { getCompanyOverview } from "@/server/members";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { BillingView } from "@/features/billing/billing-view";

export const metadata = { title: "요금제 · SMBE" };

export default async function BillingPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login?next=/billing");
  if (!session.membership || session.membership.status !== "ACTIVE") {
    redirect("/onboarding");
  }
  if (session.membership.role === "WORKER") {
    redirect("/");
  }

  const [overview, isOperator] = await Promise.all([
    getCompanyOverview(session.membership.company_id),
    isCurrentUserOperator(),
  ]);
  if (!overview) redirect("/onboarding");

  return (
    <AppShell
      active="billing"
      breadcrumb={[
        { label: "회사정보", href: "/company/members" },
        { label: "이용·관리" },
        { label: "요금제" },
      ]}
      companyName={session.membership.company_name}
      userName={session.user.displayName ?? undefined}
      isAuthenticated={true}
      isOperator={isOperator}
    >
      <PageHeader
        title="요금제"
        description="인원 수와 무관하게 텍스트 기반 기능은 무료로 사용할 수 있습니다. Pro 는 아래의 부가 기능이 필요할 때 자발적으로 전환하는 선택입니다."
      />
      <BillingView overview={overview} />
    </AppShell>
  );
}

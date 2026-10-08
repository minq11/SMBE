import { redirect } from "next/navigation";
import { tierOf } from "@/components/shell/tier";
import { getCurrentSession } from "@/server/session";
import { isCurrentUserOperator } from "@/server/operator";
import { getCompanyOverview } from "@/server/members";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { BillingView } from "@/features/billing/billing-view";

export const metadata = { title: "요금제 · 심플안전" };

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
        { label: "기준정보", href: "/company/members" },
        { label: "이용·관리" },
        { label: "요금제" },
      ]}
      companyName={session.membership.company_name}
      tier={tierOf(session.membership)}
      userName={session.user.displayName ?? undefined}
      isAuthenticated={true}
      isOperator={isOperator}
    >
      <PageHeader
        title="요금제"
        description="글로 쓰는 기능은 인원과 무관하게 무료. 멤버십은 아래 부가 기능이 필요할 때."
      />
      <BillingView overview={overview} />
    </AppShell>
  );
}

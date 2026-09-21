import Link from "next/link";
import { tierOf } from "@/components/shell/tier";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentSession } from "@/server/session";
import { isCurrentUserOperator } from "@/server/operator";
import { listStandards } from "@/server/standards-service";
import { StandardsListView } from "@/features/standards/standards-list-view";

export const metadata = { title: "작업표준서 · SMBE" };

export default async function StandardsPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login?next=/standards");
  if (!session.membership || session.membership.status !== "ACTIVE") {
    redirect("/onboarding");
  }
  if (session.membership.role === "WORKER") redirect("/");

  const [items, isOperator] = await Promise.all([
    listStandards(session.membership.company_id),
    isCurrentUserOperator(),
  ]);

  return (
    <AppShell
      active="standards"
      breadcrumb={[{ label: "작업표준서" }]}
      companyName={session.membership.company_name}
      tier={tierOf(session.membership)}
      userName={session.user.displayName ?? undefined}
      isAuthenticated={true}
      isOperator={isOperator}
    >
      <PageHeader
        title="작업표준서"
        description="반복 작업의 방법·체크리스트·위험성평가를 표준서로 한 번 등록하면 이후 지시서에서 바로 선택해 사용할 수 있습니다."
        actions={
          <Link href="/standards/new" className="primary-button">
            <Plus size={14} /> 표준서 만들기
          </Link>
        }
      />
      <StandardsListView items={items} />
    </AppShell>
  );
}

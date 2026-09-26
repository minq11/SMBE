import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/session";
import { tierOf } from "@/components/shell/tier";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { HelpView } from "@/features/help/help-view";

export const metadata = { title: "도움말 · 심플안전" };

export default async function HelpPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login?next=/help");
  return (
    <AppShell
      active="help"
      breadcrumb={[{ label: "도움말" }]}
      companyName={session.membership?.company_name ?? "소속 회사 없음"}
      tier={tierOf(session.membership)}
      userName={session.user.displayName ?? undefined}
      isAuthenticated
    >
      <PageHeader
        title="도움말"
        description="처음 시작하는 길과 자주 막히는 곳."
      />
      <HelpView />
    </AppShell>
  );
}

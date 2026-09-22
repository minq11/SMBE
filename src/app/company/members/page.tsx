import { redirect } from "next/navigation";
import { tierOf } from "@/components/shell/tier";
import { headers } from "next/headers";
import { getCurrentSession } from "@/server/session";
import { isCurrentUserOperator } from "@/server/operator";
import {
  getCompanyOverview,
  listMembers,
  listOpenInvites,
} from "@/server/members";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { MembersView } from "@/features/members/members-view";

export const metadata = { title: "인원관리 · 심플안전" };

async function currentOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export default async function CompanyMembersPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (!session.membership || session.membership.status !== "ACTIVE") {
    redirect("/onboarding");
  }
  if (session.membership.role === "WORKER") {
    redirect("/");
  }

  const companyId = session.membership.company_id;
  const [overview, members, openInvites, origin, isOperator] = await Promise.all([
    getCompanyOverview(companyId),
    listMembers(companyId),
    listOpenInvites(companyId),
    currentOrigin(),
    isCurrentUserOperator(),
  ]);

  if (!overview) redirect("/onboarding");

  return (
    <AppShell
      active="company"
      breadcrumb={[
        { label: "회사정보", href: "/company/members" },
        { label: "인원관리" },
      ]}
      companyName={session.membership.company_name}
      tier={tierOf(session.membership)}
      userName={session.user.displayName ?? undefined}
      isAuthenticated={true}
      isOperator={isOperator}
    >
      <PageHeader
        title="인원관리"
        description="구성원 초대·가입 승인·역할 변경·퇴사 처리를 이곳에서 관리합니다."
      />
      <MembersView
        overview={overview}
        members={members}
        openInvites={openInvites}
        origin={origin}
        managerRole={session.membership.role}
        currentUserId={session.user.id}
      />
    </AppShell>
  );
}

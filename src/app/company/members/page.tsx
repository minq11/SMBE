import { redirect } from "next/navigation";
import { tierOf } from "@/components/shell/tier";
import { requestOrigin } from "@/server/request-origin";
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

export default async function CompanyMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ via?: string }>;
}) {
  const { via } = await searchParams;
  // 승인 요청 메일의 링크. 로그인부터 해야 하면 그 뒤에 같은 주소로 돌아온다.
  const fromMail = via === "acceptlink";
  const session = await getCurrentSession();
  if (!session)
    redirect(
      fromMail
        ? "/login?next=" + encodeURIComponent("/company/members?via=acceptlink")
        : "/login",
    );
  if (!session.membership || session.membership.status !== "ACTIVE") {
    redirect("/onboarding");
  }
  if (session.membership.role === "WORKER") {
    redirect("/");
  }

  const companyId = session.membership.company_id;
  const [overview, members, openInvites, origin, isOperator] =
    await Promise.all([
      getCompanyOverview(companyId),
      listMembers(companyId),
      listOpenInvites(companyId),
      requestOrigin(),
      isCurrentUserOperator(),
    ]);

  if (!overview) redirect("/onboarding");

  return (
    <AppShell
      active="company"
      breadcrumb={[
        { label: "기준정보", href: "/company/members" },
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
        initialTab={fromMail ? "pending" : undefined}
        focusTabs={fromMail}
      />
    </AppShell>
  );
}

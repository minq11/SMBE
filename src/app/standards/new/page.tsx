import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { getCurrentSession } from "@/server/session";
import { isCurrentUserOperator } from "@/server/operator";
import { listCompanyMembersForPicker } from "@/server/standards-service";
import { StandardForm } from "@/features/standards/standard-form";

export const metadata = { title: "새 표준서 · SMBE" };

export default async function NewStandardPage({
  searchParams,
}: {
  searchParams: Promise<{ return?: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/login?next=/standards/new");
  if (!session.membership || session.membership.status !== "ACTIVE") {
    redirect("/onboarding");
  }
  if (session.membership.role === "WORKER") redirect("/");

  const { return: returnParam } = await searchParams;
  const returnHref =
    returnParam && returnParam.startsWith("/") && !returnParam.startsWith("//")
      ? returnParam
      : undefined;

  const [members, isOperator] = await Promise.all([
    listCompanyMembersForPicker(session.membership.company_id),
    isCurrentUserOperator(),
  ]);

  return (
    <AppShell
      active="standards"
      breadcrumb={[
        { label: "작업표준서", href: "/standards" },
        { label: "새 표준서" },
      ]}
      companyName={session.membership.company_name}
      userName={session.user.displayName ?? undefined}
      isAuthenticated={true}
      isOperator={isOperator}
    >
      <StandardForm members={members} returnHref={returnHref} />
    </AppShell>
  );
}

import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { getCurrentSession } from "@/server/session";
import { isCurrentUserOperator } from "@/server/operator";
import { getStandardDetail } from "@/server/standards-service";
import { StandardDetailView } from "@/features/standards/standard-detail-view";

export const metadata = { title: "표준서 상세 · SMBE" };

export default async function StandardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (!session.membership || session.membership.status !== "ACTIVE") {
    redirect("/onboarding");
  }
  if (session.membership.role === "WORKER") redirect("/");

  const { id } = await params;
  const detail = await getStandardDetail(session.membership.company_id, id);
  if (!detail) notFound();
  const isOperator = await isCurrentUserOperator();

  return (
    <AppShell
      active="standards"
      breadcrumb={[
        { label: "작업표준서", href: "/standards" },
        { label: detail.name },
      ]}
      companyName={session.membership.company_name}
      userName={session.user.displayName ?? undefined}
      isAuthenticated={true}
      isOperator={isOperator}
    >
      <StandardDetailView detail={detail} />
    </AppShell>
  );
}

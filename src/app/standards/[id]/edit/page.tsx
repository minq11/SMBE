import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { getCurrentSession } from "@/server/session";
import { isCurrentUserOperator } from "@/server/operator";
import { getStandardDetail } from "@/server/standards-service";
import { StandardEditForm } from "@/features/standards/standard-edit-form";

export const metadata = { title: "표준서 수정 · SMBE" };

export default async function EditStandardPage({
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
  const [detail, isOperator] = await Promise.all([
    getStandardDetail(session.membership.company_id, id),
    isCurrentUserOperator(),
  ]);
  if (!detail) notFound();
  if (detail.status === "ARCHIVED") redirect(`/standards/${id}`);

  return (
    <AppShell
      active="standards"
      breadcrumb={[
        { label: "작업표준서", href: "/standards" },
        { label: detail.name, href: `/standards/${id}` },
        { label: "수정" },
      ]}
      companyName={session.membership.company_name}
      userName={session.user.displayName ?? undefined}
      isAuthenticated={true}
      isOperator={isOperator}
    >
      <StandardEditForm
        standardId={id}
        initial={{
          name: detail.name,
          ptw_required: detail.ptw_required,
          steps:
            detail.steps.length > 0
              ? detail.steps.map((s) => s.step_text)
              : [""],
          checklist_tbm:
            detail.checklist_tbm.length > 0 ? detail.checklist_tbm : [""],
          checklist_during:
            detail.checklist_during.length > 0
              ? detail.checklist_during
              : [""],
        }}
      />
    </AppShell>
  );
}

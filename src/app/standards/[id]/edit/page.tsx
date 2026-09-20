import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { getCurrentSession } from "@/server/session";
import { isCurrentUserOperator } from "@/server/operator";
import { getStandardDetail } from "@/server/standards-service";
import { listAttachments } from "@/server/attachments";
import { query } from "@/server/db";
import {
  StandardEditForm,
  type StepAttachmentMap,
} from "@/features/standards/standard-edit-form";

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
  const actor = {
    companyId: session.membership.company_id,
    userId: session.user.id,
  };
  const [detail, isOperator, proRow] = await Promise.all([
    getStandardDetail(session.membership.company_id, id),
    isCurrentUserOperator(),
    query<{ pro_state: string }>(
      "SELECT pro_state FROM companies WHERE id = $1",
      [session.membership.company_id],
    ),
  ]);
  if (!detail) notFound();
  if (detail.status === "ARCHIVED") redirect(`/standards/${id}`);
  const isPro = (proRow[0]?.pro_state ?? "FREE") !== "FREE";

  // 스텝별 첨부 (Pro 여부와 관계없이 이미 올라간 사진은 표시).
  const stepAttachments: StepAttachmentMap = {};
  for (const s of detail.steps) {
    stepAttachments[s.id] = await listAttachments(actor, "standard_step", s.id);
  }

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
        isPro={isPro}
        stepAttachments={stepAttachments}
        initial={{
          name: detail.name,
          ptw_required: detail.ptw_required,
          steps:
            detail.steps.length > 0
              ? detail.steps.map((s) => ({ id: s.id, text: s.step_text }))
              : [{ text: "" }],
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

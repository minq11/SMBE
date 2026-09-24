import { notFound, redirect } from "next/navigation";
import { tierOf } from "@/components/shell/tier";
import { AppShell } from "@/components/shell/app-shell";
import { getCurrentSession } from "@/server/session";
import { isCurrentUserOperator } from "@/server/operator";
import {
  getRevisionContent,
  getStandardDetail,
} from "@/server/standards-service";
import { listAttachments } from "@/server/attachments";
import { query } from "@/server/db";
import {
  StandardEditForm,
  type StepAttachmentMap,
} from "@/features/standards/standard-edit-form";

export const metadata = { title: "표준서 개정 · 심플안전" };

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
  // 승인된 판은 고치지 않는다. 고칠 수 있는 건 개정 초안뿐 — 없으면 상세로 보내
  // "개정 시작" 을 누르게 한다.
  const draft = await getRevisionContent(session.membership.company_id, id, {
    status: "DRAFT",
  });
  if (!draft) redirect(`/standards/${id}`);
  const isPro = (proRow[0]?.pro_state ?? "FREE") !== "FREE";

  // 스텝별 첨부 (Pro 여부와 관계없이 이미 올라간 사진은 표시).
  const stepAttachments: StepAttachmentMap = {};
  for (const s of draft.steps) {
    stepAttachments[s.id] = await listAttachments(actor, "standard_step", s.id);
  }

  return (
    <AppShell
      active="standards"
      breadcrumb={[
        { label: "작업표준서", href: "/standards" },
        { label: detail.name, href: `/standards/${id}` },
        { label: `${draft.revision_no}판 개정` },
      ]}
      companyName={session.membership.company_name}
      tier={tierOf(session.membership)}
      userName={session.user.displayName ?? undefined}
      isAuthenticated={true}
      isOperator={isOperator}
    >
      <StandardEditForm
        standardId={id}
        revisionNo={draft.revision_no}
        isPro={isPro}
        stepAttachments={stepAttachments}
        initial={{
          name: draft.name,
          ptw_required: draft.ptw_required,
          steps:
            draft.steps.length > 0
              ? draft.steps.map((s) => ({ id: s.id, text: s.step_text }))
              : [{ text: "" }],
          checklist_tbm:
            draft.checklist_tbm.length > 0 ? draft.checklist_tbm : [""],
          checklist_during:
            draft.checklist_during.length > 0 ? draft.checklist_during : [""],
          change_note: draft.change_note ?? "",
        }}
      />
    </AppShell>
  );
}

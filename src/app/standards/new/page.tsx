import { notFound, redirect } from "next/navigation";
import { tierOf } from "@/components/shell/tier";
import { AppShell } from "@/components/shell/app-shell";
import { getCurrentSession } from "@/server/session";
import { isCurrentUserOperator } from "@/server/operator";
import {
  getStandardDraft,
  listCompanyMembersForPicker,
} from "@/server/standards-service";
import { withTransaction } from "@/server/db";
import { readRiskCriteria } from "@/server/company-settings";
import { StandardForm } from "@/features/standards/standard-form";
import { assessmentReferences } from "@/server/assessment-references";

export const metadata = { title: "새 표준서 · 심플안전" };

export default async function NewStandardPage({
  searchParams,
}: {
  searchParams: Promise<{ return?: string; draft?: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/login?next=/standards/new");
  if (!session.membership || session.membership.status !== "ACTIVE") {
    redirect("/onboarding");
  }
  if (session.membership.role === "WORKER") redirect("/");

  const { return: returnParam, draft: draftParam } = await searchParams;
  const returnHref =
    returnParam && returnParam.startsWith("/") && !returnParam.startsWith("//")
      ? returnParam
      : undefined;

  const companyId = session.membership.company_id;
  const [members, isOperator, criteria, references, draft] = await Promise.all([
    listCompanyMembersForPicker(companyId),
    isCurrentUserOperator(),
    withTransaction((c) => readRiskCriteria(c, companyId)),
    withTransaction((c) => assessmentReferences(c, companyId)),
    // 작성 중 초안을 이어서 쓴다 (?draft=). 확정된 표준서면 없는 것으로.
    draftParam && /^[0-9a-f-]{36}$/.test(draftParam)
      ? getStandardDraft(companyId, draftParam)
      : Promise.resolve(null),
  ]);
  if (draftParam && !draft) notFound();

  return (
    <AppShell
      active="standards"
      breadcrumb={[
        { label: "작업표준서", href: "/standards" },
        { label: draft ? "이어서 작성" : "새 표준서" },
      ]}
      companyName={session.membership.company_name}
      tier={tierOf(session.membership)}
      userName={session.user.displayName ?? undefined}
      isAuthenticated={true}
      isOperator={isOperator}
    >
      <StandardForm
        criteria={criteria}
        members={members}
        returnHref={returnHref}
        draft={
          draft
            ? {
                id: draft.standard_id,
                name: draft.name,
                ptw_required: draft.ptw_required,
                ppe: draft.ppe,
                caution: draft.caution,
                steps: draft.steps.map((s) => s.step_text),
                checklist_tbm: draft.checklist_tbm,
                checklist_during: draft.checklist_during,
              }
            : undefined
        }
        isPro={tierOf(session.membership) === "멤버십"}
        references={references}
      />
    </AppShell>
  );
}

import { notFound, redirect } from "next/navigation";
import { tierOf } from "@/components/shell/tier";
import { AppShell } from "@/components/shell/app-shell";
import { getCurrentSession } from "@/server/session";
import { isCurrentUserOperator } from "@/server/operator";
import { getStandardDetail } from "@/server/standards-service";
import { listAttachments } from "@/server/attachments";
import { query } from "@/server/db";
import {
  StandardDetailView,
  type AttachmentMap,
} from "@/features/standards/standard-detail-view";

export const metadata = { title: "표준서 상세 · 심플안전" };

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
  const isPro = (proRow[0]?.pro_state ?? "FREE") !== "FREE";

  // 스텝 + 위험요인(before/after) 첨부 배치 조회
  const stepAttachments: AttachmentMap = {};
  for (const s of detail.steps) {
    stepAttachments[s.id] = await listAttachments(actor, "standard_step", s.id);
  }
  const riskBefore: AttachmentMap = {};
  const riskAfter: AttachmentMap = {};
  if (detail.current_assessment) {
    for (const r of detail.current_assessment.risks) {
      riskBefore[r.id] = await listAttachments(actor, "risk_item_before", r.id);
      riskAfter[r.id] = await listAttachments(actor, "risk_item_after", r.id);
    }
  }

  return (
    <AppShell
      active="standards"
      breadcrumb={[
        { label: "작업표준서", href: "/standards" },
        { label: detail.name },
      ]}
      companyName={session.membership.company_name}
      tier={tierOf(session.membership)}
      userName={session.user.displayName ?? undefined}
      isAuthenticated={true}
      isOperator={isOperator}
    >
      <StandardDetailView
        detail={detail}
        isPro={isPro}
        stepAttachments={stepAttachments}
        riskBefore={riskBefore}
        riskAfter={riskAfter}
      />
    </AppShell>
  );
}

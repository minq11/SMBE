import { notFound, redirect } from "next/navigation";
import { withTransaction } from "@/server/db";
import { readRiskCriteria } from "@/server/company-settings";
import { z } from "zod";
import {
  workSession,
  orderMembers,
  orderDetail,
  listLocationSuggestions,
} from "@/server/work-orders";
import {
  getStandardForPrefill,
  listUsableStandards,
} from "@/server/standards-service";
import { WorkOrderError } from "@/features/work-orders/model";
import {
  WorkOrderForm,
  type StandardPickerOption,
} from "@/features/work-orders/work-order-form";
import { OrderShell } from "@/features/work-orders/order-shell";
import { PageHeader } from "@/components/ui/page-header";

export default async function EditOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ issue_error?: string }>;
}) {
  const { id } = await params;
  const { issue_error: issueError } = await searchParams;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { session, actor } = await workSession(
    "/work-orders/" + id + "/edit",
    true,
  );
  const detail = await orderDetail(actor, id).catch((error) => {
    if (error instanceof WorkOrderError) notFound();
    throw error;
  });
  if (detail.order.status !== "DRAFT") redirect("/work-orders/" + id);
  const companyCriteria = await withTransaction((c) =>
    readRiskCriteria(c, actor.companyId),
  );

  const [members, locations, usable] = await Promise.all([
    orderMembers(actor),
    listLocationSuggestions(actor.companyId),
    listUsableStandards(actor.companyId),
  ]);
  const activeMemberIds = new Set(members.map((m) => m.user_id));
  const standards: StandardPickerOption[] = await Promise.all(
    usable.map(async (s) => {
      const prefill = await getStandardForPrefill(
        actor.companyId,
        s.standard_id,
      );
      return {
        id: s.standard_id,
        name: s.name,
        ptw_required: s.ptw_required,
        prefill: prefill
          ? {
              name: prefill.name,
              ptw_required: prefill.ptw_required,
              method: prefill.work_method,
              tbm: prefill.checklist_tbm,
              during: prefill.checklist_during,
              safetyInfo: prefill.safety_info,
              risks: prefill.risks.map((r) => ({
                hazard: r.hazard,
                level: r.initial_risk_level,
                allowable: r.initial_allowable ? "yes" : "no",
                measure: r.reduction_measure,
                responsibleId:
                  r.responsible_user_id &&
                  activeMemberIds.has(r.responsible_user_id)
                    ? r.responsible_user_id
                    : "",
                dueDate: r.planned_completion_date ?? "",
              })),
              participantIds: prefill.participant_ids.filter((uid) =>
                activeMemberIds.has(uid),
              ),
            }
          : null,
      };
    }),
  );

  return (
    <OrderShell session={session} title="작업지시 편집">
      <PageHeader
        title="작업지시 편집"
        description="저장하면 기존 평가 승인 연결이 해제되며 다시 검토·승인해야 합니다."
      />
      {issueError && (
        <div className="wo-issue-error-banner" role="alert">
          <strong>발급이 완료되지 않았습니다</strong>
          <p>{issueError}</p>
          <p className="wo-muted">
            초안은 저장되어 있으니 위 오류를 해결한 뒤 4단계에서 다시 발급을
            시도하세요. 임시저장으로도 계속 이어서 작성할 수 있습니다.
          </p>
        </div>
      )}
      <WorkOrderForm
        id={id}
        revision={detail.order.revision}
        initial={{
          ...detail.order.draft_data,
          // 판단 기준은 회사가 정한 현재 값을 보여 준다 (초안에 박힌 옛 값이 아니라).
          criteria: companyCriteria,
        }}
        members={members}
        standards={standards}
        initialStandardId={detail.order.draft_data.standardId ?? null}
        locations={locations}
      />
    </OrderShell>
  );
}

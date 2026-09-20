import { notFound, redirect } from "next/navigation";
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
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  const [members, locations, usable] = await Promise.all([
    orderMembers(actor),
    listLocationSuggestions(actor.companyId),
    listUsableStandards(actor.companyId),
  ]);
  const activeMemberIds = new Set(members.map((m) => m.user_id));
  const standards: StandardPickerOption[] = await Promise.all(
    usable.map(async (s) => {
      const prefill = await getStandardForPrefill(actor.companyId, s.standard_id);
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
              criteria: prefill.criteria,
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
      <WorkOrderForm
        id={id}
        revision={detail.order.revision}
        initial={detail.order.draft_data}
        members={members}
        standards={standards}
        initialStandardId={detail.order.draft_data.standardId ?? null}
        locations={locations}
      />
    </OrderShell>
  );
}

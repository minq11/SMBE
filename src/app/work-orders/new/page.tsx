import { randomUUID } from "node:crypto";
import { withTransaction } from "@/server/db";
import { readRiskCriteria } from "@/server/company-settings";
import { notFound } from "next/navigation";
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
import { WorkOrderError, blankDraft } from "@/features/work-orders/model";
import {
  WorkOrderForm,
  type StandardPickerOption,
} from "@/features/work-orders/work-order-form";
import { OrderShell } from "@/features/work-orders/order-shell";

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ copy?: string; standard?: string }>;
}) {
  const { session, actor } = await workSession("/work-orders/new", true);
  const { copy, standard: standardParam } = await searchParams;
  const [members, locations] = await Promise.all([
    orderMembers(actor),
    listLocationSuggestions(actor.companyId),
  ]);

  // 판단 기준은 회사가 정한 값을 쓴다. 화면에서는 읽기 전용이고,
  // 평가 요청 시 서버가 다시 회사 값으로 스냅샷을 뜬다.
  const companyCriteria = await withTransaction((c) =>
    readRiskCriteria(c, actor.companyId),
  );
  let initial = blankDraft();
  if (copy) {
    if (!z.string().uuid().safeParse(copy).success) notFound();
    try {
      const { order } = await orderDetail(actor, copy);
      const active = new Set(members.map((m) => m.user_id));
      initial = {
        ...order.draft_data,
        startDate: "",
        endDate: "",
        participantIds: order.draft_data.participantIds.filter((id) =>
          active.has(id),
        ),
        assigneeIds: order.draft_data.assigneeIds.filter((id) =>
          active.has(id),
        ),
        risks: order.draft_data.risks.map((r) => ({
          ...r,
          responsibleId: active.has(r.responsibleId) ? r.responsibleId : "",
        })),
      };
    } catch (error) {
      if (error instanceof WorkOrderError) notFound();
      throw error;
    }
  }

  const usable = await listUsableStandards(actor.companyId);
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
              participantIds: prefill.participant_ids.filter((id) =>
                activeMemberIds.has(id),
              ),
            }
          : null,
      };
    }),
  );

  const initialStandardId =
    standardParam &&
    z.string().uuid().safeParse(standardParam).success &&
    standards.some((s) => s.id === standardParam)
      ? standardParam
      : null;

  return (
    <OrderShell
      session={session}
      title={copy ? "작업지시 복사" : "새 작업지시"}
    >
      <WorkOrderForm
        criteria={companyCriteria}
        id={randomUUID()}
        revision={0}
        title={copy ? "작업지시 복사" : "새 작업지시"}
        description={
          copy
            ? "작업일과 승인·발급 정보는 초기화됩니다. 평가일·위험요인·참여자와 배정 인원을 다시 확인하세요."
            : "표준서에서 시작하는 것을 권장합니다. 표준서가 없으면 간이 위험성평가로 대체할 수 있습니다."
        }
        initial={initial}
        members={members}
        standards={standards}
        initialStandardId={initialStandardId}
        locations={locations}
      />
    </OrderShell>
  );
}

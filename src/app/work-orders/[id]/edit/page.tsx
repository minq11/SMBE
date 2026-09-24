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
  listApprovedStandards,
} from "@/server/standards-service";
import { WorkOrderError } from "@/features/work-orders/model";
import {
  WorkOrderForm,
  type StandardPickerOption,
} from "@/features/work-orders/work-order-form";
import { OrderShell } from "@/features/work-orders/order-shell";
import { DeleteDraftButton } from "@/features/work-orders/order-controls";
import { DraftReview } from "@/features/work-orders/draft-review";

const ACTIONS: Record<string, string> = {
  CREATE: "초안 생성",
  UPDATE: "초안 변경",
  SUBMIT_ASSESSMENT: "평가 승인 요청",
  APPROVE_ASSESSMENT: "평가 승인",
};
const dateTime = (value: string) =>
  new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

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
    listApprovedStandards(actor.companyId),
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
        usable: s.usable && prefill !== null,
        blockedReason: s.blocked_reason,
        prefill: prefill
          ? {
              name: prefill.name,
              ptw_required: prefill.ptw_required,
              revisionId: prefill.revision_id,
              revisionNo: prefill.revision_no,
              method: prefill.work_method,
              tbm: prefill.checklist_tbm,
              during: prefill.checklist_during,
              safetyInfo: prefill.safety_info,
              risks: prefill.risks.map((r) => ({
                hazard: r.hazard,
                currentControl: r.current_control ?? "",
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

  const { order } = detail;
  // 작성 중인 지시서는 조회 화면을 거치지 않고 바로 이 편집 화면으로 열린다.
  // 그래서 조회 화면에 있던 검토·발급, 초안 삭제, 변경 이력이 여기 딸려 온다.
  return (
    <OrderShell session={session} title={order.name || "작업지시 편집"}>
      <WorkOrderForm
        id={id}
        revision={order.revision}
        title="작업지시 편집"
        description={
          order.assessment_status
            ? "평가가 " +
              (order.assessment_status === "APPROVED"
                ? "승인된"
                : "검토 중인") +
              " 초안입니다. 내용을 고쳐 저장하면 승인 연결이 해제되어 다시 검토·승인해야 합니다."
            : undefined
        }
        notice={
          issueError && (
            <div className="wo-issue-error-banner" role="alert">
              <strong>발급이 완료되지 않았습니다</strong>
              <p>{issueError}</p>
              <p className="wo-muted">
                초안은 저장되어 있으니 위 오류를 해결한 뒤 4단계에서 다시 발급을
                시도하세요. 임시저장으로도 계속 이어서 작성할 수 있습니다.
              </p>
            </div>
          )
        }
        review={
          <DraftReview
            id={id}
            revision={order.revision}
            assessmentStatus={order.assessment_status}
            performedOn={order.draft_data.performedOn}
            approvedAt={order.approved_at}
            ptwRequired={order.draft_data.ptwRequired}
          />
        }
        footer={
          <>
            {/* 삭제는 버튼 하나면 되는 동작이라 절을 만들지 않는다. 목록 행에도
                같은 버튼이 있다. 지우면 이 자리가 404 가 되니 목록으로 보낸다. */}
            <section className="wo-section wo-editor-delete">
              <p className="wo-muted">
                잘못 만든 초안이면 지울 수 있습니다. 발급된 지시서는 삭제가
                아니라 취소로 처리합니다.
              </p>
              <DeleteDraftButton
                id={id}
                revision={order.revision}
                name={order.name}
                next="/work-orders?tab=draft"
              />
            </section>
            <section className="wo-section">
              <h2>변경 이력</h2>
              <ul className="wo-history">
                {detail.history.map((h, i) => (
                  <li key={i}>
                    <time>{dateTime(h.at)}</time>
                    <span>
                      {ACTIONS[h.action] || h.action}
                      {h.is_self_approval ? " · 본인 승인" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        }
        initial={order.draft_data}
        criteria={companyCriteria}
        members={members}
        standards={standards}
        initialStandardId={order.draft_data.standardId ?? null}
        locations={locations}
      />
    </OrderShell>
  );
}

"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentSession } from "@/server/session";
import { withTransaction } from "@/server/db";
import {
  saveOrder,
  requestAssessment,
  approveAssessment,
  approveAndIssueOrder,
  issueOrder,
  cancelOrder,
} from "@/server/work-order-service";
import { deliverOrder } from "@/server/work-order-delivery";
import { WorkOrderError } from "./model";

export type WorkActionState = { error?: string; message?: string } | undefined;
async function actor() {
  const s = await getCurrentSession();
  if (
    !s?.membership ||
    s.membership.status !== "ACTIVE" ||
    s.membership.role === "WORKER"
  )
    throw new WorkOrderError("현재 회사의 관리자만 사용할 수 있습니다.");
  return { companyId: s.membership.company_id, userId: s.user.id };
}
function safeError(error: unknown): WorkActionState {
  return {
    error:
      error instanceof WorkOrderError
        ? error.message
        : "처리하지 못했습니다. 새로고침 후 다시 시도하세요.",
  };
}
const targetSchema = z.object({
  id: z.string().uuid(),
  revision: z.coerce.number().int().min(0).max(2147483647),
});
function refresh(id: string) {
  revalidatePath("/work-orders");
  revalidatePath("/work-orders/" + id);
  revalidatePath("/");
}
export async function saveOrderAction(
  _prev: WorkActionState,
  form: FormData,
): Promise<WorkActionState> {
  let id: string;
  try {
    const target = targetSchema.parse({
      id: form.get("id"),
      revision: form.get("revision"),
    });
    const raw = form.get("payload");
    if (typeof raw !== "string" || raw.length > 250000)
      throw new WorkOrderError("입력 데이터가 너무 큽니다.");
    const context = await actor();
    id = await withTransaction((client) =>
      saveOrder(client, context, target.id, target.revision, JSON.parse(raw)),
    );
  } catch (error) {
    return safeError(error);
  }
  refresh(id);
  // 임시저장 후엔 목록·상세로 튕기지 않고 편집 페이지에 머무름 (계속 작성 가능)
  redirect("/work-orders/" + id + "/edit");
}
/**
 * 체크리스트·검토 단계에서 "지금 발급하기" 를 누르면 실행되는 액션.
 * 저장 → 평가 승인 요청 → 본인 승인·발급 → 링크 전달을 순차로 수행한다.
 * 각 단계에서 revision 이 증가하므로 매번 최신 값을 조회해서 다음 단계에 전달한다.
 */
export async function saveAndIssueAction(
  _prev: WorkActionState,
  form: FormData,
): Promise<WorkActionState> {
  let id: string;
  try {
    const target = targetSchema.parse({
      id: form.get("id"),
      revision: form.get("revision"),
    });
    const raw = form.get("payload");
    if (typeof raw !== "string" || raw.length > 250000)
      throw new WorkOrderError("입력 데이터가 너무 큽니다.");
    const context = await actor();
    id = target.id;

    // 1) save (own tx)
    await withTransaction((client) =>
      saveOrder(client, context, id, target.revision, JSON.parse(raw)),
    );

    // 2) request → approveIssue (own tx, revision 이 매 단계 증가)
    await withTransaction(async (client) => {
      let cur = await client.query<{ revision: number }>(
        "SELECT revision FROM work_orders WHERE id = $1 AND company_id = $2",
        [id, context.companyId],
      );
      if (!cur.rows[0]) throw new WorkOrderError("지시서를 찾을 수 없습니다.");
      await requestAssessment(client, context, id, cur.rows[0].revision);

      cur = await client.query<{ revision: number }>(
        "SELECT revision FROM work_orders WHERE id = $1 AND company_id = $2",
        [id, context.companyId],
      );
      await approveAndIssueOrder(client, context, id, cur.rows[0]!.revision);
    });

    // 3) 링크 전달 (실패해도 발급 자체는 성공한 상태라 무시)
    try {
      await deliverOrder(context, id);
    } catch {
      /* ignore delivery failure */
    }
  } catch (error) {
    return safeError(error);
  }
  refresh(id);
  redirect("/work-orders/" + id);
}

export async function orderCommandAction(
  _prev: WorkActionState,
  form: FormData,
): Promise<WorkActionState> {
  try {
    const target = targetSchema.parse({
      id: form.get("id"),
      revision: form.get("revision"),
    });
    const context = await actor();
    const command = z
      .enum(["request", "approve", "approveIssue", "issue", "cancel", "send"])
      .parse(form.get("command"));
    if (command === "send") await deliverOrder(context, target.id);
    else
      await withTransaction(async (client) => {
        if (command === "request")
          await requestAssessment(client, context, target.id, target.revision);
        // Standalone approval is by another manager. Explicit approval+issue
        // allows the author to approve and leaves a self-approval audit record.
        if (command === "approve")
          await approveAssessment(
            client,
            context,
            target.id,
            target.revision,
            false,
          );
        if (command === "issue")
          await issueOrder(client, context, target.id, target.revision);
        if (command === "approveIssue")
          await approveAndIssueOrder(
            client,
            context,
            target.id,
            target.revision,
          );
        if (command === "cancel")
          await cancelOrder(
            client,
            context,
            target.id,
            target.revision,
            String(form.get("reason") ?? ""),
          );
      });
    let message = "처리했습니다.";
    if (command === "issue" || command === "approveIssue") {
      try {
        await deliverOrder(context, target.id);
      } catch {
        message =
          "발급은 완료했습니다. 링크 전달은 상세 화면에서 다시 시도하세요.";
      }
    }
    refresh(target.id);
    return { message };
  } catch (error) {
    return safeError(error);
  }
}

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
  deleteDraftOrder,
} from "@/server/work-order-service";
import { deliverOrder } from "@/server/work-order-delivery";
import { requestPermit } from "@/server/ptw-service";
import { WorkOrderError, draftSchema } from "./model";

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
  let id = "";
  let saved = false;
  let issued = false;
  // PTW 를 다른 관리자가 승인해야 하면 발급은 그때. 허가 화면으로 보낸다.
  let permitPending = false;
  let errorMessage: string | null = null;

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
    saved = true;

    const draft = draftSchema.parse(JSON.parse(raw));
    if (draft.ptwRequired) {
      // 2-PTW) 허가 신청이 평가 요청·승인을 안고 간다. 승인자가 본인이면 그 자리에서
      // 승인·발급까지 (ptw-service.requestPermit → decidePermit → issueOrder).
      await withTransaction(async (client) => {
        const cur = await client.query<{ revision: number }>(
          "SELECT revision FROM work_orders WHERE id = $1 AND company_id = $2",
          [id, context.companyId],
        );
        if (!cur.rows[0]) throw new WorkOrderError("지시서를 찾을 수 없습니다.");
        await requestPermit(
          client,
          context,
          id,
          cur.rows[0].revision,
          {
            ...draft.permit,
            contacts: draft.permit.contacts.filter(
              (c) => c.name.trim() || c.phone.trim(),
            ),
          },
          true,
        );
        const after = await client.query<{ status: string }>(
          "SELECT status FROM work_orders WHERE id = $1",
          [id],
        );
        if (after.rows[0]?.status === "ISSUED") issued = true;
        else permitPending = true;
      });
    } else {
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
      issued = true;
    }

    // 3) 링크 전달 (실패해도 발급 자체는 성공)
    if (issued) {
      try {
        await deliverOrder(context, id);
      } catch {
        /* ignore delivery failure */
      }
    }
  } catch (error) {
    errorMessage =
      error instanceof WorkOrderError
        ? error.message
        : "처리하지 못했습니다. 새로고침 후 다시 시도하세요.";
  }

  if (issued) {
    refresh(id);
    // 발급 직후 할 일은 QR 을 뽑아 붙이거나 링크를 보내는 것이다. 그 구간으로 바로 보낸다.
    redirect("/work-orders/" + id + "#qr");
  }
  if (permitPending) {
    refresh(id);
    revalidatePath("/permits");
    // 다른 관리자의 승인을 기다린다. 허가 화면이 상태와 승인 요청 메일 결과를 보여 준다.
    redirect("/work-orders/" + id + "/permit");
  }
  // 저장은 성공했으나 이후 단계(승인·발급)에서 실패한 경우:
  // 브라우저는 여전히 /new (revision=0) 라 재시도 시 "이미 저장된 요청" 에 갇힘.
  // → 편집 페이지로 리다이렉트해 정상 revision 으로 재시도 가능하게 만들고
  //   상단 배너로 오류를 안내한다.
  if (saved && id) {
    refresh(id);
    redirect(
      "/work-orders/" +
        id +
        "/edit?issue_error=" +
        encodeURIComponent(errorMessage ?? "발급 중 오류가 발생했습니다."),
    );
  }
  return { error: errorMessage ?? "알 수 없는 오류" };
}

export async function orderCommandAction(
  _prev: WorkActionState,
  form: FormData,
): Promise<WorkActionState> {
  // 발급이면 QR 탭으로 보낸다. redirect() 는 예외로 동작하므로 try 밖에서 던져야
  // 아래 catch 가 "처리하지 못했습니다" 로 삼키지 않는다.
  let issuedId: string | null = null;
  let deleted = false;
  let deletedNext: string | null = null;
  let result: WorkActionState;
  try {
    const target = targetSchema.parse({
      id: form.get("id"),
      revision: form.get("revision"),
    });
    const context = await actor();
    const command = z
      .enum([
        "request",
        "approve",
        "approveIssue",
        "issue",
        "cancel",
        "send",
        "delete",
      ])
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
        if (command === "delete")
          await deleteDraftOrder(client, context, target.id, target.revision);
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
    if (command === "issue" || command === "approveIssue")
      issuedId = target.id;
    if (command === "delete") {
      deleted = true;
      const next = String(form.get("next") ?? "");
      deletedNext = next.startsWith("/work-orders") ? next : null;
    }
    result = { message };
  } catch (error) {
    result = safeError(error);
  }
  // 발급 직후 할 일은 QR 을 뽑아 붙이거나 링크를 보내는 것이다. 그 구간으로 바로 보낸다.
  if (issuedId) redirect("/work-orders/" + issuedId + "#qr");
  // 상세에서 지웠으면 그 자리가 404 이므로 목록으로 보낸다.
  // 목록에서 지웠으면 그 줄만 사라지면 되니 이동하지 않는다.
  if (deleted && deletedNext) redirect(deletedNext);
  return result;
}

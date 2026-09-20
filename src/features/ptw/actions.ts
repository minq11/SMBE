"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { workSession } from "@/server/work-orders";
import { query, withTransaction } from "@/server/db";
import { requestPermit, decidePermit, addLocation } from "@/server/ptw-service";
import { WorkOrderError } from "@/features/work-orders/model";
import { sendEmail } from "@/server/email";
import { deliverOrder, workOrderOrigin } from "@/server/work-order-delivery";
export type PermitState = { error?: string; message?: string } | undefined;
export async function bulkApproveAction(
  _previous: PermitState,
  form: FormData,
): Promise<PermitState> {
  try {
    const { actor } = await workSession("/permits", true);
    const targets = z
      .array(
        z.object({
          orderId: z.string().uuid(),
          revision: z.number().int().positive(),
        }),
      )
      .min(1)
      .max(100)
      .parse(form.getAll("target").map((v) => JSON.parse(String(v))));
    let succeeded = 0;
    const failures: string[] = [];
    for (const target of targets) {
      try {
        await withTransaction((c) =>
          decidePermit(c, actor, target.orderId, target.revision, "approve"),
        );
        succeeded++;
      } catch (error) {
        failures.push(
          error instanceof WorkOrderError
            ? error.message
            : "상태 변경 또는 처리 오류",
        );
        continue;
      }
      await deliverOrder(actor, target.orderId).catch(() => undefined);
    }
    revalidatePath("/", "layout");
    return {
      message: `${succeeded}건 승인, ${failures.length}건 미처리${failures.length ? " · " + failures[0] : ""}`,
    };
  } catch {
    return { error: "승인할 허가를 1~100건 선택하세요." };
  }
}
export async function permitAction(
  _previous: PermitState,
  form: FormData,
): Promise<PermitState> {
  try {
    const { actor } = await workSession("/permits", true);
    const command = z
      .enum([
        "request",
        "approve",
        "reject",
        "withdraw",
        "reassign",
        "location",
      ])
      .parse(form.get("command"));
    if (command === "location") {
      await withTransaction((c) =>
        addLocation(c, actor, String(form.get("name") ?? "")),
      );
      revalidatePath("/", "layout");
      return { message: "장소를 등록했습니다." };
    }
    const orderId = z.string().uuid().parse(form.get("orderId"));
    const revision = z.coerce.number().int().min(1).parse(form.get("revision"));
    await withTransaction(async (c) => {
      if (command === "request") {
        if (form.get("confirm") !== "on")
          throw new WorkOrderError("평가 검토·허가 신청 내용을 확인하세요.");
        const raw = String(form.get("payload") ?? "");
        if (raw.length > 20000)
          throw new WorkOrderError("입력값이 너무 큽니다.");
        await requestPermit(
          c,
          actor,
          orderId,
          revision,
          JSON.parse(raw),
          form.get("confirmSelf") === "on",
        );
      } else
        await decidePermit(
          c,
          actor,
          orderId,
          revision,
          command,
          String(form.get("value") ?? ""),
        );
    });
    let delivery = "";
    try {
      const rows = await query<{
        id: string;
        revision: number;
        status: string;
        email: string | null;
      }>(
        `SELECT p.id,p.revision,p.status,u.email FROM work_permits p JOIN users u ON u.id=p.approver_id WHERE p.work_order_id=$1 AND p.company_id=$2`,
        [orderId, actor.companyId],
      );
      const p = rows[0];
      if (
        p &&
        ["request", "reassign", "withdraw"].includes(command) &&
        p.status !== "APPROVED"
      ) {
        const url = workOrderOrigin() + "/work-orders/" + orderId + "/permit";
        const result = p.email
          ? await sendEmail({
              to: p.email,
              subject: "[SMBE] 위험작업허가 상태 확인",
              html: `<p>위험작업허가 신청 또는 담당자가 변경되었습니다. 현재 상태를 확인하세요.</p><p><a href="${url}">허가 확인</a></p>`,
              text: "위험작업허가 상태 확인: " + url,
              idempotencyKey: "ptw-" + p.id + "-" + p.revision,
            })
          : { status: "skipped" };
        await query(
          "UPDATE work_permits SET notification_status=$2 WHERE id=$1 AND revision=$3",
          [p.id, result.status.toUpperCase(), p.revision],
        );
        if (result.status !== "sent")
          delivery =
            " 이메일 전달에 실패했거나 주소가 없습니다. 허가 링크를 직접 전달해 주세요.";
      }
      if (p?.status === "APPROVED") await deliverOrder(actor, orderId);
    } catch {
      delivery = " 알림 전송을 확인하지 못했습니다. 허가 상태는 저장됐습니다.";
    }
    revalidatePath("/", "layout");
    return { message: "처리했습니다." + delivery };
  } catch (error) {
    return {
      error:
        error instanceof WorkOrderError
          ? error.message
          : "처리하지 못했습니다. 입력값을 확인하고 새로고침하세요.",
    };
  }
}

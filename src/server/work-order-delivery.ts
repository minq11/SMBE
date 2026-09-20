import "server-only";
import { withTransaction, query } from "./db";
import {
  auditOrder,
  memberAccess,
  readOrder,
  type Actor,
} from "./work-order-service";
import { sendEmail } from "./email";
import { WorkOrderError } from "../features/work-orders/model";

export function workOrderOrigin() {
  const url = new URL(process.env.APP_URL || "http://localhost:3000");
  if (!["http:", "https:"].includes(url.protocol))
    throw new WorkOrderError("APP_URL을 확인하세요.");
  return url.origin;
}
export async function deliverOrder(actor: Actor, orderId: string) {
  const origin = workOrderOrigin();
  const claimed = await withTransaction(async (client) => {
    await memberAccess(client, actor, true);
    const order = await readOrder(client, actor, orderId);
    if (!["ISSUED", "IN_PROGRESS"].includes(order.status))
      throw new WorkOrderError("발급·진행 중인 지시서만 전달할 수 있습니다.");
    const { rows } = await client.query<{
      id: string;
      link_target: string | null;
    }>(
      `WITH pending AS (
         SELECT o.id FROM work_order_outputs o
         WHERE o.work_order_id=$1 AND (o.status IN ('RETRY_PENDING','FAILED','SKIPPED')
           OR (o.status='SENDING' AND o.attempted_at < now()-interval '5 minutes'))
           AND (o.attempted_at IS NULL OR o.attempted_at < now()-interval '1 minute')
           AND EXISTS (SELECT 1 FROM company_members m WHERE m.user_id=o.user_id
             AND m.company_id=$2 AND m.status='ACTIVE' AND m.left_at IS NULL)
         LIMIT 50 FOR UPDATE SKIP LOCKED
       ) UPDATE work_order_outputs o SET status='SENDING',attempt_count=attempt_count+1,attempted_at=now()
         FROM pending p WHERE o.id=p.id RETURNING o.id,o.link_target`,
      [orderId, actor.companyId],
    );
    if (rows.length)
      await auditOrder(client, actor, orderId, "SEND_LINKS", {
        count: rows.length,
      });
    return rows;
  });
  await Promise.all(
    claimed.map(async (item) => {
      const url = origin + "/work-orders/" + orderId + "?via=link";
      const result = item.link_target
        ? await sendEmail({
            to: item.link_target,
            subject: "[SMBE] 작업지시가 발급되었습니다",
            html: `<p>작업지시가 발급되었습니다. 로그인 후 배정된 작업 내용을 확인하세요.</p><p><a href="${url}">작업지시 확인</a></p><p>작업지시에서 TBM·작업 중 점검을 입력할 수 있습니다.</p>`,
            text:
              "로그인 후 작업지시를 확인하세요: " +
              url +
              "\n작업지시에서 TBM·작업 중 점검을 입력할 수 있습니다.",
            idempotencyKey: "work-order-" + item.id,
          })
        : { status: "skipped" as const };
      await query(
        `UPDATE work_order_outputs SET status=$2,sent_at=CASE WHEN $2='SENT' THEN now() ELSE NULL END,
        failure_reason=$3 WHERE id=$1`,
        [
          item.id,
          result.status.toUpperCase(),
          result.status === "sent"
            ? null
            : result.status === "skipped"
              ? "이메일 주소 또는 발송 설정 없음"
              : "메일 서비스 발송 실패",
        ],
      );
    }),
  );
}

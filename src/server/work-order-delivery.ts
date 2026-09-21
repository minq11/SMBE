import "server-only";
import { withTransaction, query } from "./db";
import {
  auditOrder,
  memberAccess,
  readOrder,
  type Actor,
} from "./work-order-service";
import { sendEmail } from "./email";
import { issueAccessToken, workerLinkUrl, linkExpiry } from "./worker-access";
import { WorkOrderError } from "../features/work-orders/model";

export { appOrigin as workOrderOrigin } from "./config";
export async function deliverOrder(actor: Actor, orderId: string) {
  const claimed = await withTransaction(async (client) => {
    await memberAccess(client, actor, true);
    const order = await readOrder(client, actor, orderId);
    if (!["ISSUED", "IN_PROGRESS"].includes(order.status))
      throw new WorkOrderError("발급·진행 중인 지시서만 전달할 수 있습니다.");
    const { rows } = await client.query<{
      id: string;
      link_target: string | null;
      user_id: string;
      issue_version: number;
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
         FROM pending p WHERE o.id=p.id RETURNING o.id,o.link_target,o.user_id,o.issue_version`,
      [orderId, actor.companyId],
    );
    if (rows.length)
      await auditOrder(client, actor, orderId, "SEND_LINKS", {
        count: rows.length,
      });
    // 토큰은 보낼 때 만든다. 평문은 여기서만 존재하고 DB 에는 해시만 남으므로,
    // 링크를 다시 보내면 새 토큰이 발급되고 이전 링크는 그 순간 무효가 된다.
    const expiresAt = linkExpiry(order.draft_data.endDate);
    return Promise.all(
      rows.map(async (row) => ({
        ...row,
        token: await issueAccessToken(
          client,
          {
            workOrderId: orderId,
            issueVersion: row.issue_version,
            userId: row.user_id,
          },
          expiresAt,
        ),
      })),
    );
  });
  await Promise.all(
    claimed.map(async (item) => {
      // 로그인 없이 열리는 개인 링크. 배정된 본인에게만 보낸다.
      const url = workerLinkUrl(item.token);
      const result = item.link_target
        ? await sendEmail({
            to: item.link_target,
            subject: "[SMBE] 작업지시가 발급되었습니다",
            html: `<p>배정된 작업지시가 발급되었습니다. 아래 링크에서 바로 확인하실 수 있습니다.</p><p><a href="${url}">작업지시 확인하기</a></p><p>TBM·작업 중 점검을 같은 화면에서 입력합니다. 이 링크는 본인 전용이므로 공유하지 마세요.</p>`,
            text:
              "배정된 작업지시를 확인하세요: " +
              url +
              "\nTBM·작업 중 점검을 같은 화면에서 입력합니다. 이 링크는 본인 전용이므로 공유하지 마세요.",
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

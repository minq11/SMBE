import "server-only";
import webpush from "web-push";
import { z } from "zod";
import { query } from "./db";
import { appOrigin } from "./config";

/**
 * 웹 푸시 (VAPID).
 *
 * 유료 회사의 공지·자료 발행을 구성원의 기기에 알린다. 무료 회사는 보내지 않는다.
 * 키가 없으면(VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY 미설정) 조용히 건너뛴다 —
 * 메일과 같은 규칙: 알림 실패가 발행을 막지 않는다.
 *
 *   npx web-push generate-vapid-keys   → .env 에 VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
 *   VAPID_SUBJECT 는 mailto: 주소 (기본 mailto:hi@smbe.net)
 *
 * 구독은 기기 단위다 (public/sw.js 가 받아서 알림으로 띄운다). 만료된 구독
 * (404·410)은 보내다가 지운다.
 */

export function pushConfigured(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY?.trim() &&
    process.env.VAPID_PRIVATE_KEY?.trim(),
  );
}

export function pushPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

let configured = false;
function client() {
  if (!pushConfigured()) return null;
  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT?.trim() || "mailto:hi@smbe.net",
      process.env.VAPID_PUBLIC_KEY!.trim(),
      process.env.VAPID_PRIVATE_KEY!.trim(),
    );
    configured = true;
  }
  return webpush;
}

export const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(200),
  }),
});
export type PushSubscriptionInput = z.infer<typeof subscriptionSchema>;

export async function saveSubscription(
  userId: string,
  input: PushSubscriptionInput,
  userAgent?: string | null,
) {
  const sub = subscriptionSchema.parse(input);
  await query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE
       SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh,
           auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent`,
    [userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, userAgent ?? null],
  );
}

export async function removeSubscription(userId: string, endpoint: string) {
  await query(
    "DELETE FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2",
    [userId, endpoint],
  );
}

export type PushPayload = {
  title: string;
  body: string;
  /** 앱 안의 경로 (/board/notices/…) */
  path: string;
  tag?: string;
};

/**
 * 회사 구성원 전원의 기기로 보낸다. 작성자 본인은 뺀다. 결과는 통계만 돌려주고
 * 던지지 않는다.
 */
export async function pushToCompany(
  companyId: string,
  payload: PushPayload,
  options: { exceptUserId?: string } = {},
): Promise<{
  sent: number;
  failed: number;
  removed: number;
  skipped?: string;
}> {
  const push = client();
  if (!push) return { sent: 0, failed: 0, removed: 0, skipped: "VAPID 미설정" };
  const rows = await query<{
    id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
  }>(
    `SELECT s.id, s.endpoint, s.p256dh, s.auth
       FROM push_subscriptions s
       JOIN company_members m ON m.user_id = s.user_id
       JOIN users u ON u.id = s.user_id
      WHERE m.company_id = $1 AND m.status = 'ACTIVE' AND m.left_at IS NULL
        AND u.status = 'ACTIVE' AND ($2::uuid IS NULL OR s.user_id <> $2)
      LIMIT 2000`,
    [companyId, options.exceptUserId ?? null],
  );
  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: appOrigin() + payload.path,
    tag: payload.tag,
  });
  let sent = 0,
    failed = 0,
    removed = 0;
  for (const row of rows) {
    try {
      await push.sendNotification(
        {
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth },
        },
        body,
        { TTL: 60 * 60 * 24, urgency: "normal" },
      );
      sent += 1;
      await query(
        "UPDATE push_subscriptions SET last_used_at = now() WHERE id=$1",
        [row.id],
      );
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await query("DELETE FROM push_subscriptions WHERE id=$1", [row.id]);
        removed += 1;
      } else failed += 1;
    }
  }
  return { sent, failed, removed };
}

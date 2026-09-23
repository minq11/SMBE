"use server";
import { headers } from "next/headers";
import { getCurrentSession } from "@/server/session";
import {
  pushConfigured,
  pushPublicKey,
  removeSubscription,
  saveSubscription,
  subscriptionSchema,
} from "@/server/push";

/**
 * 푸시 구독 저장·해지. 유료 회사의 구성원만 구독할 수 있다 — 무료 회사는 보낼
 * 알림이 없으니 권한 요청 창을 띄우지 않는다.
 */
async function member() {
  const s = await getCurrentSession();
  if (!s?.membership || s.membership.status !== "ACTIVE") return null;
  return s;
}

export async function pushSetupAction(): Promise<
  { available: true; publicKey: string } | { available: false; reason: string }
> {
  const s = await member();
  if (!s) return { available: false, reason: "로그인이 필요합니다." };
  if (s.membership!.pro_state === "FREE")
    return { available: false, reason: "푸시 알림은 유료 요금제 기능입니다." };
  const key = pushPublicKey();
  if (!pushConfigured() || !key)
    return {
      available: false,
      reason: "서버에 푸시 키가 설정되지 않았습니다.",
    };
  return { available: true, publicKey: key };
}

export async function savePushSubscriptionAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await member();
  if (!s) return { ok: false, error: "로그인이 필요합니다." };
  if (s.membership!.pro_state === "FREE")
    return { ok: false, error: "푸시 알림은 유료 요금제 기능입니다." };
  const parsed = subscriptionSchema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, error: "구독 정보가 올바르지 않습니다." };
  const ua = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  await saveSubscription(s.user.id, parsed.data, ua);
  return { ok: true };
}

export async function removePushSubscriptionAction(
  endpoint: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await member();
  if (!s) return { ok: false, error: "로그인이 필요합니다." };
  await removeSubscription(s.user.id, String(endpoint).slice(0, 2000));
  return { ok: true };
}

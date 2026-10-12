"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { query } from "@/server/db";
import { requireOperator } from "@/server/operator";

export type ActionState = { error?: string; message?: string } | undefined;

const updatePlanSchema = z.object({
  company_id: z.string().uuid(),
  plan: z.enum(["FREE", "BASIC", "STANDARD", "PRO", "ENTERPRISE"]),
});

/**
 * 운영자가 회사의 계약 구간을 바꾼다.
 *
 * 결제(PG)가 아직 없으므로 입금 확인 후 운영자가 직접 올린다. 계약 인원을 다 쓴
 * 회사는 여기서 구간을 올려야 인원 등록이 다시 열린다. 무료는 인원 제한이 없다 —
 * 무료는 인원이 아니라 기능이 제한된다 (features/billing/plans.ts).
 *
 * 상향 시 **그날이 새 결제 기준일**이 되므로 `plan_started_at` 을 함께 갱신한다.
 */
export async function updatePlanAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireOperator();

  const parsed = updatePlanSchema.safeParse({
    company_id: formData.get("company_id"),
    plan: formData.get("plan"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "잘못된 값" };
  }
  const { company_id, plan } = parsed.data;

  if (plan === "FREE") {
    await query(
      `UPDATE companies SET pro_state = 'FREE', plan = NULL, plan_started_at = NULL
        WHERE id = $1`,
      [company_id],
    );
  } else {
    await query(
      `UPDATE companies
          SET pro_state = 'PRO_VOLUNTARY', plan = $2, plan_started_at = now()
        WHERE id = $1`,
      [company_id, plan],
    );
  }
  // 요금제는 사이드바 회사 카드·멤버십 잠금·인원 등록까지 모든 화면이 읽는다.
  // 운영자 화면만이 아니라 전부 새로 그린다.
  revalidatePath("/", "layout");
  return {
    message:
      plan === "FREE"
        ? "무료로 전환했습니다."
        : `${plan} 구간으로 변경하고 결제 기준일을 오늘로 갱신했습니다.`,
  };
}

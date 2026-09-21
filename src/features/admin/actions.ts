"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { query } from "@/server/db";
import { requireOperator } from "@/server/operator";

export type ActionState = { error?: string; message?: string } | undefined;

const updateFreeLimitSchema = z.object({
  company_id: z.string().uuid(),
  free_limit: z.coerce
    .number({ error: "숫자를 입력하세요" })
    .int("정수만 가능합니다")
    .min(0, "0 이상")
    .max(10000, "값이 너무 큽니다"),
});

export async function updateFreeLimitAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireOperator();

  const parsed = updateFreeLimitSchema.safeParse({
    company_id: formData.get("company_id"),
    free_limit: formData.get("free_limit"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "잘못된 값" };
  }

  await query("UPDATE companies SET free_limit = $2 WHERE id = $1", [
    parsed.data.company_id,
    parsed.data.free_limit,
  ]);
  revalidatePath("/admin");
  revalidatePath(`/admin/companies/${parsed.data.company_id}`);
  return {
    message: `무료 인원 한도를 ${parsed.data.free_limit}명으로 변경했습니다.`,
  };
}

const updatePlanSchema = z.object({
  company_id: z.string().uuid(),
  plan: z.enum(["FREE", "BASIC", "STANDARD", "PRO", "ENTERPRISE"]),
});

/**
 * 운영자가 회사의 계약 구간을 바꾼다.
 *
 * 결제(PG)가 아직 없으므로 입금 확인 후 운영자가 직접 올린다. 계약 인원을 다 쓴
 * 회사는 여기서 구간을 올려야 인원 등록이 다시 열린다.
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
  revalidatePath("/admin");
  revalidatePath(`/admin/companies/${company_id}`);
  revalidatePath("/billing");
  revalidatePath("/company/members");
  return {
    message:
      plan === "FREE"
        ? "무료로 전환했습니다."
        : `${plan} 구간으로 변경하고 결제 기준일을 오늘로 갱신했습니다.`,
  };
}

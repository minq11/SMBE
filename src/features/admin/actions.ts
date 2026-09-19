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

  await query(
    "UPDATE companies SET free_limit = $2 WHERE id = $1",
    [parsed.data.company_id, parsed.data.free_limit],
  );
  revalidatePath("/admin");
  revalidatePath(`/admin/companies/${parsed.data.company_id}`);
  return { message: `무료 인원 한도를 ${parsed.data.free_limit}명으로 변경했습니다.` };
}

"use server";

import { getCurrentSession } from "@/server/session";
import { withTransaction } from "@/server/db";
import { saveSafetyPolicy } from "@/server/safety-policy";
import { WorkOrderError } from "@/features/work-orders/model";
import { revalidatePath } from "next/cache";

export async function saveSafetyPolicyAction(
  raw: unknown,
): Promise<{ error?: string; saved?: boolean }> {
  try {
    const session = await getCurrentSession();
    if (!session?.membership || session.membership.status !== "ACTIVE")
      throw new WorkOrderError("로그인과 회사 소속을 확인하세요.");
    await withTransaction((client) =>
      saveSafetyPolicy(
        client,
        {
          companyId: session.membership!.company_id,
          userId: session.user.id,
        },
        raw,
      ),
    );
    revalidatePath("/company/safety-policy", "layout");
    return { saved: true };
  } catch (error) {
    return {
      error:
        error instanceof WorkOrderError
          ? error.message
          : "저장하지 못했습니다. 잠시 후 다시 시도하세요.",
    };
  }
}

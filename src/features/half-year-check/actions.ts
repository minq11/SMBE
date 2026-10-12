"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/server/session";
import { withTransaction } from "@/server/db";
import { saveHalfYearCheck } from "@/server/half-year-check";
import { WorkOrderError } from "@/features/work-orders/model";

export async function saveHalfYearCheckAction(
  raw: unknown,
  confirm: boolean,
): Promise<{ error?: string; saved?: boolean }> {
  try {
    const session = await getCurrentSession();
    if (!session?.membership || session.membership.status !== "ACTIVE")
      throw new WorkOrderError("로그인과 회사 소속을 확인하세요.");
    await withTransaction((client) =>
      saveHalfYearCheck(
        client,
        {
          companyId: session.membership!.company_id,
          userId: session.user.id,
        },
        raw,
        confirm,
      ),
    );
    revalidatePath("/company/half-year-check", "layout");
    revalidatePath("/assessments");
    revalidatePath("/");
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

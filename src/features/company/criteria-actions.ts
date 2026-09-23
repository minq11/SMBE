"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/server/session";
import { withTransaction } from "@/server/db";
import { updateRiskCriteria } from "@/server/company-settings";
import { WorkOrderError } from "@/features/work-orders/model";
import { RISK_LEVELS } from "./risk-criteria";

export type CriteriaActionState =
  { error?: string; message?: string } | undefined;

export async function updateRiskCriteriaAction(
  _prev: CriteriaActionState,
  form: FormData,
): Promise<CriteriaActionState> {
  try {
    const session = await getCurrentSession();
    if (!session?.membership || session.membership.status !== "ACTIVE")
      throw new WorkOrderError("로그인과 회사 소속을 확인하세요.");
    if (session.membership.role === "WORKER")
      throw new WorkOrderError("관리자만 판단 기준을 수정할 수 있습니다.");

    await withTransaction((c) =>
      updateRiskCriteria(
        c,
        session.membership!.company_id,
        RISK_LEVELS.map((level) => ({
          level,
          description: form.get("description_" + level),
          acceptance: form.get("acceptance_" + level),
        })),
      ),
    );
  } catch (error) {
    return {
      error:
        error instanceof WorkOrderError
          ? error.message
          : "저장하지 못했습니다. 입력값을 확인하고 다시 시도하세요.",
    };
  }
  revalidatePath("/company/criteria");
  revalidatePath("/work-orders/new");
  return {
    message: "판단 기준을 저장했습니다. 이후 만드는 평가에 적용됩니다.",
  };
}

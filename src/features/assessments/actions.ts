"use server";
import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/server/session";
import { withTransaction } from "@/server/db";
import { recordHalfYearReview, recordRiskAction } from "@/server/assessments";
import { WorkOrderError } from "@/features/work-orders/model";

async function actor() {
  const s = await getCurrentSession();
  if (!s?.membership || s.membership.status !== "ACTIVE")
    throw new WorkOrderError("로그인과 회사 소속을 확인하세요.");
  if (s.membership.role === "WORKER")
    throw new WorkOrderError("조치 기록은 관리자만 할 수 있습니다.");
  return { companyId: s.membership.company_id, userId: s.user.id };
}

export type RiskActionPayload = {
  assessmentId: string;
  itemId: string;
  actualAction: string;
  actualCompletionDate: string;
  postRiskLevel: "HIGH" | "MID" | "LOW";
  /** 조치 뒤에도 허용 불가일 때 필수 */
  followUpMeasure?: string;
};

export async function recordRiskActionAction(
  payload: RiskActionPayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const context = await actor();
    await withTransaction((c) => recordRiskAction(c, context, payload));
    revalidatePath("/assessments");
    revalidatePath("/assessments/" + payload.assessmentId);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof WorkOrderError
          ? error.message
          : "저장하지 못했습니다. 잠시 후 다시 시도하세요.",
    };
  }
}

/** 경영책임자 반기 점검 서명 (중처법 시행령 제4조 제3호). */
export async function recordHalfYearReviewAction(
  note: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const context = await actor();
    await withTransaction((c) => recordHalfYearReview(c, context, note));
    revalidatePath("/assessments");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof WorkOrderError
          ? error.message
          : "저장하지 못했습니다. 잠시 후 다시 시도하세요.",
    };
  }
}

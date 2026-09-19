"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentSession } from "@/server/session";
import { withTransaction } from "@/server/db";
import { submitInspection, resolveFinding } from "@/server/inspection-service";
import { inspectionSchema } from "./model";
import { WorkOrderError } from "../work-orders/model";

export type InspectionActionState =
  { error?: string; message?: string } | undefined;
async function actor() {
  const s = await getCurrentSession();
  if (!s?.membership || s.membership.status !== "ACTIVE")
    throw new WorkOrderError("로그인과 회사 소속을 확인하세요.");
  return { companyId: s.membership.company_id, userId: s.user.id };
}
function errorState(error: unknown) {
  return {
    error:
      error instanceof WorkOrderError
        ? error.message
        : "처리하지 못했습니다. 입력값을 확인하고 다시 시도하세요.",
  };
}
function refresh(id: string) {
  revalidatePath("/work-orders/" + id);
  revalidatePath("/work-orders/" + id + "/inspections");
  revalidatePath("/inspections");
  revalidatePath("/");
}
export async function submitInspectionAction(
  _prev: InspectionActionState,
  form: FormData,
): Promise<InspectionActionState> {
  let orderId: string;
  try {
    const raw = form.get("payload");
    if (typeof raw !== "string" || raw.length > 300000)
      throw new WorkOrderError("입력 데이터가 너무 큽니다.");
    const data = inspectionSchema.parse(JSON.parse(raw));
    const context = await actor();
    await withTransaction((client) => submitInspection(client, context, data));
    orderId = data.orderId;
  } catch (error) {
    return errorState(error);
  }
  refresh(orderId);
  redirect("/work-orders/" + orderId + "/inspections?saved=1");
}
export async function resolveFindingAction(
  _prev: InspectionActionState,
  form: FormData,
): Promise<InspectionActionState> {
  try {
    const id = z.string().uuid().parse(form.get("id"));
    const context = await actor();
    const orderId = await withTransaction((client) =>
      resolveFinding(client, context, id, String(form.get("resolution") ?? "")),
    );
    refresh(orderId);
    return { message: "조치완료 처리했습니다." };
  } catch (error) {
    return errorState(error);
  }
}

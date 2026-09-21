"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { cookies } from "next/headers";
import { getCurrentSession } from "@/server/session";
import {
  resolveAccessToken,
  linkActor,
  LINK_COOKIE,
} from "@/server/worker-access";
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

/**
 * 점검 제출은 로그인 사용자와 링크 방문자 모두 허용한다.
 *
 * 링크 방문자는 토큰이 가리키는 작업지시 하나로만 제한된다 — 그 외에는
 * 로그인 사용자와 완전히 같은 경로를 탄다. 회차 배정·TBM 중복·역할 검사는
 * submitInspection 이 그대로 수행하므로 링크라고 우회되는 권한은 없다.
 * 설계 배경: docs/worker-access.md
 */
async function inspectionActor(orderId: string) {
  const s = await getCurrentSession();
  if (s?.membership && s.membership.status === "ACTIVE")
    return { companyId: s.membership.company_id, userId: s.user.id };

  const token = (await cookies()).get(LINK_COOKIE)?.value;
  const grant = token
    ? await withTransaction((c) => resolveAccessToken(c, token))
    : null;
  if (!grant) throw new WorkOrderError("로그인과 회사 소속을 확인하세요.");
  if (grant.workOrderId !== orderId)
    throw new WorkOrderError("이 링크로 열 수 있는 작업지시가 아닙니다.");
  return linkActor(grant);
}

/** 링크 방문자는 로그인 화면으로 보낼 수 없으므로 전용 화면으로 되돌린다. */
async function isLinkVisitor() {
  const s = await getCurrentSession();
  return !(s?.membership && s.membership.status === "ACTIVE");
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
  let viaLink = false;
  try {
    const raw = form.get("payload");
    if (typeof raw !== "string" || raw.length > 300000)
      throw new WorkOrderError("입력 데이터가 너무 큽니다.");
    const data = inspectionSchema.parse(JSON.parse(raw));
    const context = await inspectionActor(data.orderId);
    await withTransaction((client) => submitInspection(client, context, data));
    orderId = data.orderId;
    viaLink = await isLinkVisitor();
  } catch (error) {
    return errorState(error);
  }
  refresh(orderId);
  redirect(
    viaLink ? "/w?saved=1" : "/work-orders/" + orderId + "/inspections?saved=1",
  );
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

"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { cookies } from "next/headers";
import { getCurrentSession } from "@/server/session";
import {
  resolveAccessToken,
  linkActor,
  LINK_COOKIE,
} from "@/server/worker-access";
import { withTransaction } from "@/server/db";
import {
  submitInspection,
  backfillInspection,
  reviseInspection,
  resolveFinding,
  type SavedInspectionItem,
} from "@/server/inspection-service";
import { inspectionSchema } from "./model";
import { WorkOrderError } from "../work-orders/model";

export type InspectionActionState =
  | {
      error?: string;
      message?: string;
      /**
       * 저장이 끝나면 항목별 결과 행 id 와 다음 화면을 돌려준다. 서버에서 바로
       * redirect 하지 않는 이유는 사진 때문이다 — 붙일 자리(결과 행)가 저장
       * 후에야 생기므로, 화면이 들고 있던 파일을 올린 뒤에 이동해야 한다.
       */
      saved?: { items: SavedInspectionItem[]; next: string };
    }
  | undefined;
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
  try {
    const raw = form.get("payload");
    if (typeof raw !== "string" || raw.length > 300000)
      throw new WorkOrderError("입력 데이터가 너무 큽니다.");
    const data = inspectionSchema.parse(JSON.parse(raw));
    const context = await inspectionActor(data.orderId);
    const saved = await withTransaction((client) =>
      submitInspection(client, context, data),
    );
    const viaLink = await isLinkVisitor();
    refresh(data.orderId);
    return {
      saved: {
        items: saved.items,
        next: viaLink
          ? "/w?saved=1"
          : "/work-orders/" + data.orderId + "/inspections?saved=1",
      },
    };
  } catch (error) {
    return errorState(error);
  }
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

/** 관리자 대리 입력. 현장 입력과 달리 누구의 점검인지를 폼에서 고른다. */
export async function backfillInspectionAction(
  _prev: InspectionActionState,
  form: FormData,
): Promise<InspectionActionState> {
  try {
    const raw = form.get("payload");
    if (typeof raw !== "string" || raw.length > 300000)
      throw new WorkOrderError("입력 데이터가 너무 큽니다.");
    const data = JSON.parse(raw) as { orderId?: string };
    const context = await actor();
    await withTransaction((client) =>
      backfillInspection(client, context, data),
    );
    if (typeof data.orderId === "string") refresh(data.orderId);
    return { message: "사후 입력으로 기록했습니다." };
  } catch (error) {
    return errorState(error);
  }
}

/** 저장된 결과 수정. 사유가 필수이고 수정 전·후가 통째로 남는다. */
export async function reviseInspectionAction(
  _prev: InspectionActionState,
  form: FormData,
): Promise<InspectionActionState> {
  try {
    const raw = form.get("payload");
    if (typeof raw !== "string" || raw.length > 300000)
      throw new WorkOrderError("입력 데이터가 너무 큽니다.");
    const context = await actor();
    const orderId = await withTransaction((client) =>
      reviseInspection(client, context, JSON.parse(raw)),
    );
    refresh(orderId);
    return { message: "수정하고 이력을 남겼습니다." };
  } catch (error) {
    return errorState(error);
  }
}

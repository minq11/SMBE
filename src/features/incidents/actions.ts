"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentSession } from "@/server/session";
import { withTransaction } from "@/server/db";
import {
  LINK_COOKIE,
  linkActor,
  resolveAccessToken,
} from "@/server/worker-access";
import { pushToCompany } from "@/server/push";
import { updateIncidentManual } from "@/server/company-settings";
import {
  closeIncident,
  createIncident,
  createWorkerReport,
  reopenIncident,
  setActionDone,
  setDutyDone,
  updateIncident,
} from "@/server/incidents";
import { WorkOrderError } from "@/features/work-orders/model";
import { IncidentError } from "./model";

export type IncidentActionState = { error?: string } | undefined;

async function actor() {
  const s = await getCurrentSession();
  if (!s?.membership || s.membership.status !== "ACTIVE")
    throw new IncidentError("로그인과 회사 소속을 확인하세요.");
  if (s.membership.role === "WORKER")
    throw new IncidentError("사고 기록은 관리자만 다룰 수 있습니다.");
  return { companyId: s.membership.company_id, userId: s.user.id };
}

function message(error: unknown): string {
  return error instanceof IncidentError || error instanceof WorkOrderError
    ? error.message
    : "처리하지 못했습니다. 잠시 후 다시 시도하세요.";
}

function refresh(id?: string) {
  revalidatePath("/incidents");
  if (id) revalidatePath("/incidents/" + id);
  revalidatePath("/");
}

/** 등록·수정. 저장하면 상세로 간다 (헌법 5장: 온 곳으로 돌아간다). */
export async function saveIncidentAction(
  _prev: IncidentActionState,
  form: FormData,
): Promise<IncidentActionState> {
  const id = String(form.get("id") ?? "");
  let payload: unknown;
  try {
    payload = JSON.parse(String(form.get("payload") ?? "{}"));
  } catch {
    return { error: "입력을 읽지 못했습니다. 다시 시도하세요." };
  }
  let target = id;
  try {
    const context = await actor();
    if (id)
      await withTransaction((c) => updateIncident(c, context, id, payload));
    else
      target = await withTransaction((c) =>
        createIncident(c, context, payload),
      );
  } catch (error) {
    return { error: message(error) };
  }
  refresh(target);
  redirect("/incidents/" + target);
}

export async function dutyDoneAction(input: {
  incidentId: string;
  dutyId: string;
  done: boolean;
  note: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const context = await actor();
    await withTransaction((c) => setDutyDone(c, context, input));
    refresh(input.incidentId);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export async function actionDoneAction(input: {
  incidentId: string;
  actionId: string;
  done: boolean;
  note: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const context = await actor();
    await withTransaction((c) => setActionDone(c, context, input));
    refresh(input.incidentId);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export async function closeIncidentAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const context = await actor();
    await withTransaction((c) => closeIncident(c, context, id));
    refresh(id);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export type ReportState =
  { error?: string; id?: string; canAttach?: boolean } | undefined;

/**
 * 작업자 신고. 로그인한 구성원(어느 역할이든)과 링크로 들어온 작업자 둘 다.
 * 저장하면 관리자 전원에게 푸시하고, 화면은 "접수됐습니다" 로 바뀐다 (이동 없음 —
 * 링크 화면에는 갈 상세가 없다).
 */
export async function reportIncidentAction(
  _prev: ReportState,
  form: FormData,
): Promise<ReportState> {
  try {
    const s = await getCurrentSession();
    let context: { companyId: string; userId: string };
    let workOrderId: string | null = null;
    let canAttach = false;
    if (s?.membership && s.membership.status === "ACTIVE") {
      context = { companyId: s.membership.company_id, userId: s.user.id };
      canAttach = s.membership.pro_state !== "FREE";
    } else {
      const token = (await cookies()).get(LINK_COOKIE)?.value;
      const grant = token
        ? await withTransaction((c) => resolveAccessToken(c, token))
        : null;
      if (!grant) throw new IncidentError("로그인과 회사 소속을 확인하세요.");
      context = linkActor(grant);
      workOrderId = grant.workOrderId;
      const { rows } = await withTransaction((c) =>
        c.query<{ pro_state: string }>(
          "SELECT pro_state FROM companies WHERE id=$1",
          [context.companyId],
        ),
      );
      canAttach = rows[0]?.pro_state !== "FREE";
    }
    const input = {
      kind: String(form.get("kind") ?? ""),
      description: String(form.get("description") ?? ""),
      location: String(form.get("location") ?? ""),
    };
    const { id, reporterName } = await withTransaction((c) =>
      createWorkerReport(c, context, input, workOrderId),
    );
    // 커밋 뒤에 보낸다. 실패해도 신고는 끝났다.
    await pushToCompany(
      context.companyId,
      {
        title: `[사고 신고] ${reporterName}`,
        body: `${input.kind === "INJURY" ? "재해" : "아차사고"} · ${input.location}`,
        path: `/incidents/${id}`,
        tag: "incident-" + id,
      },
      {
        exceptUserId: context.userId,
        roles: ["MANAGER_SUPERVISOR", "MANAGER_SAFETY"],
      },
    ).catch(() => null);
    refresh(id);
    return { id, canAttach };
  } catch (error) {
    return { error: message(error) };
  }
}

export type ManualState = { error?: string; message?: string } | undefined;

export async function updateIncidentManualAction(
  _prev: ManualState,
  form: FormData,
): Promise<ManualState> {
  try {
    const context = await actor();
    await withTransaction((c) =>
      updateIncidentManual(c, context.companyId, form.get("manual")),
    );
  } catch (error) {
    return { error: message(error) };
  }
  revalidatePath("/company/incident-manual");
  return { message: "저장했습니다." };
}

export async function reopenIncidentAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const context = await actor();
    await withTransaction((c) => reopenIncident(c, context, id));
    refresh(id);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

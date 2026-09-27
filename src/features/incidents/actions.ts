"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/session";
import { withTransaction } from "@/server/db";
import {
  closeIncident,
  createIncident,
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

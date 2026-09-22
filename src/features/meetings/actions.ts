"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/session";
import { withTransaction } from "@/server/db";
import {
  openMeeting,
  saveMeetingItem,
  completeMeeting,
} from "@/server/safety-meeting";
import { WorkOrderError } from "@/features/work-orders/model";

export type MeetingActionState =
  { error?: string; message?: string } | undefined;

async function actor() {
  const s = await getCurrentSession();
  if (!s?.membership || s.membership.status !== "ACTIVE")
    throw new WorkOrderError("로그인과 회사 소속을 확인하세요.");
  if (s.membership.role === "WORKER")
    throw new WorkOrderError("이 작업을 수행할 권한이 없습니다.");
  return { companyId: s.membership.company_id, userId: s.user.id };
}

function errorState(error: unknown): MeetingActionState {
  return {
    error:
      error instanceof WorkOrderError
        ? error.message
        : "처리하지 못했습니다. 입력값을 확인하고 다시 시도하세요.",
  };
}

function refresh(week: string) {
  revalidatePath("/meetings");
  revalidatePath("/meetings/" + week);
}

export async function openMeetingAction(
  _prev: MeetingActionState,
  form: FormData,
): Promise<MeetingActionState> {
  const week = String(form.get("week") ?? "");
  try {
    const context = await actor();
    await withTransaction((client) => openMeeting(client, context, week));
  } catch (error) {
    return errorState(error);
  }
  refresh(week);
  redirect("/meetings/" + week);
}

export async function saveMeetingItemAction(
  _prev: MeetingActionState,
  form: FormData,
): Promise<MeetingActionState> {
  try {
    const context = await actor();
    await withTransaction((client) =>
      saveMeetingItem(client, context, {
        itemId: String(form.get("itemId") ?? ""),
        reviewed: form.get("reviewed") === "on",
        note: String(form.get("note") ?? ""),
      }),
    );
    refresh(String(form.get("week") ?? ""));
    return { message: "확인 내용을 저장했습니다." };
  } catch (error) {
    return errorState(error);
  }
}

export async function completeMeetingAction(
  _prev: MeetingActionState,
  form: FormData,
): Promise<MeetingActionState> {
  try {
    const context = await actor();
    await withTransaction((client) =>
      completeMeeting(client, context, {
        week: String(form.get("week") ?? ""),
        attendeeIds: form.getAll("attendeeIds").map(String),
        discussion: String(form.get("discussion") ?? ""),
      }),
    );
    refresh(String(form.get("week") ?? ""));
    return { message: "회의를 완료했습니다." };
  } catch (error) {
    return errorState(error);
  }
}

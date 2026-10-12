"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/session";
import { withTransaction } from "@/server/db";
import {
  createTrainingSession,
  deleteTrainingSession,
  updateTbmTrainingMinutes,
} from "@/server/training";
import { WorkOrderError } from "@/features/work-orders/model";

async function actor() {
  const session = await getCurrentSession();
  if (!session?.membership || session.membership.status !== "ACTIVE")
    throw new WorkOrderError("로그인과 회사 소속을 확인하세요.");
  return { companyId: session.membership.company_id, userId: session.user.id };
}

const message = (error: unknown) =>
  error instanceof WorkOrderError
    ? error.message
    : "저장하지 못했습니다. 잠시 후 다시 시도하세요.";

export async function createTrainingAction(
  raw: unknown,
): Promise<{ error?: string; id?: string }> {
  try {
    const a = await actor();
    const { id } = await withTransaction((c) =>
      createTrainingSession(c, a, raw),
    );
    revalidatePath("/training", "layout");
    revalidatePath("/");
    return { id };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function deleteTrainingAction(
  _prev: { error?: string } | undefined,
  form: FormData,
): Promise<{ error?: string } | undefined> {
  const id = form.get("id");
  if (typeof id !== "string") return { error: "잘못된 요청" };
  try {
    const a = await actor();
    await withTransaction((c) => deleteTrainingSession(c, a, id));
  } catch (error) {
    return { error: message(error) };
  }
  revalidatePath("/training", "layout");
  redirect("/training");
}

export async function setTbmTrainingMinutesAction(
  raw: unknown,
): Promise<{ error?: string; saved?: boolean }> {
  try {
    const a = await actor();
    await withTransaction((c) => updateTbmTrainingMinutes(c, a, raw));
    revalidatePath("/training", "layout");
    return { saved: true };
  } catch (error) {
    return { error: message(error) };
  }
}

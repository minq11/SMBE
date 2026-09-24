"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/server/session";
import { query } from "@/server/db";
import {
  addAssessmentRound,
  archiveStandard,
  assessmentRoundSchema,
  createStandardWithFirstAssessment,
  initialStandardSchema,
  standardEditSchema,
  updateRevisionDraft,
  startRevision,
  approveRevision,
  discardRevision,
} from "@/server/standards-service";

export type StandardActionState =
  undefined | { error?: string; message?: string; standardId?: string };

async function actor() {
  const s = await getCurrentSession();
  if (
    !s?.membership ||
    s.membership.status !== "ACTIVE" ||
    s.membership.role === "WORKER"
  ) {
    throw new Error("현재 회사의 관리자만 사용할 수 있습니다.");
  }
  return {
    companyId: s.membership.company_id,
    userId: s.user.id,
    displayName: s.user.displayName ?? "관리자",
  };
}

async function lookupParticipantNames(
  companyId: string,
  userIds: string[],
): Promise<Record<string, string>> {
  const rows = await query<{ user_id: string; snapshot_display_name: string }>(
    `SELECT user_id, snapshot_display_name
       FROM company_members
      WHERE company_id = $1 AND user_id = ANY($2::uuid[])`,
    [companyId, userIds],
  );
  const map: Record<string, string> = {};
  for (const r of rows) map[r.user_id] = r.snapshot_display_name;
  return map;
}

function parsePayload(raw: FormDataEntryValue | null): unknown | null {
  if (typeof raw !== "string" || raw.length > 300000) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------------
// 1) 최초 생성 (표준서 + 최초평가)
// -----------------------------------------------------------------------------

export async function createStandardAction(
  _prev: StandardActionState,
  form: FormData,
): Promise<StandardActionState> {
  let context;
  try {
    context = await actor();
  } catch (e) {
    return { error: (e as Error).message };
  }
  const raw = parsePayload(form.get("payload"));
  if (!raw) return { error: "잘못된 요청" };
  const parsed = initialStandardSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "입력을 확인하세요." };
  }
  const nameMap = await lookupParticipantNames(
    context.companyId,
    parsed.data.first_assessment.participant_user_ids,
  );
  let standardId: string;
  try {
    const created = await createStandardWithFirstAssessment({
      companyId: context.companyId,
      actorId: context.userId,
      actorDisplayName: context.displayName,
      payload: parsed.data,
      participantDisplayNames: nameMap,
    });
    standardId = created.standardId;
  } catch (e) {
    return {
      error:
        (e as Error).message ||
        "표준서 저장에 실패했습니다. 다시 시도해 주세요.",
    };
  }
  revalidatePath("/standards");
  revalidatePath(`/standards/${standardId}`);
  redirect(`/standards/${standardId}`);
}

// -----------------------------------------------------------------------------
// 2) 표준서 편집 (mutable)
// -----------------------------------------------------------------------------

/**
 * 개정 초안 저장. `approve=1` 이면 저장한 뒤 바로 승인까지 — 승인된 판은 그 뒤로
 * 고치지 않는다.
 */
export async function updateStandardAction(
  _prev: StandardActionState,
  form: FormData,
): Promise<StandardActionState> {
  let context;
  try {
    context = await actor();
  } catch (e) {
    return { error: (e as Error).message };
  }
  const standardId = String(form.get("standard_id") ?? "");
  if (!standardId) return { error: "잘못된 요청" };
  const raw = parsePayload(form.get("payload"));
  if (!raw) return { error: "잘못된 요청" };
  const parsed = standardEditSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "입력을 확인하세요." };
  }
  const approve = form.get("approve") === "1";
  try {
    await updateRevisionDraft({
      companyId: context.companyId,
      actorId: context.userId,
      standardId,
      payload: parsed.data,
    });
    if (approve)
      await approveRevision({
        companyId: context.companyId,
        actorId: context.userId,
        standardId,
        changeNote: parsed.data.change_note,
      });
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath("/standards");
  revalidatePath(`/standards/${standardId}`);
  redirect(`/standards/${standardId}`);
}

/** 개정 시작: 현재 판을 복사한 초안을 만들고 수정 화면으로. */
export async function startRevisionAction(
  form: FormData,
): Promise<StandardActionState> {
  let context;
  try {
    context = await actor();
  } catch (e) {
    return { error: (e as Error).message };
  }
  const standardId = String(form.get("standard_id") ?? "");
  if (!standardId) return { error: "잘못된 요청" };
  try {
    await startRevision({
      companyId: context.companyId,
      actorId: context.userId,
      standardId,
    });
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath(`/standards/${standardId}`);
  redirect(`/standards/${standardId}/edit`);
}

export async function approveRevisionAction(
  form: FormData,
): Promise<StandardActionState> {
  let context;
  try {
    context = await actor();
  } catch (e) {
    return { error: (e as Error).message };
  }
  const standardId = String(form.get("standard_id") ?? "");
  if (!standardId) return { error: "잘못된 요청" };
  try {
    await approveRevision({
      companyId: context.companyId,
      actorId: context.userId,
      standardId,
      changeNote: String(form.get("change_note") ?? ""),
    });
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath("/standards");
  revalidatePath(`/standards/${standardId}`);
  return undefined;
}

export async function discardRevisionAction(
  form: FormData,
): Promise<StandardActionState> {
  let context;
  try {
    context = await actor();
  } catch (e) {
    return { error: (e as Error).message };
  }
  const standardId = String(form.get("standard_id") ?? "");
  if (!standardId) return { error: "잘못된 요청" };
  try {
    await discardRevision({
      companyId: context.companyId,
      actorId: context.userId,
      standardId,
    });
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath(`/standards/${standardId}`);
  return undefined;
}

// -----------------------------------------------------------------------------
// 3) 위험성평가 회차 추가
// -----------------------------------------------------------------------------

export async function addAssessmentAction(
  _prev: StandardActionState,
  form: FormData,
): Promise<StandardActionState> {
  let context;
  try {
    context = await actor();
  } catch (e) {
    return { error: (e as Error).message };
  }
  const standardId = String(form.get("standard_id") ?? "");
  if (!standardId) return { error: "잘못된 요청" };
  const raw = parsePayload(form.get("payload"));
  if (!raw) return { error: "잘못된 요청" };
  const parsed = assessmentRoundSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "입력을 확인하세요." };
  }
  const nameMap = await lookupParticipantNames(
    context.companyId,
    parsed.data.participant_user_ids,
  );
  try {
    await addAssessmentRound({
      companyId: context.companyId,
      actorId: context.userId,
      actorDisplayName: context.displayName,
      standardId,
      payload: parsed.data,
      participantDisplayNames: nameMap,
    });
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath("/standards");
  revalidatePath(`/standards/${standardId}`);
  redirect(`/standards/${standardId}`);
}

// -----------------------------------------------------------------------------
// 4) 폐기
// -----------------------------------------------------------------------------

export async function archiveStandardAction(
  formData: FormData,
): Promise<StandardActionState> {
  let context;
  try {
    context = await actor();
  } catch (e) {
    return { error: (e as Error).message };
  }
  const standardId = String(formData.get("standard_id") ?? "");
  if (!standardId) return { error: "잘못된 요청" };
  try {
    await archiveStandard({
      companyId: context.companyId,
      actorId: context.userId,
      standardId,
    });
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath("/standards");
  revalidatePath(`/standards/${standardId}`);
  return { message: "표준서를 폐기했습니다." };
}

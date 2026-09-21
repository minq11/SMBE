"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { cookies } from "next/headers";
import { getCurrentSession } from "@/server/session";
import { withTransaction } from "@/server/db";
import { LINK_COOKIE, resolveAccessToken } from "@/server/worker-access";
import {
  AttachmentError,
  TARGET_TYPES,
  confirmUpload,
  deleteAttachment,
  presignRead,
  presignUpload,
  type AttachmentTarget,
} from "@/server/attachments";

/**
 * 첨부도 점검과 같은 두 경로를 받는다 — 로그인 사용자와 링크 방문자.
 * 링크에는 작업자와 작업지시가 들어 있으므로 서버가 소속 회사를 따라가
 * 요금제를 확인할 수 있다. 사진을 가장 많이 찍는 사람이 현장 작업자이고
 * 그 사람의 주 진입로가 링크라, 여기를 막으면 유료 기능이 닿지 않는다.
 * 범위는 토큰이 가리키는 작업지시 하나로 좁혀진다 (server/attachments.ts).
 */
async function actor() {
  const s = await getCurrentSession();
  if (s?.membership && s.membership.status === "ACTIVE")
    return { companyId: s.membership.company_id, userId: s.user.id };

  const token = (await cookies()).get(LINK_COOKIE)?.value;
  const grant = token
    ? await withTransaction((c) => resolveAccessToken(c, token))
    : null;
  if (!grant) throw new AttachmentError("로그인이 필요합니다.");
  return {
    companyId: grant.worker.companyId,
    userId: grant.worker.userId,
    linkWorkOrderId: grant.workOrderId,
  };
}

function safeError(error: unknown): string {
  return error instanceof AttachmentError
    ? error.message
    : "처리하지 못했습니다. 잠시 후 다시 시도하세요.";
}

const presignInput = z.object({
  targetType: z.enum(TARGET_TYPES),
  targetId: z.string().uuid(),
  filename: z.string().min(1).max(200),
  mimeType: z.string().min(1).max(80),
  sizeBytes: z.number().int().positive(),
});

export async function requestUploadUrlAction(
  raw: z.infer<typeof presignInput>,
): Promise<
  | { ok: true; attachmentId: string; uploadUrl: string }
  | { ok: false; error: string }
> {
  try {
    const input = presignInput.parse(raw);
    const context = await actor();
    const result = await presignUpload(context, input);
    return {
      ok: true,
      attachmentId: result.attachmentId,
      uploadUrl: result.uploadUrl,
    };
  } catch (error) {
    return { ok: false, error: safeError(error) };
  }
}

const confirmInput = z.object({
  attachmentId: z.string().uuid(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  sizeBytes: z.number().int().positive().optional(),
  invalidatePath: z.string().max(500).optional(),
});

export async function confirmUploadAction(
  raw: z.infer<typeof confirmInput>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const input = confirmInput.parse(raw);
    const context = await actor();
    await confirmUpload(context, input.attachmentId, {
      width: input.width,
      height: input.height,
      sizeBytes: input.sizeBytes,
    });
    if (input.invalidatePath) revalidatePath(input.invalidatePath);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: safeError(error) };
  }
}

export async function getViewUrlAction(
  attachmentId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    if (!z.string().uuid().safeParse(attachmentId).success)
      throw new AttachmentError("잘못된 요청");
    const context = await actor();
    const url = await presignRead(context, attachmentId);
    return { ok: true, url };
  } catch (error) {
    return { ok: false, error: safeError(error) };
  }
}

export async function deleteAttachmentAction(
  attachmentId: string,
  invalidatePath?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (!z.string().uuid().safeParse(attachmentId).success)
      throw new AttachmentError("잘못된 요청");
    const context = await actor();
    await deleteAttachment(context, attachmentId);
    if (invalidatePath) revalidatePath(invalidatePath);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: safeError(error) };
  }
}

export type AttachmentTargetType = AttachmentTarget;

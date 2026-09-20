"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentSession } from "@/server/session";
import {
  AttachmentError,
  TARGET_TYPES,
  confirmUpload,
  deleteAttachment,
  presignRead,
  presignUpload,
  type AttachmentTarget,
} from "@/server/attachments";

async function actor() {
  const s = await getCurrentSession();
  if (!s?.membership || s.membership.status !== "ACTIVE")
    throw new AttachmentError("로그인이 필요합니다.");
  return { companyId: s.membership.company_id, userId: s.user.id };
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

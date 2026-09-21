"use client";
import imageCompression from "browser-image-compression";
import {
  confirmUploadAction,
  requestUploadUrlAction,
  type AttachmentTargetType,
} from "./actions";

const COMPRESS_OPTIONS = {
  maxSizeMB: 1,
  maxWidthOrHeight: 1600,
  useWebWorker: true,
  fileType: "image/jpeg",
  initialQuality: 0.85,
};

export type UploadStage = "compress" | "upload" | "confirm";

/**
 * 사진 한 장을 압축 → presigned PUT → confirm 까지 보낸다.
 *
 * 즉시 올리는 화면(표준서)과 저장 후 한꺼번에 올리는 화면(점검)이 같은 경로를
 * 쓰도록 떼어냈다. 점검은 붙일 자리(inspection_results 행)가 저장 전에는 없어
 * 파일을 들고 있다가 나중에 올려야 한다.
 */
export async function uploadImage(
  target: { targetType: AttachmentTargetType; targetId: string },
  file: File,
  options: {
    keepOriginal?: boolean;
    invalidatePath?: string;
    onStage?: (stage: UploadStage) => void;
  } = {},
): Promise<void> {
  options.onStage?.("compress");
  const compressed = options.keepOriginal
    ? file
    : await imageCompression(file, COMPRESS_OPTIONS);
  const dims = await readDimensions(compressed).catch(() => null);

  options.onStage?.("upload");
  const presign = await requestUploadUrlAction({
    ...target,
    filename: file.name.slice(0, 200),
    mimeType: compressed.type || "image/jpeg",
    sizeBytes: compressed.size,
  });
  if (!presign.ok) throw new Error(presign.error);

  const res = await fetch(presign.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": compressed.type || "application/octet-stream",
    },
    body: compressed,
  });
  if (!res.ok) throw new Error(`S3 업로드 실패 (${res.status})`);

  options.onStage?.("confirm");
  const confirm = await confirmUploadAction({
    attachmentId: presign.attachmentId,
    width: dims?.width,
    height: dims?.height,
    sizeBytes: compressed.size,
    invalidatePath: options.invalidatePath,
  });
  if (!confirm.ok) throw new Error(confirm.error);
}

function readDimensions(
  file: Blob,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const dims = { width: img.naturalWidth, height: img.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(dims);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("치수 파악 실패"));
    };
    img.src = url;
  });
}

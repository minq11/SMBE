"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, ImageUp, Loader2, Paperclip, X } from "lucide-react";
import { type AttachmentTargetType } from "./actions";
import { uploadImage, type UploadStage } from "./upload";

type Props = {
  targetType: AttachmentTargetType;
  targetId: string;
  /** 업로드 후 새로고침할 서버 경로. */
  invalidatePath?: string;
  /** 압축 하지 않고 원본 그대로 업로드. */
  keepOriginal?: boolean;
  /** 업로드 성공 후 콜백 (목록 다시 로드용). */
  onUploaded?: () => void;
  /** 라벨 override. */
  label?: string;
  /** 단추 그림. 표준서 단계는 클립. */
  icon?: "camera" | "clip";
};

export function AttachmentUploader({
  targetType,
  targetId,
  invalidatePath,
  keepOriginal = false,
  onUploaded,
  label = "사진 추가",
  icon = "camera",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
    stage: UploadStage;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = async (files: FileList) => {
    setError(null);
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!list.length) {
      setError("이미지 파일만 업로드할 수 있습니다.");
      return;
    }
    startTransition(async () => {
      for (let i = 0; i < list.length; i++) {
        const raw = list[i];
        try {
          await uploadImage({ targetType, targetId }, raw, {
            keepOriginal,
            invalidatePath,
            onStage: (stage) =>
              setProgress({ current: i + 1, total: list.length, stage }),
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "업로드 실패";
          setError(`${raw.name}: ${message}`);
          break;
        }
      }
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
      onUploaded?.();
    });
  };

  return (
    <div className="attach-uploader">
      <label className="attach-uploader-cta">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
          disabled={pending}
          hidden
        />
        {pending ? (
          <Loader2 className="spin" size={14} />
        ) : icon === "clip" ? (
          <Paperclip size={14} />
        ) : (
          <Camera size={14} />
        )}
        <span>
          {pending
            ? progress
              ? progressLabel(progress)
              : "업로드 중..."
            : label}
        </span>
      </label>
      {error && (
        <p className="attach-uploader-error" role="alert">
          <X size={13} /> {error}
        </p>
      )}
      {!pending && !error && (
        <p className="attach-uploader-hint">
          <ImageUp size={11} /> 이미지 · 최대 10MB · 자동 압축·리사이즈
        </p>
      )}
    </div>
  );
}

function progressLabel(p: {
  current: number;
  total: number;
  stage: string;
}): string {
  const s =
    p.stage === "compress" ? "압축" : p.stage === "upload" ? "업로드" : "완료";
  return p.total > 1 ? `${p.current}/${p.total} ${s} 중…` : `${s} 중…`;
}

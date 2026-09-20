"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Maximize2, Trash2, X } from "lucide-react";
import {
  deleteAttachmentAction,
  getViewUrlAction,
} from "./actions";

export type AttachmentItem = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
};

/**
 * READY 첨부 리스트 (썸네일 그리드) + 클릭 시 원본 라이트박스.
 * URL 은 클릭 시 lazy 로 signed URL 발급 (Feed 전체에 대해 미리 다 발급하지 않음).
 */
export function AttachmentList({
  items,
  canDelete = true,
  invalidatePath,
  onDeleted,
  emptyLabel = "첨부된 사진이 없습니다.",
  compact = false,
}: {
  items: AttachmentItem[];
  canDelete?: boolean;
  invalidatePath?: string;
  onDeleted?: () => void;
  emptyLabel?: string;
  compact?: boolean;
}) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    // 열려있는 아이템의 큰 URL 이 아직 없으면 lazy 로드
    if (!openId || urls[openId]) return;
    startTransition(async () => {
      const res = await getViewUrlAction(openId);
      if (res.ok) setUrls((prev) => ({ ...prev, [openId]: res.url }));
    });
  }, [openId, urls]);

  // 썸네일용 URL 도 최초 렌더 시 배치 로드
  useEffect(() => {
    const missing = items.filter((it) => !urls[it.id]);
    if (missing.length === 0) return;
    startTransition(async () => {
      const results = await Promise.all(
        missing.map((it) => getViewUrlAction(it.id)),
      );
      setUrls((prev) => {
        const next = { ...prev };
        results.forEach((r, i) => {
          if (r.ok) next[missing[i].id] = r.url;
        });
        return next;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map((i) => i.id).join(",")]);

  const handleDelete = (id: string) => {
    if (!confirm("이 사진을 삭제할까요?")) return;
    startTransition(async () => {
      const res = await deleteAttachmentAction(id, invalidatePath);
      if (res.ok) onDeleted?.();
      else alert(res.error);
    });
  };

  if (items.length === 0)
    return <p className="attach-empty">{emptyLabel}</p>;

  const openItem = items.find((it) => it.id === openId);
  const openUrl = openId ? urls[openId] : null;

  return (
    <>
      <ul
        className={`attach-grid${compact ? " attach-grid--compact" : ""}`}
        role="list"
      >
        {items.map((it) => (
          <li key={it.id} className="attach-cell">
            <button
              type="button"
              className="attach-thumb"
              onClick={() => setOpenId(it.id)}
              aria-label={`${it.filename} 크게 보기`}
            >
              {urls[it.id] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={urls[it.id]} alt={it.filename} loading="lazy" />
              ) : (
                <span className="attach-thumb-loading">
                  <Loader2 size={14} className="spin" />
                </span>
              )}
              <span className="attach-thumb-icon" aria-hidden="true">
                <Maximize2 size={12} />
              </span>
            </button>
            {canDelete && (
              <button
                type="button"
                className="attach-thumb-delete"
                onClick={() => handleDelete(it.id)}
                disabled={pending}
                aria-label="사진 삭제"
              >
                <Trash2 size={12} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {openItem && (
        <div
          className="attach-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={openItem.filename}
          onClick={() => setOpenId(null)}
        >
          <button
            type="button"
            className="attach-lightbox-close"
            aria-label="닫기"
            onClick={() => setOpenId(null)}
          >
            <X size={20} />
          </button>
          {openUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={openUrl}
              alt={openItem.filename}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <Loader2 size={28} className="spin" />
          )}
        </div>
      )}
    </>
  );
}

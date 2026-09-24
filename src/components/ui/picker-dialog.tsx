"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Search } from "lucide-react";

/**
 * 고르는 창 — 인원·표준서처럼 목록이 길어질 수 있는 선택을 화면 밖 팝업으로 뺀다.
 * 확인 창과 같은 틀(넓은 화면은 카드, 좁은 화면은 아래 시트)이고, 검색칸은 늘
 * 보이며 목록만 안에서 스크롤한다. 닫기는 "완료" 하나 — 고른 것은 그때그때 반영되고
 * 창은 목록을 보여 줄 뿐이라 취소가 따로 없다.
 */
export function PickerDialog({
  open,
  onClose,
  title,
  query,
  onQuery,
  searchLabel,
  searchPlaceholder = "이름 검색",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  query: string;
  onQuery: (q: string) => void;
  searchLabel: string;
  searchPlaceholder?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="confirm-dialog picker-dialog"
      aria-label={title}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {open && (
        <div className="confirm-dialog-body picker-dialog-body">
          <h2>{title}</h2>
          <label className="people-picker-search picker-dialog-search">
            <Search size={14} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchLabel}
              enterKeyHint="search"
              autoComplete="off"
              autoFocus
            />
          </label>
          <div className="picker-dialog-scroll">{children}</div>
          <div className="confirm-dialog-actions">
            <button type="button" className="btn-primary" onClick={onClose}>
              완료
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}

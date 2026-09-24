"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Search } from "lucide-react";

/**
 * 고르는 창 — 인원·표준서처럼 목록이 길어질 수 있는 선택을 화면 밖 팝업으로 뺀다.
 * 확인 창과 같은 틀(넓은 화면은 카드, 좁은 화면은 아래 시트)이고, 검색칸은 늘
 * 보이며 목록만 안에서 스크롤한다. 닫기는 "완료" 하나 — 고른 것은 그때그때 반영되고
 * 창은 목록을 보여 줄 뿐이라 취소가 따로 없다.
 *
 * 처음엔 전체가 보이고, 검색어를 넣고 [검색](또는 Enter)해야 거른다. 지우면 다시 전체
 * (사장님 결정). `query` 는 적용된 검색어, 입력 중인 글은 안에서 든다.
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
  const [text, setText] = useState(query);
  // 열릴 때 입력칸을 적용된 검색어로 되돌린다 (렌더 중 상태 맞추기 — 효과보다 한 번
  // 덜 그린다).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setText(query);
  }
  const apply = () => onQuery(text.trim());
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
          <div className="picker-dialog-search-row">
            <label className="people-picker-search picker-dialog-search">
              <Search size={14} aria-hidden="true" />
              <input
                type="search"
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  // 지우면 전체로 돌아간다 — 검색을 다시 누를 필요 없이.
                  if (e.target.value.trim() === "") onQuery("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    apply();
                  }
                }}
                placeholder={searchPlaceholder}
                aria-label={searchLabel}
                enterKeyHint="search"
                autoComplete="off"
                autoFocus
              />
            </label>
            <button type="button" className="btn-secondary" onClick={apply}>
              검색
            </button>
          </div>
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

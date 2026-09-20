"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { HelpCircle, X } from "lucide-react";

/**
 * 폼 라벨 옆에 두는 소형 도움말 팝오버.
 * 클릭 → 아래로 펼침, 바깥 클릭·ESC 로 닫힘.
 */
export function HelpTip({
  title,
  children,
  ariaLabel,
}: {
  title: string;
  children: ReactNode;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (
        wrapRef.current &&
        !wrapRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span className="help-tip" ref={wrapRef}>
      <button
        type="button"
        className="help-tip-button"
        aria-label={ariaLabel ?? `${title} 도움말`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <HelpCircle size={14} />
      </button>
      {open && (
        <div className="help-tip-panel" role="dialog" aria-label={title}>
          <div className="help-tip-head">
            <strong>{title}</strong>
            <button
              type="button"
              className="help-tip-close"
              aria-label="닫기"
              onClick={() => setOpen(false)}
            >
              <X size={13} />
            </button>
          </div>
          <div className="help-tip-body">{children}</div>
        </div>
      )}
    </span>
  );
}

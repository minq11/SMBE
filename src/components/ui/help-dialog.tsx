"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CircleHelp } from "lucide-react";

/**
 * 폼 안의 "이게 뭔가요?" 글 단추와 그 답.
 *
 * 물음표 동그라미(22px)는 손가락으로 못 누르고, 라벨 옆 팝오버는 좁은 화면에서
 * 오른쪽이 잘렸다. 대신 누를 만한 글 단추(44px)를 두고, 답은 확인 창과 같은
 * 시트·카드로 띄운다 (globals.css .confirm-dialog / .help-dialog).
 */
export function HelpDialog({
  title,
  trigger,
  children,
}: {
  title: string;
  /** 단추 글. "PTW 대상 작업은?" 처럼 질문으로 쓴다. */
  trigger: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <>
      <button
        type="button"
        className="help-dialog-trigger"
        onClick={() => setOpen(true)}
      >
        <CircleHelp size={15} /> {trigger}
      </button>
      <dialog
        ref={ref}
        className="confirm-dialog help-dialog"
        aria-label={title}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          // 바깥(backdrop)을 누르면 닫는다. 안쪽은 body 가 받는다.
          if (e.target === e.currentTarget) setOpen(false);
        }}
      >
        {open && (
          <div className="confirm-dialog-body">
            <h2>{title}</h2>
            <div className="help-dialog-content">{children}</div>
            <div className="confirm-dialog-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={() => setOpen(false)}
                autoFocus
              >
                확인
              </button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}

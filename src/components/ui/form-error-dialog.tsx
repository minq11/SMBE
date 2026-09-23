"use client";

import { useEffect, useRef, useState } from "react";
import { CircleAlert } from "lucide-react";

/**
 * 폼 오류는 위에 조용히 뜨는 띠가 아니라 안내 창이다 (헌법 9장).
 *
 * 좁은 화면에서 저장은 맨 아래 띠에서 누르는데 오류 띠는 맨 위에 붙어, 눌러도
 * 아무 일도 안 일어난 것처럼 보였다. 창은 어디서 눌렀든 눈앞에 뜬다.
 *
 * `nonce` 는 같은 문장의 오류가 두 번 나도 다시 뜨게 하는 표시다. 서버 액션의
 * state 객체를 그대로 넘기면 된다 — 매번 새 객체가 온다.
 */
export function FormErrorDialog({
  message,
  nonce,
}: {
  message?: string | null;
  nonce?: unknown;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // 닫은 오류는 그 nonce 로 기억한다. 새 오류(새 nonce)는 다시 뜬다.
  const [dismissed, setDismissed] = useState<unknown>(undefined);
  const open = Boolean(message) && dismissed !== nonce;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  const close = () => setDismissed(nonce);
  return (
    <dialog
      ref={ref}
      className="confirm-dialog form-error-dialog"
      role="alertdialog"
      aria-label="저장하지 못했습니다"
      onClose={close}
    >
      {open && (
        <div className="confirm-dialog-body">
          <h2>
            <CircleAlert size={18} /> 저장하지 못했습니다
          </h2>
          <div className="confirm-dialog-message">{message}</div>
          <div className="confirm-dialog-actions">
            <button
              type="button"
              className="btn-primary"
              onClick={close}
              autoFocus
            >
              확인
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}

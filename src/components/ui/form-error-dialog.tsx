"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CircleAlert } from "lucide-react";

/**
 * 창을 직접 띄우는 화면(서버 액션의 state 가 아니라 자기 state 로 오류를 들고
 * 있는 곳)을 위한 짝.
 *
 * `nonce` 에 오류 **문자열**을 그냥 넘기면 안 된다 — 같은 항목을 또 빠뜨려 같은
 * 문장이 나오면 값이 그대로라 리렌더가 일어나지 않고, 이미 닫은 것으로 남아 창이
 * 다시 뜨지 않는다. 사용자에게는 저장 단추가 고장 난 것처럼 보인다.
 * 여기서는 시도할 때마다 번호를 올려 그 일을 막는다.
 *
 *   const err = useFormError();
 *   if (!level) return err.show("조치 후 위험성 수준을 고르세요.");
 *   <FormErrorDialog message={err.message} nonce={err.nonce} />
 */
export function useFormError() {
  const [state, setState] = useState<{
    message: string;
    nonce: number;
  } | null>(null);
  const count = useRef(0);
  const show = useCallback((message: string) => {
    count.current += 1;
    setState({ message, nonce: count.current });
  }, []);
  const clear = useCallback(() => setState(null), []);
  return { message: state?.message ?? null, nonce: state?.nonce, show, clear };
}

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
  title = "저장하지 못했습니다",
}: {
  message?: string | null;
  nonce?: unknown;
  /** 저장이 아닌 일(폐기 등)이 막혔을 때는 그 일의 이름으로. */
  title?: string;
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
      aria-label={title}
      onClose={close}
    >
      {open && (
        <div className="confirm-dialog-body">
          <h2>
            <CircleAlert size={18} /> {title}
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

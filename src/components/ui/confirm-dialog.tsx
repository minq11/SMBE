"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Options = {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 지우기·폐기처럼 되돌리기 어려운 동작 */
  danger?: boolean;
};

/**
 * 브라우저 `confirm()` 대신 쓰는 확인 창.
 *
 * 기본 confirm 은 문장이 길면 좁은 창에 줄글로 뜨고, 버튼 크기·문구·순서를
 * 손댈 수 없다. 좁은 화면에서는 아래에서 올라오는 시트로, 넓은 화면에서는
 * 가운데 카드로 뜬다 (globals.css .confirm-dialog).
 *
 *   const { confirm, dialog } = useConfirm();
 *   ...
 *   if (!(await confirm("정말 지울까요?", { danger: true }))) return;
 *   ...
 *   return <>{...}{dialog}</>;
 */
export function useConfirm() {
  const ref = useRef<HTMLDialogElement>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const [content, setContent] = useState<
    ({ message: ReactNode } & Options) | null
  >(null);

  const confirm = useCallback(
    (message: ReactNode, options: Options = {}) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false);
        resolver.current = resolve;
        setContent({ message, ...options });
      }),
    [],
  );
  useEffect(() => {
    if (content && !ref.current?.open) ref.current?.showModal();
  }, [content]);
  const settle = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    if (ref.current?.open) ref.current.close();
    setContent(null);
  };

  const dialog = (
    <dialog
      ref={ref}
      className="confirm-dialog"
      aria-labelledby={content?.title ? "confirm-dialog-title" : undefined}
      onCancel={(event) => {
        event.preventDefault();
        settle(false);
      }}
      onClose={() => {
        if (resolver.current) settle(false);
      }}
    >
      {content && (
        <div className="confirm-dialog-body">
          {content.title && <h2 id="confirm-dialog-title">{content.title}</h2>}
          <div className="confirm-dialog-message">{content.message}</div>
          <div className="confirm-dialog-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => settle(false)}
            >
              {content.cancelLabel ?? "취소"}
            </button>
            <button
              type="button"
              className={content.danger ? "btn-danger" : "btn-primary"}
              onClick={() => settle(true)}
              autoFocus
            >
              {content.confirmLabel ?? "확인"}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
  return { confirm, dialog };
}

"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { CheckCircle2, Search, X } from "lucide-react";

type OpenPreview = (title: string) => void;

const PreviewCtx = createContext<OpenPreview | null>(null);

export function PreviewDialogProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const open = useCallback<OpenPreview>((next) => {
    triggerRef.current = document.activeElement as HTMLElement | null;
    setTitle(next);
    dialogRef.current?.showModal();
  }, []);

  const close = useCallback(() => {
    dialogRef.current?.close();
    triggerRef.current?.focus();
  }, []);

  return (
    <PreviewCtx.Provider value={open}>
      {children}
      <dialog
        ref={dialogRef}
        className="preview-dialog"
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        onCancel={close}
        aria-labelledby="preview-dialog-title"
      >
        <button
          className="icon-button preview-dialog-close"
          aria-label="닫기"
          onClick={close}
        >
          <X size={18} />
        </button>
        <span className="preview-dialog-symbol">
          <Search size={22} />
        </span>
        <h2 id="preview-dialog-title">{title}</h2>
        <p>
          아직 준비 중인 기능입니다. 현재는 메인 화면만 살펴볼 수 있으며 업무
          데이터는 저장·변경되지 않습니다.
        </p>
        <button className="primary-button" onClick={close}>
          <CheckCircle2 size={14} /> 확인했어요
        </button>
      </dialog>
    </PreviewCtx.Provider>
  );
}

export function usePreview(): OpenPreview {
  const open = useContext(PreviewCtx);
  if (!open) {
    throw new Error("usePreview must be used within PreviewDialogProvider");
  }
  return open;
}

"use client";
import { useActionState, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import {
  Ban,
  CheckCircle2,
  Eye,
  Link2,
  Mail,
  Printer,
  Send,
  type LucideIcon,
} from "lucide-react";
import { orderCommandAction } from "./actions";

const COMMAND_ICON: Record<
  "request" | "approve" | "approveIssue" | "issue" | "cancel" | "send",
  LucideIcon
> = {
  request: Eye,
  approve: CheckCircle2,
  approveIssue: Send,
  issue: Send,
  cancel: Ban,
  send: Mail,
};

export function OrderCommand({
  id,
  revision,
  command,
  label,
  confirmText,
}: {
  id: string;
  revision: number;
  command: "request" | "approve" | "approveIssue" | "issue" | "cancel" | "send";
  label: string;
  confirmText?: string;
}) {
  const [state, action, pending] = useActionState(
    orderCommandAction,
    undefined,
  );
  return (
    <form
      action={action}
      className="wo-command"
      onSubmit={(event) => {
        if (confirmText && !window.confirm(confirmText)) event.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="revision" value={revision} />
      <input type="hidden" name="command" value={command} />
      {command === "cancel" && (
        <label className="wo-field">
          <span>취소 사유</span>
          <textarea name="reason" required maxLength={1000} />
        </label>
      )}
      <button
        className={command === "cancel" ? "btn-secondary" : "btn-primary"}
        type="submit"
        disabled={pending}
      >
        {(() => {
          const Icon = COMMAND_ICON[command];
          return <Icon size={14} />;
        })()}
        {pending ? "처리 중…" : label}
      </button>
      {state?.error && (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      )}
      {state?.message && (
        <p role="status" className="wo-muted">
          {state.message}
        </p>
      )}
    </form>
  );
}
export function PrintButton() {
  return (
    <button
      type="button"
      className="btn-primary wo-no-print"
      onClick={() => window.print()}
    >
      <Printer size={14} />
      지시서 인쇄 / PDF 저장
    </button>
  );
}
export function PrintTimestamp({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    const update = () => flushSync(() => setValue(new Date().toISOString()));
    window.addEventListener("beforeprint", update);
    return () => window.removeEventListener("beforeprint", update);
  }, []);
  return (
    <time dateTime={value}>
      {new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
    </time>
  );
}
export function CopyLinkButton({ url }: { url: string }) {
  const [state, action, pending] = useActionState(async () => {
    try {
      await navigator.clipboard.writeText(url);
      return "링크를 복사했습니다.";
    } catch {
      return "복사하지 못했습니다. 아래 주소를 직접 복사하세요.";
    }
  }, "");
  return (
    <form action={action}>
      <button className="btn-secondary" disabled={pending}>
        <Link2 size={14} />
        작업 링크 복사
      </button>
      {state && <p role="status">{state}</p>}
      <input
        aria-label="작업 링크"
        readOnly
        value={url}
        className="wo-link-input"
      />
    </form>
  );
}

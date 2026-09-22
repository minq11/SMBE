"use client";

import Link from "next/link";
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
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { orderCommandAction } from "./actions";

type Command =
  | "request"
  | "approve"
  | "approveIssue"
  | "issue"
  | "cancel"
  | "send"
  | "delete";

const COMMAND_ICON: Record<Command, LucideIcon> = {
  request: Eye,
  approve: CheckCircle2,
  approveIssue: Send,
  issue: Send,
  cancel: Ban,
  send: Mail,
  delete: Trash2,
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
  command: Command;
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
/**
 * 지시서 출력물(A4 한 장)은 유료 기능이다. 무료 회사에서는 버튼을 숨기지 않고
 * 눌렀을 때 안내한다 — 버튼이 없으면 "이 제품에는 출력이 없다" 로 읽히지만,
 * 안내가 뜨면 무엇을 얻는지 알고 결정할 수 있다.
 */
export function PrintButton({ allowed = true }: { allowed?: boolean }) {
  const [blocked, setBlocked] = useState(false);
  return (
    <div className="wo-no-print">
      <button
        type="button"
        className="btn-primary"
        onClick={() => (allowed ? window.print() : setBlocked(true))}
      >
        <Printer size={14} />
        지시서 인쇄 / PDF 저장
      </button>
      {blocked && (
        <p role="alert" className="wo-notice">
          지시서 출력물은 유료 요금제에서 이용할 수 있습니다. 작업 정보와 QR 이
          A4 한 장으로 정리되어, 작업 장소에 붙여 두면 작업자가 QR 로 바로
          들어옵니다. 무료 요금제에서는 화면의 QR 과 이메일 링크로 전달하세요.{" "}
          <Link href="/billing">요금제 보기</Link>
        </p>
      )}
    </div>
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

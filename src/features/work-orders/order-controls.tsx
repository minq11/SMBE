"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useConfirm } from "@/components/ui/confirm-dialog";
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
import { FloatField, FloatTextarea } from "@/components/ui/float-field";
import { FormErrorDialog } from "@/components/ui/form-error-dialog";

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
  const { confirm, dialog } = useConfirm();
  const formRef = useRef<HTMLFormElement>(null);
  // 확인 창은 비동기라 제출을 한 번 막았다가, 확인되면 다시 제출한다.
  const confirmed = useRef(false);
  return (
    <form
      ref={formRef}
      action={action}
      className="wo-command"
      onSubmit={(event) => {
        if (!confirmText || confirmed.current) {
          confirmed.current = false;
          return;
        }
        event.preventDefault();
        void confirm(confirmText, {
          title: label,
          confirmLabel: label,
          danger: command === "cancel",
        }).then((ok) => {
          if (!ok) return;
          confirmed.current = true;
          formRef.current?.requestSubmit();
        });
      }}
    >
      {dialog}
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="revision" value={revision} />
      <input type="hidden" name="command" value={command} />
      <button className="btn-primary" type="submit" disabled={pending}>
        {(() => {
          const Icon = COMMAND_ICON[command];
          return <Icon size={14} />;
        })()}
        {pending ? "처리 중…" : label}
      </button>
      <FormErrorDialog message={state?.error} nonce={state} />
      {state?.message && (
        <p role="status" className="wo-muted">
          {state.message}
        </p>
      )}
    </form>
  );
}
/**
 * 지시서 취소. 머리의 복사 옆 단추 하나. 누르면 창이 열리고, 사유를 적어 확인하면
 * 취소된다 — 화면에 사유 칸을 늘 펼쳐 두지 않는다 (사장님 결정).
 */
export function CancelOrderButton({
  id,
  revision,
}: {
  id: string;
  revision: number;
}) {
  const [state, action, pending] = useActionState(
    orderCommandAction,
    undefined,
  );
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  // 취소되면 화면이 "취소된 지시서" 로 다시 그려진다. 창은 닫는다 (렌더 중 상태
  // 맞추기 — 효과보다 한 번 덜 그린다).
  const done = state?.message;
  const [seenDone, setSeenDone] = useState(done);
  if (done !== seenDone) {
    setSeenDone(done);
    if (done) setOpen(false);
  }
  return (
    <>
      <button
        type="button"
        className="btn-secondary"
        onClick={() => setOpen(true)}
      >
        <Ban size={14} /> 지시서 취소
      </button>
      <dialog
        ref={ref}
        className="confirm-dialog"
        aria-labelledby={`wo-cancel-title-${id}`}
        onCancel={(event) => {
          event.preventDefault();
          if (!pending) setOpen(false);
        }}
        onClose={() => setOpen(false)}
      >
        <form action={action} className="confirm-dialog-body">
          <h2 id={`wo-cancel-title-${id}`}>지시서 취소</h2>
          <p className="confirm-dialog-message">
            취소하면 QR·링크가 막히고 기존 기록은 보존됩니다.
          </p>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="revision" value={revision} />
          <input type="hidden" name="command" value="cancel" />
          <FloatTextarea
            id={`wo-cancel-reason-${id}`}
            label="취소 사유"
            name="reason"
            required
            maxLength={1000}
            disabled={pending}
          />
          <div className="confirm-dialog-actions">
            <button
              type="button"
              className="btn-secondary"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              닫기
            </button>
            <button className="btn-danger" type="submit" disabled={pending}>
              <Ban size={14} />
              {pending ? "처리 중…" : "지시서 취소"}
            </button>
          </div>
        </form>
        <FormErrorDialog message={state?.error} nonce={state} />
      </dialog>
    </>
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
      <FloatField
        id="wo-link-url"
        className="wo-link-field"
        label="작업 링크"
        readOnly
        value={url}
      />
    </form>
  );
}

/**
 * 초안 삭제 버튼.
 *
 * 초안은 목록에서 골라 지우는 것이 자연스럽다 — 잘못 만든 게 여러 개 쌓였을 때
 * 하나씩 상세로 들어갔다 나오게 만들 이유가 없다. 그래서 목록 행과 상세 액션
 * 줄 양쪽에 같은 버튼을 둔다.
 *
 * 목록에서 지우면 그 줄만 사라지면 되므로 이동하지 않는다. 상세에서 지우면 그
 * 자리가 404 가 되니 목록으로 보낸다 (next).
 */
export function DeleteDraftButton({
  id,
  revision,
  name,
  next,
}: {
  id: string;
  revision: number;
  name: string;
  next?: string;
}) {
  const [state, action, pending] = useActionState(
    orderCommandAction,
    undefined,
  );
  const { confirm, dialog } = useConfirm();
  const formRef = useRef<HTMLFormElement>(null);
  const confirmed = useRef(false);
  return (
    <form
      ref={formRef}
      action={action}
      className="wo-delete"
      onSubmit={(event) => {
        if (confirmed.current) {
          confirmed.current = false;
          return;
        }
        event.preventDefault();
        void confirm(`초안 '${name}' 을 삭제할까요?`, {
          title: "초안 삭제",
          confirmLabel: "삭제",
          danger: true,
        }).then((ok) => {
          if (!ok) return;
          confirmed.current = true;
          formRef.current?.requestSubmit();
        });
      }}
    >
      {dialog}
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="revision" value={revision} />
      <input type="hidden" name="command" value="delete" />
      {next && <input type="hidden" name="next" value={next} />}
      <button
        type="submit"
        className="wo-delete-button"
        disabled={pending}
        aria-label={`초안 ${name} 삭제`}
      >
        <Trash2 size={14} />
        <span className="wo-delete-label">{pending ? "삭제 중…" : "삭제"}</span>
      </button>
      <FormErrorDialog message={state?.error} nonce={state} />
    </form>
  );
}

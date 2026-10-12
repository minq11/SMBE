"use client";

import { useActionState, useRef } from "react";
import { Trash2 } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { FormErrorDialog } from "@/components/ui/form-error-dialog";
import { deleteTrainingAction } from "./actions";

export function DeleteTrainingButton({
  id,
  topic,
}: {
  id: string;
  topic: string;
}) {
  const [state, action, pending] = useActionState(
    deleteTrainingAction,
    undefined,
  );
  const { confirm, dialog } = useConfirm();
  const formRef = useRef<HTMLFormElement>(null);
  const confirmed = useRef(false);
  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={(event) => {
        if (confirmed.current) {
          confirmed.current = false;
          return;
        }
        event.preventDefault();
        void confirm(
          `교육 기록 '${topic}' 을 지울까요? 참석자 명부도 함께 사라집니다.`,
          {
            title: "교육 기록 삭제",
            confirmLabel: "삭제",
            danger: true,
          },
        ).then((ok) => {
          if (!ok) return;
          confirmed.current = true;
          formRef.current?.requestSubmit();
        });
      }}
    >
      {dialog}
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="btn-secondary btn--sm"
        data-tone="danger"
        disabled={pending}
      >
        <Trash2 size={14} /> {pending ? "삭제 중…" : "삭제"}
      </button>
      <FormErrorDialog
        message={state?.error}
        nonce={state}
        title="삭제하지 못했습니다"
      />
    </form>
  );
}

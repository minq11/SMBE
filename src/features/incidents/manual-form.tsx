"use client";

import { useActionState } from "react";
import { Save } from "lucide-react";
import { FloatTextarea } from "@/components/ui/float-field";
import { FormErrorDialog } from "@/components/ui/form-error-dialog";
import { updateIncidentManualAction } from "./actions";

/** 중대재해 대응 절차. 실시규정과 같은 방식 — 기본 문안이 들어 있어 고칠 것만 고친다. */
export function IncidentManualForm({
  manual,
  readOnly,
}: {
  manual: string;
  readOnly: boolean;
}) {
  const [state, action, pending] = useActionState(
    updateIncidentManualAction,
    undefined,
  );
  if (readOnly)
    return (
      <>
        <pre className="policy-readonly">{manual}</pre>
        <p className="wo-muted">관리자만 수정할 수 있습니다.</p>
      </>
    );
  return (
    <form action={action} className="policy-form">
      <FloatTextarea
        className="float-field--flush"
        id="incident-manual"
        label="대응 절차"
        name="manual"
        defaultValue={manual}
        rows={18}
        maxLength={4000}
        required
      />
      <div className="form-actions">
        <button className="btn-primary" disabled={pending}>
          <Save size={14} /> {pending ? "저장 중…" : "대응 절차 저장"}
        </button>
      </div>
      <FormErrorDialog message={state?.error} nonce={state} />
      {state?.message && <p role="status">{state.message}</p>}
    </form>
  );
}

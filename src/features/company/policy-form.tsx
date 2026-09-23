"use client";

import { useActionState } from "react";
import { updateAssessmentPolicyAction } from "./criteria-actions";
import { FormErrorDialog } from "@/components/ui/form-error-dialog";

/**
 * 위험성평가 실시규정 (고시 제9조). 목적·방법·시기·역할·참여·공유·기록을 회사가
 * 정해 둔 글. 기본 문안이 들어 있어 고칠 것만 고친다.
 */
export function AssessmentPolicyForm({
  policy,
  readOnly,
}: {
  policy: string;
  readOnly: boolean;
}) {
  const [state, action, pending] = useActionState(
    updateAssessmentPolicyAction,
    undefined,
  );
  if (readOnly)
    return (
      <>
        <pre className="policy-readonly">{policy}</pre>
        <p className="wo-muted">관리자만 수정할 수 있습니다.</p>
      </>
    );
  return (
    <form action={action} className="policy-form">
      <div className="criteria-form-field">
        <label htmlFor="assessment-policy">실시규정</label>
        <textarea
          id="assessment-policy"
          name="policy"
          defaultValue={policy}
          rows={12}
          maxLength={4000}
          required
        />
      </div>
      <button className="primary-button" disabled={pending}>
        {pending ? "저장 중…" : "실시규정 저장"}
      </button>
      <FormErrorDialog message={state?.error} nonce={state} />
      {state?.message && <p role="status">{state.message}</p>}
    </form>
  );
}

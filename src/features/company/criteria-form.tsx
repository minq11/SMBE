"use client";

import { useActionState } from "react";
import { updateRiskCriteriaAction } from "./criteria-actions";
import { MAX_CRITERIA_LENGTH } from "./criteria-limits";

export function RiskCriteriaForm({
  criteria,
  readOnly,
}: {
  criteria: string;
  readOnly: boolean;
}) {
  const [state, action, pending] = useActionState(
    updateRiskCriteriaAction,
    undefined,
  );
  if (readOnly)
    return (
      <>
        <pre className="criteria-readonly">{criteria}</pre>
        <p className="wo-muted">관리자만 수정할 수 있습니다.</p>
      </>
    );
  return (
    <form action={action} className="account-form">
      <label>
        위험성 수준 판단 기준
        <textarea
          name="risk_criteria"
          defaultValue={criteria}
          rows={10}
          maxLength={MAX_CRITERIA_LENGTH}
          required
        />
      </label>
      <button className="primary-button" disabled={pending}>
        {pending ? "저장 중…" : "저장"}
      </button>
      {state?.error && <p role="alert">{state.error}</p>}
      {state?.message && <p role="status">{state.message}</p>}
    </form>
  );
}

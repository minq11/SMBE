"use client";

import { useActionState, useState } from "react";
import { updateRiskCriteriaAction } from "./criteria-actions";
import {
  ACCEPTANCE_LABEL,
  MAX_DESCRIPTION_LENGTH,
  type RiskAcceptance,
  type RiskCriteria,
} from "./risk-criteria";
import { CriteriaList } from "./criteria-list";
import { Segmented } from "@/features/assessments/risk-level-picker";
import { LEVEL_LABEL } from "@/features/assessments/model";
import { FormErrorDialog } from "@/components/ui/form-error-dialog";

const ACCEPTANCE_OPTIONS = [
  { value: "ACCEPTABLE", label: ACCEPTANCE_LABEL.ACCEPTABLE, tone: "ok" },
  {
    value: "AFTER_REDUCTION",
    label: ACCEPTANCE_LABEL.AFTER_REDUCTION,
    tone: "mid",
  },
  {
    value: "NOT_ACCEPTABLE",
    label: ACCEPTANCE_LABEL.NOT_ACCEPTABLE,
    tone: "warn",
  },
] as const;

/**
 * 등급마다 한 칸: 정의(무엇이면 이 등급인가)와 허용 경계. 등급 수는 고정이라
 * 더하기·빼기가 없다.
 */
export function RiskCriteriaForm({
  criteria,
  readOnly,
}: {
  criteria: RiskCriteria;
  readOnly: boolean;
}) {
  const [state, action, pending] = useActionState(
    updateRiskCriteriaAction,
    undefined,
  );
  const [acceptance, setAcceptance] = useState(
    () =>
      Object.fromEntries(
        criteria.map((c) => [c.level, c.acceptance]),
      ) as Record<string, RiskAcceptance>,
  );
  if (readOnly)
    return (
      <>
        <CriteriaList criteria={criteria} />
        <p className="wo-muted">관리자만 수정할 수 있습니다.</p>
      </>
    );
  return (
    <form action={action} className="criteria-form">
      {criteria.map((c) => (
        <fieldset key={c.level} className="criteria-form-level">
          <legend>
            <span
              className={`criteria-level criteria-level--${c.level.toLowerCase()}`}
            >
              {LEVEL_LABEL[c.level]}
            </span>
          </legend>
          <label className="criteria-form-field">
            <span>정의</span>
            <textarea
              name={"description_" + c.level}
              defaultValue={c.description}
              rows={2}
              maxLength={MAX_DESCRIPTION_LENGTH}
              required
            />
          </label>
          <Segmented
            label="허용 여부"
            name={"acceptance_" + c.level}
            value={acceptance[c.level] ?? ""}
            options={ACCEPTANCE_OPTIONS}
            onChange={(v) => setAcceptance((a) => ({ ...a, [c.level]: v }))}
          />
        </fieldset>
      ))}
      <button className="primary-button" disabled={pending}>
        {pending ? "저장 중…" : "저장"}
      </button>
      <FormErrorDialog message={state?.error} nonce={state} />
      {state?.message && <p role="status">{state.message}</p>}
    </form>
  );
}

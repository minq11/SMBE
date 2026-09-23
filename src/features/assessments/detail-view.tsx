"use client";

import { useState, useTransition } from "react";
import { Check, ChevronDown, Save } from "lucide-react";
import type {
  AssessmentDetail,
  AssessmentItemDetail,
} from "@/server/assessments";
import { AllowablePicker, RiskLevelPicker } from "./risk-level-picker";
import { recordRiskActionAction } from "./actions";
import { LEVEL_LABEL, koDate } from "./model";
import { FormErrorDialog } from "@/components/ui/form-error-dialog";
import type { RiskCriteria } from "@/features/company/risk-criteria";

/**
 * 위험요인·대책과 조치 이행. 계획(감소대책·담당·예정일)과 실제(조치·완료일·조치 후
 * 수준)를 나란히 둔다. 허용 불가로 판정된 항목은 조치를 적기 전까지 "조치 필요".
 */
export function AssessmentItems({
  detail,
  canRecord,
}: {
  detail: AssessmentDetail;
  canRecord: boolean;
}) {
  return (
    <ol className="asmt-items">
      {detail.items.map((item) => (
        <li key={item.id} className="asmt-item">
          <div className="asmt-item-head">
            <span className="std-list-number">{item.order_no}</span>
            <strong>{item.hazard}</strong>
          </div>
          <div className="asmt-item-badges">
            <span
              className={`asmt-level asmt-level--${item.initial_risk_level.toLowerCase()}`}
            >
              {LEVEL_LABEL[item.initial_risk_level]}
            </span>
            <span
              className={`asmt-tag ${item.initial_allowable ? "asmt-tag--ok" : "asmt-tag--action"}`}
            >
              {item.initial_allowable ? "허용 가능" : "허용 불가 · 조치 필요"}
            </span>
          </div>
          {item.current_control && (
            <p className="asmt-item-control">
              현재 조치: {item.current_control}
            </p>
          )}
          <p className="asmt-item-measure">→ {item.reduction_measure}</p>
          {(item.responsible_name || item.planned_completion_date) && (
            <p className="asmt-item-plan">
              {item.responsible_name && (
                <span>담당 {item.responsible_name}</span>
              )}
              {item.planned_completion_date && (
                <span>예정 {koDate(item.planned_completion_date)}</span>
              )}
            </p>
          )}
          {!item.initial_allowable && (
            <ActionBlock
              item={item}
              assessmentId={detail.id}
              canRecord={canRecord && detail.status === "APPROVED"}
              criteria={detail.criteria}
            />
          )}
        </li>
      ))}
    </ol>
  );
}

function ActionBlock({
  item,
  assessmentId,
  canRecord,
  criteria,
}: {
  item: AssessmentItemDetail;
  assessmentId: string;
  canRecord: boolean;
  /** 이 평가에 복사된 판단 기준. 조치 후 수준도 같은 기준으로 고른다. */
  criteria: RiskCriteria;
}) {
  const done = Boolean(item.actual_completion_date);
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState(item.actual_action ?? "");
  const [date, setDate] = useState(item.actual_completion_date ?? "");
  const [level, setLevel] = useState<"" | "HIGH" | "MID" | "LOW">(
    item.post_risk_level ?? "",
  );
  const [allowable, setAllowable] = useState<"" | "yes" | "no">(
    item.post_allowable === null ? "" : item.post_allowable ? "yes" : "no",
  );
  const [followUp, setFollowUp] = useState(item.follow_up_measure ?? "");
  // 조치를 적었는데도 허용 불가면 끝난 게 아니다 (고시 제13조).
  const stillOpen = done && item.post_allowable === false;
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      setError(null);
      if (!level || !allowable) {
        setError("조치 후 수준과 허용 여부를 고르세요.");
        return;
      }
      const result = await recordRiskActionAction({
        assessmentId,
        itemId: item.id,
        actualAction: action,
        actualCompletionDate: date,
        postRiskLevel: level,
        postAllowable: allowable === "yes",
        followUpMeasure: followUp,
      });
      if (!result.ok) setError(result.error);
      else setOpen(false);
    });

  return (
    <div className={`asmt-action${done && !stillOpen ? " is-done" : ""}`}>
      <div className="asmt-action-head">
        {stillOpen ? (
          <span className="asmt-action-state asmt-action-state--open">
            조치 뒤에도 허용 불가 · {koDate(item.actual_completion_date)} · 조치
            후 {item.post_risk_level ? LEVEL_LABEL[item.post_risk_level] : ""} ·
            추가 대책 남음
          </span>
        ) : done ? (
          <span className="asmt-action-state">
            <Check size={14} /> 조치 완료 ·{" "}
            {koDate(item.actual_completion_date)} · 조치 후{" "}
            {item.post_risk_level ? LEVEL_LABEL[item.post_risk_level] : ""} ·
            허용 가능
          </span>
        ) : (
          <span className="asmt-action-state asmt-action-state--open">
            조치 기록 없음
          </span>
        )}
        {canRecord && (
          <button
            type="button"
            className="asmt-action-toggle"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {stillOpen ? "추가 조치 적기" : done ? "고치기" : "조치 적기"}
            <ChevronDown size={14} className={open ? "is-flipped" : ""} />
          </button>
        )}
      </div>
      {done && item.actual_action && !open && (
        <p className="asmt-action-text">{item.actual_action}</p>
      )}
      {stillOpen && item.follow_up_measure && !open && (
        <p className="asmt-action-text">추가 대책: {item.follow_up_measure}</p>
      )}
      {open && (
        <div className="asmt-action-form">
          <label className="form-field">
            <span>실제 조치 내용</span>
            <textarea
              rows={2}
              maxLength={1000}
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="무엇을 어떻게 했는지"
            />
          </label>
          <label className="form-field">
            <span>완료일</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <RiskLevelPicker
            label="조치 후 위험성 수준"
            value={level}
            onChange={setLevel}
            criteria={criteria}
            criteriaSnapshot
          />
          <AllowablePicker
            label="조치 후 허용 여부"
            value={allowable}
            onChange={setAllowable}
          />
          {allowable === "no" && (
            <label className="form-field">
              <span>추가 대책 (허용 수준이 될 때까지)</span>
              <textarea
                rows={2}
                maxLength={1000}
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                placeholder="다음에 무엇을 더 할지, 언제까지"
              />
            </label>
          )}
          <FormErrorDialog message={error} nonce={error} />
          <div className="asmt-action-buttons">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setOpen(false)}
            >
              취소
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={save}
              disabled={pending}
            >
              <Save size={14} /> {pending ? "저장 중…" : "조치 저장"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

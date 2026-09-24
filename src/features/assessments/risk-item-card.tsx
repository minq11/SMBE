"use client";

import {
  initialAllowable,
  type RiskCriteria,
} from "@/features/company/risk-criteria";
import { useEffect, useId } from "react";
import { Trash2 } from "lucide-react";
import {
  FloatField,
  FloatSelect,
  FloatTextarea,
} from "@/components/ui/float-field";
import { RiskLevelPicker, RiskVerdict } from "./risk-level-picker";

export type RiskCardValue = {
  hazard: string;
  /** 지금 이미 하고 있는 안전조치. 3단계 판단법 양식의 둘째 칸. */
  currentControl: string;
  level: "" | "HIGH" | "MID" | "LOW";
  allowable: "" | "yes" | "no";
  measure: string;
  responsibleId: string;
  dueDate: string;
};

export type RiskCardMember = { user_id: string; display_name: string };

/**
 * 위험요인 한 장. 표준서 최초평가·평가 회차·지시서 간이평가가 같은 카드를 쓴다.
 *
 * 순서는 현장에서 생각하는 순서이자 3단계 판단법 양식의 순서다: 무엇이 위험한가
 * → 지금 뭘 하고 있나 → 얼마나 → 그대로 둬도 되나 → 어떻게 줄일까. 담당·예정일은 허용 불가일 때만 의미가 있어 접어 둔다.
 * 수준은 한 번 누르면 끝나는 단추(상·중·하)이고, 허용 여부는 수준과 회사 기준에서
 * 자동으로 정해진다 — 손으로 못 바꾼다 (2026-09-24 사장님 결정).
 */
export function RiskItemCard({
  index,
  value,
  members,
  onChange,
  onRemove,
  criteria,
}: {
  index: number;
  value: RiskCardValue;
  members: RiskCardMember[];
  onChange: (next: RiskCardValue) => void;
  /** 없으면 삭제 단추를 두지 않는다 (마지막 한 장). */
  onRemove?: () => void;
  /** 회사의 위험성 판단 기준. 허용 여부를 정하고, 수준 옆 물음표로도 보여 준다. */
  criteria: RiskCriteria;
}) {
  const id = useId();
  const set = <K extends keyof RiskCardValue>(key: K, v: RiskCardValue[K]) =>
    onChange({ ...value, [key]: v });
  const derived: "" | "yes" | "no" = value.level
    ? initialAllowable(criteria, value.level)
      ? "yes"
      : "no"
    : "";
  const needsAction = derived === "no";
  // 옛 초안(손으로 고르던 때)의 값이 기준과 다르면 기준 쪽으로 맞춘다.
  useEffect(() => {
    if (value.allowable !== derived) onChange({ ...value, allowable: derived });
  }, [derived, value, onChange]);

  return (
    <fieldset className="risk-card">
      <legend className="risk-card-legend">
        <span className="std-list-number">{index + 1}</span> 위험요인{" "}
        {index + 1}
      </legend>
      {onRemove && (
        <button
          type="button"
          className="risk-card-remove"
          onClick={onRemove}
          aria-label={`위험요인 ${index + 1} 삭제`}
        >
          <Trash2 size={15} />
        </button>
      )}
      <FloatTextarea
        className="float-field--flush"
        id={id + "-hazard"}
        label="유해·위험요인"
        rows={2}
        maxLength={500}
        value={value.hazard}
        onChange={(e) => set("hazard", e.target.value)}
        hint="예: 절단기 회전날에 손이 닿을 수 있음"
      />
      <FloatTextarea
        className="float-field--flush"
        id={id + "-control"}
        label="현재 안전조치"
        rows={2}
        maxLength={1000}
        value={value.currentControl}
        onChange={(e) => set("currentControl", e.target.value)}
        hint="지금 하고 있는 것. 예: 방호덮개 있음, 2인 1조. 없으면 '없음'"
      />
      <RiskLevelPicker
        value={value.level}
        onChange={(v) =>
          onChange({
            ...value,
            level: v,
            allowable: initialAllowable(criteria, v) ? "yes" : "no",
          })
        }
        criteria={criteria}
      />
      <RiskVerdict criteria={criteria} level={value.level} phase="initial" />
      <FloatTextarea
        className="float-field--flush"
        id={id + "-measure"}
        label="감소대책"
        rows={2}
        maxLength={1000}
        value={value.measure}
        onChange={(e) => set("measure", e.target.value)}
        hint="예: 방호덮개 설치, 절단 시 밀대 사용"
      />
      <details
        className="risk-card-more"
        open={needsAction || Boolean(value.responsibleId || value.dueDate)}
      >
        <summary>담당·예정일 {needsAction ? "(조치 필요)" : "(선택)"}</summary>
        <div className="risk-card-more-grid">
          <FloatSelect
            className="float-field--flush"
            id={id + "-resp"}
            label="조치 담당자"
            value={value.responsibleId}
            onChange={(e) => set("responsibleId", e.target.value)}
          >
            <option value="">선택하세요</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.display_name}
              </option>
            ))}
          </FloatSelect>
          <FloatField
            className="float-field--flush"
            id={id + "-due"}
            label="조치 예정일"
            type="date"
            value={value.dueDate}
            onChange={(e) => set("dueDate", e.target.value)}
          />
        </div>
      </details>
    </fieldset>
  );
}

export const blankRiskCard = (): RiskCardValue => ({
  hazard: "",
  currentControl: "",
  level: "",
  allowable: "",
  measure: "",
  responsibleId: "",
  dueDate: "",
});

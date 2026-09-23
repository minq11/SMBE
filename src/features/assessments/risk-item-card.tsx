"use client";

import type { RiskCriteria } from "@/features/company/risk-criteria";
import { useId } from "react";
import { Trash2 } from "lucide-react";
import { AllowablePicker, RiskLevelPicker } from "./risk-level-picker";

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
 * 선택은 전부 한 번 누르면 끝나는 단추(상·중·하, 허용 가능·불가)다.
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
  /** 회사의 위험성 판단 기준. 수준 옆 물음표로 보여 준다. */
  criteria?: RiskCriteria;
}) {
  const id = useId();
  const set = <K extends keyof RiskCardValue>(key: K, v: RiskCardValue[K]) =>
    onChange({ ...value, [key]: v });
  const needsAction = value.allowable === "no";

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
      <div className="risk-card-field">
        <label htmlFor={id + "-hazard"}>유해·위험요인</label>
        <textarea
          id={id + "-hazard"}
          rows={2}
          maxLength={500}
          value={value.hazard}
          onChange={(e) => set("hazard", e.target.value)}
          placeholder="예: 절단기 회전날에 손이 닿을 수 있음"
        />
      </div>
      <div className="risk-card-field">
        <label htmlFor={id + "-control"}>현재 안전조치</label>
        <textarea
          id={id + "-control"}
          rows={2}
          maxLength={1000}
          value={value.currentControl}
          onChange={(e) => set("currentControl", e.target.value)}
          placeholder="지금 하고 있는 것. 예: 방호덮개 있음, 2인 1조. 없으면 '없음'"
        />
      </div>
      <RiskLevelPicker
        value={value.level}
        onChange={(v) => set("level", v)}
        criteria={criteria}
      />
      <AllowablePicker
        value={value.allowable}
        onChange={(v) => set("allowable", v)}
      />
      <div className="risk-card-field">
        <label htmlFor={id + "-measure"}>감소대책</label>
        <textarea
          id={id + "-measure"}
          rows={2}
          maxLength={1000}
          value={value.measure}
          onChange={(e) => set("measure", e.target.value)}
          placeholder="예: 방호덮개 설치, 절단 시 밀대 사용"
        />
      </div>
      <details
        className="risk-card-more"
        open={needsAction || Boolean(value.responsibleId || value.dueDate)}
      >
        <summary>담당·예정일 {needsAction ? "(조치 필요)" : "(선택)"}</summary>
        <div className="risk-card-more-grid">
          <div className="risk-card-field">
            <label htmlFor={id + "-resp"}>조치 담당자</label>
            <select
              id={id + "-resp"}
              value={value.responsibleId}
              onChange={(e) => set("responsibleId", e.target.value)}
            >
              <option value="">선택하세요</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.display_name}
                </option>
              ))}
            </select>
          </div>
          <div className="risk-card-field">
            <label htmlFor={id + "-due"}>조치 예정일</label>
            <input
              id={id + "-due"}
              type="date"
              value={value.dueDate}
              onChange={(e) => set("dueDate", e.target.value)}
            />
          </div>
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

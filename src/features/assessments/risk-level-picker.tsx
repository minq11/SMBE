"use client";

import { useId } from "react";

/**
 * 위험성 수준(상·중·하)과 허용 여부를 고르는 단추 묶음.
 *
 * 좁은 화면에서 select 는 두 번 누르고 목록을 읽어야 한다. 선택지가 셋·둘뿐이라
 * 한 번에 다 보여 주고 한 번 누르면 끝나는 게 맞다. 속은 라디오라 스크린리더·
 * 키보드·테스트에는 라디오 그룹으로 보인다. 표준서 평가 회차와 지시서 간이평가가
 * 같은 것을 쓴다.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  name,
}: {
  label: string;
  value: T | "";
  options: ReadonlyArray<{
    value: T;
    label: string;
    tone?: "high" | "mid" | "low" | "ok" | "warn";
  }>;
  onChange: (value: T) => void;
  name?: string;
}) {
  const id = useId();
  const groupName = name ?? id;
  return (
    <fieldset className="seg">
      <legend>{label}</legend>
      <div className="seg-row" role="radiogroup" aria-label={label}>
        {options.map((o) => {
          const on = value === o.value;
          return (
            <label
              key={o.value}
              className={`seg-btn${on ? " is-on" : ""}${o.tone ? " seg-btn--" + o.tone : ""}`}
            >
              <input
                type="radio"
                name={groupName}
                value={o.value}
                checked={on}
                onChange={() => onChange(o.value)}
              />
              {o.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export const RISK_LEVEL_OPTIONS = [
  { value: "HIGH", label: "상", tone: "high" },
  { value: "MID", label: "중", tone: "mid" },
  { value: "LOW", label: "하", tone: "low" },
] as const;

export const ALLOWABLE_OPTIONS = [
  { value: "yes", label: "허용 가능", tone: "ok" },
  { value: "no", label: "허용 불가 · 조치 필요", tone: "warn" },
] as const;

export function RiskLevelPicker({
  value,
  onChange,
  label = "위험성 수준",
}: {
  value: "" | "HIGH" | "MID" | "LOW";
  onChange: (v: "HIGH" | "MID" | "LOW") => void;
  label?: string;
}) {
  return (
    <Segmented
      label={label}
      value={value}
      options={RISK_LEVEL_OPTIONS}
      onChange={onChange}
    />
  );
}

export function AllowablePicker({
  value,
  onChange,
  label = "허용 가능 여부",
}: {
  value: "" | "yes" | "no";
  onChange: (v: "yes" | "no") => void;
  label?: string;
}) {
  return (
    <Segmented
      label={label}
      value={value}
      options={ALLOWABLE_OPTIONS}
      onChange={onChange}
    />
  );
}

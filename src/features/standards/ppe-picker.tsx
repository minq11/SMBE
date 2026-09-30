"use client";

import { PPE_OPTIONS } from "./ppe";

/**
 * 보호구 고르기 — 체크박스 칩. 누르는 자리는 칩 전체(44px). 표준서 폼 기본 정보 안.
 */
export function PpePicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (key: string) =>
    onChange(
      value.includes(key) ? value.filter((k) => k !== key) : [...value, key],
    );
  return (
    <fieldset className="ppe-picker">
      <legend>필요 보호구</legend>
      <div className="ppe-chips">
        {PPE_OPTIONS.map(([key, label]) => {
          const on = value.includes(key);
          return (
            <label key={key} className={`ppe-chip${on ? " is-on" : ""}`}>
              <input
                type="checkbox"
                checked={on}
                onChange={() => toggle(key)}
              />
              {label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

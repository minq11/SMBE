"use client";

import { SIZE_BANDS, type SizeBand } from "./data";

export function SizeBandPicker({
  value,
  onChange,
  compact = false,
}: {
  value: SizeBand;
  onChange: (band: SizeBand) => void;
  compact?: boolean;
}) {
  return (
    <fieldset
      className={`band-picker${compact ? " band-picker--compact" : ""}`}
    >
      <legend>인원 규모</legend>
      <div className="band-picker-choices" role="radiogroup" aria-label="인원 규모 선택">
        {SIZE_BANDS.map(({ key, label, note }) => {
          const active = value === key;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={active}
              className={`band-chip${active ? " is-active" : ""}`}
              onClick={() => onChange(key)}
            >
              <strong>{label}</strong>
              {!compact && <small>{note}</small>}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

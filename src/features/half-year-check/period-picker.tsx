"use client";

import { useRouter } from "next/navigation";
import { FloatSelect } from "@/components/ui/float-field";
import { periodLabel, type Half } from "./model";

/** 반기를 고르면 바로 간다 — 조회 단추 없음 (방침·목표의 연도와 같다). */
export function PeriodPicker({
  year,
  half,
  options,
}: {
  year: number;
  half: Half;
  options: Array<{ year: number; half: Half; status?: string }>;
}) {
  const router = useRouter();
  return (
    <FloatSelect
      id="hyc-period"
      label="반기"
      name="period"
      value={`${year}-${half}`}
      onChange={(e) => {
        const [y, h] = e.target.value.split("-");
        router.push(`/company/half-year-check?year=${y}&half=${h}`);
      }}
    >
      {options.map((o) => (
        <option key={`${o.year}-${o.half}`} value={`${o.year}-${o.half}`}>
          {periodLabel(o.year, o.half)}
          {o.status === "CONFIRMED" ? " · 확정" : ""}
        </option>
      ))}
    </FloatSelect>
  );
}

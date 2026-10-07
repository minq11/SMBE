"use client";

import { useRouter } from "next/navigation";
import { FloatSelect } from "@/components/ui/float-field";

/** 연도를 고르면 바로 그 연도로 간다 — "조회" 를 한 번 더 누르지 않는다 (사장님 2026-10-07). */
export function YearPicker({
  year,
  options,
}: {
  year: number;
  options: number[];
}) {
  const router = useRouter();
  return (
    <FloatSelect
      id="policy-year"
      label="연도"
      name="year"
      value={year}
      onChange={(e) =>
        router.push(`/company/safety-policy?year=${e.target.value}`)
      }
    >
      {options.map((y) => (
        <option key={y} value={y}>
          {y}년
        </option>
      ))}
    </FloatSelect>
  );
}

"use client";

import type { ReactNode } from "react";
import { useToast } from "@/components/ui/toast";

/**
 * 예정 회차 카드. 단추가 없어 눌러도 아무 일이 없으면 고장으로 보인다 — 누르면
 * "당일에 열립니다" 를 잠깐 띄운다 (사장님 2026-10-11). 멤버십 잠금 줄과 같은 결.
 */
export function FutureSession({
  workDate,
  className,
  children,
}: {
  workDate: string;
  className: string;
  children: ReactNode;
}) {
  const { show, toast } = useToast(3500, true);
  const tell = () => show(`${workDate} 당일에 열립니다.`);
  return (
    <>
      <li
        className={className}
        role="button"
        tabIndex={0}
        aria-label={`${workDate} 예정 회차 · 당일에 열립니다`}
        onClick={tell}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            tell();
          }
        }}
      >
        {children}
      </li>
      {toast}
    </>
  );
}

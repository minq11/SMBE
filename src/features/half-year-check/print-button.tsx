"use client";
import Link from "next/link";
import { Printer } from "lucide-react";
import { usePaidToast } from "@/components/ui/paid-lock";
import type { Half } from "./model";

export function CheckPrintLink({
  year,
  half,
  paid,
}: {
  year: number;
  half: Half;
  paid: boolean;
}) {
  const { block, toast } = usePaidToast(
    "반기 점검 인쇄는 멤버십에 가입된 회사만 쓸 수 있습니다.",
  );
  return (
    <>
      {paid ? (
        <Link
          className="btn-secondary"
          href={`/company/half-year-check/print?year=${year}&half=${half}`}
        >
          <Printer size={14} /> 인쇄
        </Link>
      ) : (
        <button type="button" className="btn-secondary" onClick={block}>
          <Printer size={14} /> 인쇄
        </button>
      )}
      {toast}
    </>
  );
}

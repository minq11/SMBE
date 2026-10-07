"use client";
import Link from "next/link";
import { Printer } from "lucide-react";
import { usePaidToast } from "@/components/ui/paid-lock";

export function PolicyPrintLink({
  year,
  paid,
}: {
  year: number;
  paid: boolean;
}) {
  const { block, toast } = usePaidToast(
    "방침·목표 인쇄는 유료 요금제에서 씁니다.",
  );
  return (
    <>
      {paid ? (
        <Link
          className="btn-secondary"
          href={`/company/safety-policy/print?year=${year}`}
        >
          <Printer size={14} /> 게시용 인쇄
        </Link>
      ) : (
        <button type="button" className="btn-secondary" onClick={block}>
          <Printer size={14} /> 게시용 인쇄
        </button>
      )}
      {toast}
    </>
  );
}

export function PolicyPrintButton() {
  return (
    <button
      type="button"
      className="btn-primary"
      onClick={() => window.print()}
    >
      <Printer size={14} /> 인쇄 / PDF 저장
    </button>
  );
}

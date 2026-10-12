"use client";
import Link from "next/link";
import { Printer } from "lucide-react";
import { usePaidToast } from "@/components/ui/paid-lock";

export function TrainingPrintLink({ id, paid }: { id: string; paid: boolean }) {
  const { block, toast } = usePaidToast(
    "교육일지 인쇄는 멤버십에 가입된 회사만 쓸 수 있습니다.",
  );
  return (
    <>
      {paid ? (
        <Link className="btn-secondary" href={`/training/${id}/print`}>
          <Printer size={14} /> 교육일지 인쇄
        </Link>
      ) : (
        <button type="button" className="btn-secondary" onClick={block}>
          <Printer size={14} /> 교육일지 인쇄
        </button>
      )}
      {toast}
    </>
  );
}

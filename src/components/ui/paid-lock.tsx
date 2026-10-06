"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { useToast } from "./toast";

/**
 * 유료 기능에 막혔을 때의 토스트. 화면에 "유료 요금제에서 …" 문단을 써 두는
 * 대신, 눌렀을 때 한 줄과 요금제 링크가 잠깐 뜬다 (헌법 5장).
 * `link=false` 는 요금제를 고를 수 없는 사람(작업자 링크 화면)용.
 */
export function usePaidToast(message: string, link = true) {
  const { show, toast } = useToast();
  const block = () =>
    show(
      <>
        {message}
        {link && (
          <>
            {" "}
            <Link href="/billing">요금제 보기</Link>
          </>
        )}
      </>,
    );
  return { block, toast };
}

/** 잠긴 것(지난 기록·사진 첨부)의 자리에 놓는 단추. 누르면 유료 토스트. */
export function PaidLockButton({
  message,
  link = true,
  className,
  icon = true,
  children,
}: {
  message: string;
  link?: boolean;
  className?: string;
  icon?: boolean;
  children: ReactNode;
}) {
  const { block, toast } = usePaidToast(message, link);
  return (
    <>
      <button type="button" className={className} onClick={block}>
        {icon && <Lock size={14} aria-hidden="true" />}
        {children}
      </button>
      {toast}
    </>
  );
}

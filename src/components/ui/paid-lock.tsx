"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { useToast } from "./toast";

/**
 * 멤버십 기능에 막혔을 때의 토스트. 화면에 "멤버십에 가입된 회사만 …" 문단을 써 두는
 * 대신, 눌렀을 때 한 줄과 요금제 링크가 잠깐 뜬다 (헌법 5장).
 * `link=false` 는 요금제를 고를 수 없는 사람(작업자 링크 화면)용.
 */
export function usePaidToast(message: string, link = true, portal = false) {
  const { show, toast } = useToast(4500, portal);
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

/**
 * 잠긴 표의 줄(지시서 목록). 자물쇠만이 아니라 줄 전체가 누르는 자리다 — 좁은 화면에서
 * 줄이 카드가 되므로 카드 어디를 눌러도 안내가 뜬다 (사장님 2026-10-06).
 */
export function PaidLockRow({
  message,
  className,
  children,
}: {
  message: string;
  className?: string;
  children: ReactNode;
}) {
  const { block, toast } = usePaidToast(message, true, true);
  return (
    <>
      <tr
        className={className}
        role="button"
        tabIndex={0}
        aria-label="지난 지시서 · 멤버십 회사만 열람"
        onClick={block}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            block();
          }
        }}
      >
        {children}
      </tr>
      {toast}
    </>
  );
}

/** 잠긴 것(지난 기록·사진 첨부)의 자리에 놓는 단추. 누르면 멤버십 토스트. */
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

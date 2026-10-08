"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { useToast } from "./toast";

/**
 * 이용·관리(요금제) 화면으로 가는 링크. 멤버십 안내가 뜨는 곳은 **모두** 이것을 단다
 * (사장님 2026-10-08) — 안내만 하고 갈 길을 안 주면 어디서 가입하는지 찾아야 한다.
 * 글자와 주소를 한 곳에 둬서 화면마다 달라지지 않게 한다.
 */
export function MembershipLink() {
  return (
    <Link href="/billing" className="membership-link">
      요금제 보기
    </Link>
  );
}

/**
 * 서버가 돌려준 오류 글을 그릴 때 쓴다. 글에 "멤버십" 이 들어 있으면 멤버십 안내이므로
 * 뒤에 링크를 붙인다. 화면에서 미리 막지 못한 경우(쓰는 도중에 요금제가 바뀐 경우 등)
 * 서버의 안내가 링크 없이 뜨는 일을 막는다. "멤버십" 이라는 말은 멤버십 안내에만
 * 쓴다 (헌법 6장).
 */
export function WithMembershipLink({ text }: { text: string }) {
  return (
    <>
      {text}
      {text.includes("멤버십") && (
        <>
          {" "}
          <MembershipLink />
        </>
      )}
    </>
  );
}

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
            <MembershipLink />
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

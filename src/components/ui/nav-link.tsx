"use client";
import Link from "next/link";
import type { ComponentProps } from "react";
import { NavSpinner } from "./nav-spinner";

/**
 * 누르면 도는 링크.
 *
 * 목록에서 한 줄을 고르면 서버가 다음 화면을 만들어 줄 때까지 아무 표시가
 * 없다. 화면을 통째로 덮는 대신 누른 그 줄 안에서 스피너를 돌린다.
 * `NavSpinner` 를 직접 넣는 것과 같지만, 목록처럼 링크가 여러 개인 곳에서
 * 하나를 빠뜨리지 않으려고 컴포넌트로 묶었다.
 */
export function NavLink({ children, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link {...props}>
      {children}
      <NavSpinner />
    </Link>
  );
}

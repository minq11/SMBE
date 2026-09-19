"use client";

import Link from "next/link";
import { Bell, ChevronDown, Menu } from "lucide-react";
import { logoutAction } from "@/features/auth/logout-action";
import { AppIcon } from "@/components/brand/app-icon";
import { usePreview } from "./preview-dialog";

export type Crumb = {
  label: string;
  href?: string;
};

export function Topbar({
  breadcrumb,
  userName,
  isAuthenticated,
  onOpenMobileMenu,
  mobileOpen,
}: {
  breadcrumb: Crumb[];
  userName?: string;
  isAuthenticated: boolean;
  onOpenMobileMenu: () => void;
  mobileOpen: boolean;
}) {
  const preview = usePreview();

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          type="button"
          className="icon-button topbar-mobile"
          aria-label="메뉴 열기"
          aria-expanded={mobileOpen}
          onClick={onOpenMobileMenu}
        >
          <Menu size={19} />
        </button>
        <Link href="/" className="topbar-brand" aria-label="SMBE 홈">
          <AppIcon size={26} />
        </Link>
        {breadcrumb.length > 0 && (
          <nav className="breadcrumb" aria-label="현재 위치">
            {breadcrumb.map((crumb, index) => {
              const isLast = index === breadcrumb.length - 1;
              return (
                <span
                  key={`${crumb.label}-${index}`}
                  className="breadcrumb-item"
                >
                  <span className="breadcrumb-sep" aria-hidden="true">
                    /
                  </span>
                  {isLast || !crumb.href ? (
                    <strong aria-current={isLast ? "page" : undefined}>
                      {crumb.label}
                    </strong>
                  ) : (
                    <Link href={crumb.href}>{crumb.label}</Link>
                  )}
                </span>
              );
            })}
          </nav>
        )}
      </div>

      <div className="topbar-right">
        <span className="topbar-tag" title="현재는 화면 미리보기 상태입니다">
          <span className="topbar-tag-dot" />
          화면 미리보기
        </span>
        <span className="topbar-divider" aria-hidden="true" />
        <button
          type="button"
          className="icon-button"
          aria-label="알림"
          onClick={() => preview("알림")}
        >
          <Bell size={17} />
        </button>
        {isAuthenticated ? (
          <>
            <button
              type="button"
              className="profile"
              onClick={() => preview("내 정보")}
            >
              <span className="avatar" aria-hidden="true">
                {(userName ?? "관").slice(0, 1)}
              </span>
              <span className="profile-name">{userName ?? "관리자"}</span>
              <ChevronDown size={13} />
            </button>
            <form action={logoutAction} className="logout-form">
              <button type="submit" className="logout-button">
                로그아웃
              </button>
            </form>
          </>
        ) : (
          <>
            <Link href="/login" className="logout-button">
              로그인
            </Link>
            <Link href="/login" className="logout-button logout-button--primary">
              무료로 시작
            </Link>
          </>
        )}
      </div>
    </header>
  );
}

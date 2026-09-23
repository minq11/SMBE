"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Bell, ChevronDown, Menu, Wrench } from "lucide-react";
import { logoutAction } from "@/features/auth/logout-action";
import { BrandWordmark } from "@/components/brand/wordmark";
import { usePreview } from "./preview-dialog";
import { navRoot } from "./sidebar";

export type Crumb = {
  label: string;
  href?: string;
};

export function Topbar({
  breadcrumb,
  userName,
  isAuthenticated,
  isOperator,
  onOpenMobileMenu,
  mobileOpen,
  scrolled = false,
}: {
  breadcrumb: Crumb[];
  userName?: string;
  isAuthenticated: boolean;
  isOperator: boolean;
  onOpenMobileMenu: () => void;
  mobileOpen: boolean;
  /** 본문이 스크롤돼 상단바 밑으로 들어갔는가 (좁은 화면에서 그림자) */
  scrolled?: boolean;
}) {
  const preview = usePreview();
  const pathname = usePathname();
  const router = useRouter();
  // 좁은 화면의 왼쪽 자리는 하나다. 구역의 첫 화면이면 ☰, 안쪽 화면이면 ←.
  const { isRoot, parentHref } = navRoot(pathname);
  const goBack = () => {
    if (window.history.length > 1) router.back();
    else router.push(parentHref);
  };

  return (
    <header className={`topbar${scrolled ? " is-scrolled" : ""}`}>
      <div className="topbar-left">
        {isRoot ? (
          <button
            type="button"
            className="icon-button topbar-mobile"
            id="mobile-menu-button"
            aria-controls="mobile-navigation"
            aria-label="메뉴 열기"
            aria-expanded={mobileOpen}
            onClick={onOpenMobileMenu}
          >
            <Menu size={19} />
          </button>
        ) : (
          <button
            type="button"
            className="icon-button topbar-mobile"
            aria-label="뒤로 가기"
            onClick={goBack}
          >
            <ArrowLeft size={19} />
          </button>
        )}
        {/* 좁은 화면에는 사이드바가 접혀 있어 브랜드가 아예 안 보였다.
            아이콘만 두면 무슨 서비스인지 모르므로 워드마크를 그대로 쓴다. */}
        <Link href="/" className="topbar-brand" aria-label="심플안전 홈">
          <BrandWordmark className="topbar-wordmark" />
        </Link>
        {/* 좁은 화면: 제목은 여기 한 줄뿐이다. 본문 머리말의 제목·뒤로가기는
            숨긴다 (globals.css). 넓은 화면에서는 이 h1 이 보이지 않는다. */}
        {breadcrumb.length > 0 && (
          <h1 className="topbar-title">
            {breadcrumb[breadcrumb.length - 1].label}
          </h1>
        )}
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
        <span
          className="topbar-tag"
          title={
            isAuthenticated
              ? "현재 개발 중인 서비스입니다"
              : "현재는 화면 미리보기 상태입니다"
          }
        >
          <span className="topbar-tag-dot" />
          {isAuthenticated ? "개발 중" : "화면 미리보기"}
        </span>
        <span className="topbar-divider" aria-hidden="true" />
        {isOperator && (
          <Link
            href="/admin"
            className="icon-button topbar-operator-link"
            aria-label="운영자 백오피스"
            title="심플안전 운영자 백오피스"
          >
            <Wrench size={17} />
          </Link>
        )}
        {isAuthenticated && (
          <button
            type="button"
            className="icon-button"
            aria-label="알림"
            onClick={() => preview("알림")}
          >
            <Bell size={17} />
          </button>
        )}
        {isAuthenticated ? (
          <>
            <Link
              href="/my-page"
              className="profile"
              aria-label="내 정보 · 마이페이지"
            >
              <span className="avatar" aria-hidden="true">
                {(userName ?? "관").slice(0, 1)}
              </span>
              <span className="profile-name">{userName ?? "관리자"}</span>
              <ChevronDown size={13} />
            </Link>
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
            <Link
              href="/login"
              className="logout-button logout-button--primary"
            >
              무료로 시작
            </Link>
          </>
        )}
      </div>
    </header>
  );
}

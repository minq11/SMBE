"use client";

import { ReactNode, useEffect, useState, useSyncExternalStore } from "react";
import { PreviewDialogProvider } from "./preview-dialog";
import { Sidebar, type NavKey } from "./sidebar";
import { Topbar, type Crumb } from "./topbar";

export type { NavKey, Crumb };

const mobileQuery = "(max-width: 960px)";
function subscribeViewport(callback: () => void) {
  const media = window.matchMedia(mobileQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
const getMobileViewport = () => window.matchMedia(mobileQuery).matches;

export function AppShell({
  active,
  breadcrumb = [],
  companyName,
  userName,
  isAuthenticated,
  isOperator = false,
  tier,
  children,
}: {
  active: NavKey;
  breadcrumb?: Crumb[];
  companyName?: string;
  userName?: string;
  isAuthenticated: boolean;
  isOperator?: boolean;
  tier?: "무료" | "Pro";
  children: ReactNode;
}) {
  return (
    <PreviewDialogProvider>
      <AppShellFrame
        active={active}
        breadcrumb={breadcrumb}
        companyName={companyName}
        userName={userName}
        isAuthenticated={isAuthenticated}
        isOperator={isOperator}
        tier={tier}
      >
        {children}
      </AppShellFrame>
    </PreviewDialogProvider>
  );
}

function AppShellFrame({
  active,
  breadcrumb = [],
  companyName,
  userName,
  isAuthenticated,
  isOperator,
  tier,
  children,
}: {
  active: NavKey;
  breadcrumb?: Crumb[];
  companyName?: string;
  userName?: string;
  isAuthenticated: boolean;
  isOperator?: boolean;
  tier?: "무료" | "Pro";
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMobile = useSyncExternalStore(
    subscribeViewport,
    getMobileViewport,
    () => false,
  );
  const drawerOpen = mobileOpen && isMobile;
  const closeMobile = () => setMobileOpen(false);

  // 사이드바 열림 시 뒤 body 스크롤 잠금 (iOS 안드로이드 공통)
  useEffect(() => {
    if (drawerOpen) {
      document.body.classList.add("sidebar-lock");
      const drawer = document.getElementById("mobile-navigation");
      const opener = document.getElementById("mobile-menu-button");
      const controls = () =>
        Array.from(
          drawer?.querySelectorAll<HTMLElement>(
            'a[href],button:not([disabled]),[tabindex="0"]',
          ) ?? [],
        ).filter((el) => el.getClientRects().length > 0);
      controls()[0]?.focus();
      const onKey = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          event.preventDefault();
          setMobileOpen(false);
        }
        if (event.key !== "Tab") return;
        const items = controls();
        const first = items[0],
          last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      };
      document.addEventListener("keydown", onKey);
      return () => {
        document.body.classList.remove("sidebar-lock");
        document.removeEventListener("keydown", onKey);
        if (opener?.isConnected && window.matchMedia(mobileQuery).matches)
          opener.focus();
      };
    }
  }, [drawerOpen]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        본문 바로가기
      </a>
      {drawerOpen && (
        <button
          type="button"
          className="sidebar-shade"
          aria-label="메뉴 닫기"
          onClick={closeMobile}
        />
      )}
      <Sidebar
        active={active}
        companyName={companyName}
        tier={tier}
        isOpen={drawerOpen}
        isMobile={isMobile}
        onClose={closeMobile}
      />
      <div className="main-shell" inert={drawerOpen}>
        <Topbar
          breadcrumb={breadcrumb}
          userName={userName}
          isAuthenticated={isAuthenticated}
          isOperator={Boolean(isOperator)}
          onOpenMobileMenu={() => setMobileOpen(true)}
          mobileOpen={drawerOpen}
        />
        <main id="main" className="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}

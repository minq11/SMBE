"use client";

import { ReactNode, useState } from "react";
import { PreviewDialogProvider } from "./preview-dialog";
import { Sidebar, type NavKey } from "./sidebar";
import { Topbar, type Crumb } from "./topbar";

export type { NavKey, Crumb };

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
  const closeMobile = () => setMobileOpen(false);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        본문 바로가기
      </a>
      {mobileOpen && (
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
        isOpen={mobileOpen}
        onClose={closeMobile}
      />
      <div className="main-shell">
        <Topbar
          breadcrumb={breadcrumb}
          userName={userName}
          isAuthenticated={isAuthenticated}
          isOperator={Boolean(isOperator)}
          onOpenMobileMenu={() => setMobileOpen(true)}
          mobileOpen={mobileOpen}
        />
        <main id="main" className="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}

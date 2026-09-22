"use client";

import {
  ReactNode,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { usePathname } from "next/navigation";
import { PreviewDialogProvider } from "./preview-dialog";
import { Sidebar, type NavKey } from "./sidebar";
import { Topbar, type Crumb } from "./topbar";
import type { Tier } from "./tier";

export type { NavKey, Crumb, Tier };

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
  tier?: Tier;
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
  tier?: Tier;
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
  // 좁은 화면에서는 문서가 아니라 본문(main)만 스크롤된다 (globals.css 앱 틀).
  // 그러니 화면이 바뀌면 본문을 맨 위로 올리고, 스크롤됐는지를 상단바에 알린다.
  const mainRef = useRef<HTMLElement>(null);
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);
  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    const onScroll = () => setScrolled(main.scrollTop > 4);
    main.addEventListener("scroll", onScroll, { passive: true });
    return () => main.removeEventListener("scroll", onScroll);
  }, []);

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
        isAuthenticated={isAuthenticated}
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
          scrolled={scrolled}
        />
        <main id="main" className="main-content" ref={mainRef}>
          {children}
        </main>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import type { Tier } from "./tier";
import { BrandWordmark } from "@/components/brand/wordmark";
import {
  BookOpen,
  Building2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  FolderOpen,
  HelpCircle,
  Home,
  LogOut,
  Megaphone,
  Settings2,
  ShieldCheck,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { usePreview } from "./preview-dialog";
import { logoutAction } from "@/features/auth/logout-action";

/**
 * 좁은 화면 상단바가 뒤로가기(←)와 메뉴(☰) 중 무엇을 보일지 정하는 규칙.
 * 메뉴에 있는 주소 그 자체면 구역의 첫 화면(☰), 그 아래 주소면 안쪽 화면(←)이고
 * 뒤로 갈 곳은 그 메뉴 주소다. 메뉴에 없는 주소(마이페이지 등)는 홈으로 돌아간다.
 */
export function navRoot(pathname: string): {
  isRoot: boolean;
  parentHref: string;
} {
  const hrefs = NAV.flatMap((n) => [
    ...(n.href ? [n.href] : []),
    ...(n.children ?? []).flatMap((c) => (c.href ? [c.href] : [])),
  ]);
  if (hrefs.includes(pathname)) return { isRoot: true, parentHref: pathname };
  const parent = hrefs
    .filter((h) => h !== "/" && pathname.startsWith(h + "/"))
    .sort((a, b) => b.length - a.length)[0];
  // 어느 메뉴 아래에도 없는 화면(마이페이지 등)은 첫 화면으로 친다 — 돌아갈
  // 상위가 없는데 ← 를 보이면 메뉴로 갈 길이 없어진다.
  if (!parent) return { isRoot: true, parentHref: "/" };
  return { isRoot: false, parentHref: parent };
}

export type NavKey =
  | "home"
  | "orders"
  | "standards"
  | "assessment"
  | "inspection"
  | "meetings"
  | "monitoring"
  | "incident"
  | "company"
  | "billing"
  | "profile"
  | "permits"
  | "locations"
  | "criteria"
  | "notices"
  | "resources";

type NavEntry = {
  key: NavKey;
  title: string;
  icon: LucideIcon;
  href?: string;
  children?: ReadonlyArray<NavEntry>;
};

const NAV: ReadonlyArray<NavEntry> = [
  { key: "home", title: "홈", icon: Home, href: "/" },
  // 회사정보는 홈 바로 아래. 인원·장소·판단 기준은 처음 쓸 때 가장 먼저 만지는 곳이다.
  {
    key: "company",
    title: "회사정보",
    icon: Building2,
    children: [
      {
        key: "company",
        title: "인원관리",
        icon: Building2,
        href: "/company/members",
      },
      {
        key: "locations",
        title: "장소관리",
        icon: Building2,
        href: "/company/locations",
      },
      {
        key: "criteria",
        title: "위험성 판단 기준",
        icon: ShieldCheck,
        href: "/company/criteria",
      },
      { key: "billing", title: "이용·관리", icon: Settings2, href: "/billing" },
    ],
  },
  {
    key: "orders",
    title: "작업지시",
    icon: ClipboardList,
    href: "/work-orders",
  },
  { key: "standards", title: "작업표준서", icon: BookOpen, href: "/standards" },
  { key: "assessment", title: "위험성평가", icon: ShieldCheck },
  {
    key: "inspection",
    title: "안전점검",
    icon: ClipboardCheck,
    children: [
      {
        key: "inspection",
        title: "점검 기록",
        icon: ClipboardCheck,
        href: "/inspections",
      },
      {
        key: "meetings",
        title: "주간 안전점검 회의",
        icon: ClipboardCheck,
        href: "/meetings",
      },
      {
        key: "monitoring",
        title: "점검 모니터링",
        icon: ClipboardCheck,
        href: "/monitoring",
      },
    ],
  },
  { key: "incident", title: "안전사고", icon: TriangleAlert },
  {
    key: "notices",
    title: "통합자료실",
    icon: FolderOpen,
    children: [
      {
        key: "notices",
        title: "공지사항",
        icon: Megaphone,
        href: "/board/notices",
      },
      {
        key: "resources",
        title: "자료실",
        icon: FolderOpen,
        href: "/board/resources",
      },
    ],
  },
  {
    key: "permits",
    title: "위험작업허가",
    icon: ShieldCheck,
    href: "/permits",
  },
];

/**
 * 여러 화면을 묶은 메뉴(안전점검·회사정보)는 접어 둔다. 다 펴 놓으면 좁은
 * 화면에서 목록이 길어져 정작 자주 쓰는 작업지시·표준서가 스크롤 밖으로 밀린다.
 * 단, 지금 보고 있는 화면이 그 안에 있으면 처음부터 펴 둔다 — 내가 어디 있는지
 * 가 접혀 있으면 안 된다.
 */
function NavGroup({
  title,
  icon: Icon,
  items,
  active,
  onClose,
}: {
  title: string;
  icon: LucideIcon;
  items: ReadonlyArray<NavEntry>;
  active: NavKey;
  onClose: () => void;
}) {
  const holdsActive = items.some((item) => item.key === active);
  const [open, setOpen] = useState(holdsActive);
  const id = "nav-group-" + title;

  return (
    <div role="group" aria-label={title} className="nav-group">
      <button
        type="button"
        className="nav-group-label"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon size={17} />
        <span>{title}</span>
        <ChevronDown size={14} className="nav-group-caret" aria-hidden="true" />
      </button>
      <div className="nav-group-children" id={id} hidden={!open}>
        {items.map((child) => (
          <Link
            key={child.key}
            href={child.href!}
            className={`nav-item${child.key === active ? " is-active" : ""}`}
            aria-current={child.key === active ? "page" : undefined}
            onClick={onClose}
          >
            <span>{child.title}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function Sidebar({
  active,
  companyName,
  tier = "무료",
  isOpen,
  isMobile = false,
  isAuthenticated = false,
  onClose,
}: {
  active: NavKey;
  companyName?: string;
  tier?: Tier;
  isOpen: boolean;
  isMobile?: boolean;
  isAuthenticated?: boolean;
  onClose: () => void;
}) {
  const preview = usePreview();

  return (
    <aside
      id="mobile-navigation"
      className={`sidebar${isOpen ? " is-open" : ""}`}
      inert={isMobile && !isOpen}
      role={isMobile && isOpen ? "dialog" : undefined}
      aria-modal={isMobile && isOpen ? true : undefined}
      aria-label="주 메뉴"
    >
      <button type="button" className="sidebar-close" onClick={onClose}>
        메뉴 닫기 ×
      </button>
      <Link href="/" className="brand" aria-label="심플안전 홈">
        <BrandWordmark className="brand-logo" />
      </Link>

      <Link href="/billing" className="workspace-picker" onClick={onClose}>
        <span className="workspace-icon">
          <Building2 size={16} />
        </span>
        <span className="workspace-copy">
          <strong>{companyName ?? "우리 회사"}</strong>
          <small>{tier} 요금제</small>
        </span>
        <ChevronRight size={14} />
      </Link>

      <nav aria-label="주 메뉴" className="nav">
        {NAV.map(({ key, title, icon: Icon, href, children }) => {
          if (children) {
            return (
              <NavGroup
                key={key}
                title={title}
                icon={Icon}
                items={children}
                active={active}
                onClose={onClose}
              />
            );
          }
          const isActive = key === active;
          const className = `nav-item${isActive ? " is-active" : ""}`;
          const content = (
            <>
              <Icon size={17} />
              <span>{title}</span>
              {!isActive && <ChevronRight size={13} />}
            </>
          );
          if (href) {
            return (
              <Link
                key={key}
                href={href}
                className={className}
                aria-current={isActive ? "page" : undefined}
                onClick={onClose}
              >
                {content}
              </Link>
            );
          }
          return (
            <button
              key={key}
              type="button"
              className={className}
              aria-current={isActive ? "page" : undefined}
              onClick={() => {
                onClose();
                if (!isActive) preview(title);
              }}
            >
              {content}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-foot">
        <button
          type="button"
          className="sidebar-support"
          onClick={() => {
            onClose();
            preview("도움말");
          }}
        >
          <HelpCircle size={15} />
          도움말
        </button>
        {isAuthenticated && (
          <form action={logoutAction} className="sidebar-logout">
            <button type="submit">
              <LogOut size={15} />
              로그아웃
            </button>
          </form>
        )}
      </div>
    </aside>
  );
}

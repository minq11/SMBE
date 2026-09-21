"use client";

import Link from "next/link";
import {
  BookOpen,
  Building2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  HelpCircle,
  Home,
  Settings2,
  ShieldCheck,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { usePreview } from "./preview-dialog";

export type NavKey =
  | "home"
  | "orders"
  | "standards"
  | "assessment"
  | "inspection"
  | "incident"
  | "company"
  | "billing"
  | "profile"
  | "permits"
  | "locations";

type NavEntry = {
  key: NavKey;
  title: string;
  icon: LucideIcon;
  href?: string;
  children?: ReadonlyArray<NavEntry>;
};

const NAV: ReadonlyArray<NavEntry> = [
  { key: "home", title: "홈", icon: Home, href: "/" },
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
    href: "/inspections",
  },
  { key: "incident", title: "안전사고", icon: TriangleAlert },
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
      { key: "billing", title: "이용·관리", icon: Settings2, href: "/billing" },
    ],
  },
  {
    key: "permits",
    title: "위험작업허가",
    icon: ShieldCheck,
    href: "/permits",
  },
];

export function Sidebar({
  active,
  companyName,
  tier = "무료",
  isOpen,
  isMobile = false,
  onClose,
}: {
  active: NavKey;
  companyName?: string;
  tier?: "무료" | "Pro";
  isOpen: boolean;
  isMobile?: boolean;
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
      <Link href="/" className="brand" aria-label="SMBE 홈">
        <svg
          className="brand-logo"
          viewBox="320 170 1430 400"
          role="img"
          aria-label="SMBE 로고"
        >
          <image href="/brand/smbe-original.png" width="2073" height="758" />
        </svg>
      </Link>

      <button
        type="button"
        className="workspace-picker"
        onClick={() => {
          onClose();
          preview("회사 선택");
        }}
      >
        <span className="workspace-icon">
          <Building2 size={16} />
        </span>
        <span className="workspace-copy">
          <strong>{companyName ?? "우리 회사"}</strong>
          <small>{tier}티어</small>
        </span>
        <ChevronDown size={14} />
      </button>

      <nav aria-label="주 메뉴" className="nav">
        {NAV.map(({ key, title, icon: Icon, href, children }) => {
          if (children) {
            return (
              <div
                key={key}
                role="group"
                aria-label={title}
                className="nav-group"
              >
                <div className="nav-group-label">
                  <Icon size={17} />
                  <span>{title}</span>
                </div>
                <div className="nav-group-children">
                  {children.map((child) => (
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
      </div>
    </aside>
  );
}

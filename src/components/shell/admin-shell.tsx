import Link from "next/link";
import { ReactNode } from "react";
import { LogOut, Building2, Users } from "lucide-react";
import { AppIcon } from "@/components/brand/app-icon";
import { BackButton } from "./back-button";
import { logoutAction } from "@/features/auth/logout-action";

export type AdminNavKey = "companies" | "users";

export function AdminShell({
  active,
  operatorEmail,
  children,
}: {
  active: AdminNavKey;
  operatorEmail: string;
  children: ReactNode;
}) {
  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <BackButton hideOn={["/admin"]} />
        <Link href="/admin" className="admin-brand" aria-label="심플안전 운영자">
          <AppIcon size={22} />
          <span>
            <strong>심플안전</strong> 운영자
          </span>
        </Link>
        <nav className="admin-nav" aria-label="운영자 메뉴">
          <Link
            href="/admin"
            className={`admin-nav-link${active === "companies" ? " is-active" : ""}`}
          >
            <Building2 size={15} />
            회사
          </Link>
          <Link
            href="/admin/users"
            className={`admin-nav-link${active === "users" ? " is-active" : ""}`}
          >
            <Users size={15} />
            사용자
          </Link>
        </nav>
        <div className="admin-user">
          <span className="admin-user-email">{operatorEmail}</span>
          <Link href="/" className="admin-return-link">
            일반 화면
          </Link>
          <form action={logoutAction}>
            <button type="submit" className="admin-logout" aria-label="로그아웃">
              <LogOut size={15} />
            </button>
          </form>
        </div>
      </header>
      <main className="admin-main">{children}</main>
    </div>
  );
}

import { AppShell } from "@/components/shell/app-shell";
import { tierOf } from "@/components/shell/tier";
import { isCurrentUserOperator } from "@/server/operator";
import type { CurrentSession } from "@/server/session";
export async function OrderShell({
  session,
  title,
  children,
  active = "orders",
}: {
  session: CurrentSession;
  title: string;
  children: React.ReactNode;
  active?: "orders" | "inspection" | "locations" | "criteria";
}) {
  return (
    <AppShell
      active={active}
      companyName={session.membership?.company_name}
      tier={tierOf(session.membership)}
      userName={session.user.displayName ?? undefined}
      isAuthenticated
      isOperator={await isCurrentUserOperator()}
      breadcrumb={[
        active === "locations" || active === "criteria"
          ? { label: "회사정보", href: "/company/members" }
          : { label: "작업지시", href: "/work-orders" },
        { label: title },
      ]}
    >
      {children}
    </AppShell>
  );
}

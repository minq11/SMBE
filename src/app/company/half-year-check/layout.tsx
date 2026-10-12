import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { tierOf } from "@/components/shell/tier";
import { workSession } from "@/server/work-orders";
import { isCurrentUserOperator } from "@/server/operator";
import "@/features/safety-policy/policy.css";
import "@/features/half-year-check/check.css";

export const metadata = { title: "반기 점검 · 심플안전" };

export default async function HalfYearCheckLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { session } = await workSession("/company/half-year-check", true);
  return (
    <AppShell
      active="halfYearCheck"
      breadcrumb={[{ label: "기준정보" }, { label: "반기 점검" }]}
      companyName={session.membership?.company_name}
      tier={tierOf(session.membership)}
      userName={session.user.displayName ?? undefined}
      isAuthenticated
      isOperator={await isCurrentUserOperator()}
    >
      {children}
    </AppShell>
  );
}

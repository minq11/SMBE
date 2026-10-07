import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { tierOf } from "@/components/shell/tier";
import { workSession } from "@/server/work-orders";
import { isCurrentUserOperator } from "@/server/operator";
import "@/features/safety-policy/policy.css";

export const metadata = { title: "안전보건 방침·목표 · 심플안전" };

export default async function PolicyLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { session } = await workSession("/company/safety-policy");
  return (
    <AppShell
      active="safetyPolicy"
      breadcrumb={[{ label: "기준정보" }, { label: "안전보건 방침·목표" }]}
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

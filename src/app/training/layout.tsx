import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { tierOf } from "@/components/shell/tier";
import { workSession } from "@/server/work-orders";
import { isCurrentUserOperator } from "@/server/operator";
import "@/features/assessments/assessments.css";
import "@/features/safety-policy/policy.css";
import "@/features/training/training.css";

export const metadata = { title: "안전보건교육 · 심플안전" };

export default async function TrainingLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { session } = await workSession("/training", true);
  return (
    <AppShell
      active="training"
      breadcrumb={[{ label: "안전보건교육" }]}
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

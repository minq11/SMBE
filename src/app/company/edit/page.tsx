import { redirect } from "next/navigation";
import { withTransaction } from "@/server/db";
import { workSession } from "@/server/work-orders";
import { readCompanyInfo } from "@/server/company-settings";
import { isCurrentUserOperator } from "@/server/operator";
import { AppShell } from "@/components/shell/app-shell";
import { tierOf } from "@/components/shell/tier";
import { PageHeader } from "@/components/ui/page-header";
import { CompanyInfoForm } from "@/features/company/company-info-form";

export const metadata = { title: "회사 정보 수정 · 심플안전" };

/** 회사 정보 수정. 관리감독자만 — 저장하면 회사 정보 화면으로 돌아간다. */
export default async function CompanyEditPage() {
  const { session, actor } = await workSession("/company/edit", true);
  if (session.membership!.role !== "MANAGER_SUPERVISOR") redirect("/company");
  const [info, isOperator] = await Promise.all([
    withTransaction((c) => readCompanyInfo(c, actor.companyId)),
    isCurrentUserOperator(),
  ]);
  return (
    <AppShell
      active="companyInfo"
      breadcrumb={[
        { label: "회사 정보", href: "/company" },
        { label: "회사 정보 수정" },
      ]}
      companyName={info.name}
      tier={tierOf(session.membership)}
      userName={session.user.displayName ?? undefined}
      isAuthenticated
      isOperator={isOperator}
    >
      <PageHeader title="회사 정보 수정" />
      <CompanyInfoForm info={info} />
    </AppShell>
  );
}

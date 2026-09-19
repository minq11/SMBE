import { AdminShell } from "@/components/shell/admin-shell";
import { PageHeader } from "@/components/ui/page-header";
import { requireOperator } from "@/server/operator";
import { listCompanies } from "@/server/admin";
import { CompaniesView } from "@/features/admin/companies-view";

export const metadata = { title: "회사 목록 · SMBE 운영자" };

export default async function AdminCompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const operator = await requireOperator();
  const { q } = await searchParams;
  const search = q?.trim() ?? "";
  const companies = await listCompanies({ search });

  return (
    <AdminShell active="companies" operatorEmail={operator.email}>
      <PageHeader
        title="회사 목록"
        description={`가입 · 이용 중인 회사를 관리합니다. 총 ${companies.length}건.`}
      />
      <CompaniesView companies={companies} initialSearch={search} />
    </AdminShell>
  );
}

import { notFound } from "next/navigation";
import { AdminShell } from "@/components/shell/admin-shell";
import { requireOperator } from "@/server/operator";
import { getCompanyDetail } from "@/server/admin";
import { CompanyDetailView } from "@/features/admin/company-detail-view";

export const metadata = { title: "회사 상세 · 심플안전 운영자" };

export default async function AdminCompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const operator = await requireOperator();
  const { id } = await params;
  const company = await getCompanyDetail(id);
  if (!company) notFound();

  return (
    <AdminShell active="companies" operatorEmail={operator.email}>
      <CompanyDetailView company={company} />
    </AdminShell>
  );
}

import { AdminShell } from "@/components/shell/admin-shell";
import { PageHeader } from "@/components/ui/page-header";
import { requireOperator } from "@/server/operator";
import { listUsers } from "@/server/admin";
import { UsersView } from "@/features/admin/users-view";

export const metadata = { title: "사용자 검색 · 심플안전 운영자" };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const operator = await requireOperator();
  const { q } = await searchParams;
  const search = q?.trim() ?? "";
  const users = await listUsers({ search, limit: 200 });

  return (
    <AdminShell active="users" operatorEmail={operator.email}>
      <PageHeader
        title="사용자 검색"
        description={`전체 사용자 · 소속 · 역할을 조회합니다. 총 ${users.length}건 (최대 200).`}
      />
      <UsersView users={users} initialSearch={search} />
    </AdminShell>
  );
}

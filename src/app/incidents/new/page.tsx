import { withTransaction } from "@/server/db";
import {
  listLocationSuggestions,
  listOrdersForCopy,
  orderMembers,
  workSession,
} from "@/server/work-orders";
import { AppShell } from "@/components/shell/app-shell";
import { tierOf } from "@/components/shell/tier";
import { isCurrentUserOperator } from "@/server/operator";
import { PageHeader } from "@/components/ui/page-header";
import { IncidentForm } from "@/features/incidents/incident-form";
import { scpaAppliesTo } from "@/features/incidents/model";
import "@/features/work-orders/work-orders.css";
import "@/features/incidents/incidents.css";

export const metadata = { title: "사고 등록 · 심플안전" };

export default async function NewIncidentPage() {
  const { session, actor } = await workSession("/incidents/new", true);
  const [members, locations, orders, isOperator, band] = await Promise.all([
    orderMembers(actor),
    listLocationSuggestions(actor.companyId),
    listOrdersForCopy(actor),
    isCurrentUserOperator(),
    withTransaction(async (c) => {
      const { rows } = await c.query<{ band: string | null }>(
        "SELECT current_employee_size_band::text AS band FROM companies WHERE id=$1",
        [actor.companyId],
      );
      return rows[0]?.band ?? null;
    }),
  ]);

  return (
    <AppShell
      active="incident"
      breadcrumb={[
        { label: "안전사고", href: "/incidents" },
        { label: "사고 등록" },
      ]}
      companyName={session.membership?.company_name}
      tier={tierOf(session.membership)}
      userName={session.user.displayName ?? undefined}
      isAuthenticated
      isOperator={isOperator}
    >
      <PageHeader
        title="사고 등록"
        description="아차사고도 적으세요. 저장하면 등급이 정해지고 해야 할 일이 기한과 함께 생깁니다."
      />
      <IncidentForm
        members={members}
        locations={locations}
        orders={orders}
        scpa={scpaAppliesTo(band)}
      />
    </AppShell>
  );
}

import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { withTransaction } from "@/server/db";
import {
  listLocationSuggestions,
  listOrdersForCopy,
  orderMembers,
  workSession,
} from "@/server/work-orders";
import { readIncident } from "@/server/incidents";
import { AppShell } from "@/components/shell/app-shell";
import { tierOf } from "@/components/shell/tier";
import { isCurrentUserOperator } from "@/server/operator";
import { PageHeader } from "@/components/ui/page-header";
import { IncidentForm } from "@/features/incidents/incident-form";
import {
  IncidentError,
  incidentTitle,
  scpaAppliesTo,
} from "@/features/incidents/model";
import "@/features/work-orders/work-orders.css";
import "@/features/incidents/incidents.css";

export const metadata = { title: "사고 고치기 · 심플안전" };

export default async function EditIncidentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { session, actor } = await workSession(`/incidents/${id}/edit`, true);
  const detail = await withTransaction((c) => readIncident(c, actor, id)).catch(
    (error) => {
      if (error instanceof IncidentError) return null;
      throw error;
    },
  );
  if (!detail) notFound();
  // 종결된 사고는 고치지 않는다. 먼저 다시 연다.
  if (detail.status === "CLOSED") redirect(`/incidents/${id}`);
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
        { label: incidentTitle(detail), href: `/incidents/${id}` },
        { label: "고치기" },
      ]}
      companyName={session.membership?.company_name}
      tier={tierOf(session.membership)}
      userName={session.user.displayName ?? undefined}
      isAuthenticated
      isOperator={isOperator}
    >
      <PageHeader
        title="사고 고치기"
        description="고치면 등급과 할 일이 다시 정해집니다. 끝낸 할 일은 남습니다."
      />
      <IncidentForm
        initial={detail}
        members={members}
        locations={locations}
        orders={orders}
        scpa={scpaAppliesTo(band)}
      />
    </AppShell>
  );
}

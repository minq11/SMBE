import { notFound } from "next/navigation";
import { z } from "zod";
import { withTransaction } from "@/server/db";
import { workSession } from "@/server/work-orders";
import { readIncident } from "@/server/incidents";
import { AppShell } from "@/components/shell/app-shell";
import { tierOf } from "@/components/shell/tier";
import { isCurrentUserOperator } from "@/server/operator";
import { PageHeader } from "@/components/ui/page-header";
import {
  SurveyPrintButton,
  SurveySheet,
} from "@/features/incidents/survey-sheet";
import { IncidentError, incidentTitle } from "@/features/incidents/model";
import { seoulToday } from "@/features/work-orders/model";
import "@/features/work-orders/work-orders.css";
import "@/features/incidents/incidents.css";

export const metadata = { title: "산업재해조사표 · 심플안전" };

/**
 * 산업재해조사표 (별지 30호). 화면에서 채워진 칸을 확인하고 인쇄·PDF 로 낸다 (멤버십).
 * 기록에 없는 칸은 비워 두어 사장님이 마저 적는다.
 */
export default async function SurveyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { session, actor } = await workSession(`/incidents/${id}/survey`, true);
  const detail = await withTransaction((c) => readIncident(c, actor, id)).catch(
    (error) => {
      if (error instanceof IncidentError) return null;
      throw error;
    },
  );
  if (!detail) notFound();
  const [company, isOperator] = await Promise.all([
    withTransaction(async (c) => {
      const { rows } = await c.query<{
        name: string;
        business_type: string | null;
        headcount: number;
      }>(
        "SELECT name, business_type, active_headcount AS headcount FROM companies WHERE id=$1",
        [actor.companyId],
      );
      return rows[0];
    }),
    isCurrentUserOperator(),
  ]);
  const paid = session.membership!.pro_state !== "FREE";
  const title = incidentTitle(detail);

  return (
    <AppShell
      active="incident"
      breadcrumb={[
        { label: "안전사고", href: "/incidents" },
        { label: title, href: `/incidents/${id}` },
        { label: "산업재해조사표" },
      ]}
      companyName={session.membership?.company_name}
      tier={tierOf(session.membership)}
      userName={session.user.displayName ?? undefined}
      isAuthenticated
      isOperator={isOperator}
    >
      <div className="wo-no-print">
        <PageHeader
          title="산업재해조사표"
          description="우리 기록으로 채운 칸을 확인하세요. 비어 있는 칸(사업자등록번호·소재지·주민등록번호·근로자대표 확인)은 출력해서 적습니다."
          actions={<SurveyPrintButton allowed={paid} />}
        />
      </div>
      <SurveySheet
        incident={detail}
        company={company}
        printedAt={seoulToday()}
      />
    </AppShell>
  );
}

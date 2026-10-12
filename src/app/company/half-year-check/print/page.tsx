import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { workSession } from "@/server/work-orders";
import { withTransaction } from "@/server/db";
import { readHalfYearCheck } from "@/server/half-year-check";
import { parsePeriod } from "@/features/half-year-check/model";
import { HalfYearDocument } from "@/features/half-year-check/document";
import { PolicyPrintButton } from "@/features/safety-policy/print-button";
import { seoulToday } from "@/features/work-orders/model";

export default async function HalfYearCheckPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; half?: string }>;
}) {
  const params = await searchParams;
  const period = parsePeriod(params.year, params.half, seoulToday());
  if (!period) notFound();
  const { session, actor } = await workSession(
    `/company/half-year-check/print?year=${period.year}&half=${period.half}`,
    true,
  );
  const back = `/company/half-year-check?year=${period.year}&half=${period.half}`;
  if (session.membership?.pro_state === "FREE") redirect(back);
  const check = await withTransaction((c) =>
    readHalfYearCheck(c, actor, period.year, period.half),
  );
  if (check.status !== "CONFIRMED") redirect(back);
  return (
    <div className="policy-print-page">
      <PageHeader title="인쇄" actions={<PolicyPrintButton />} />
      <HalfYearDocument
        check={check}
        companyName={session.membership!.company_name}
      />
    </div>
  );
}

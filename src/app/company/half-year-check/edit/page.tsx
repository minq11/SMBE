import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { workSession } from "@/server/work-orders";
import { withTransaction } from "@/server/db";
import { readHalfYearCheck } from "@/server/half-year-check";
import { parsePeriod, periodLabel } from "@/features/half-year-check/model";
import { HalfYearCheckForm } from "@/features/half-year-check/form";
import { seoulToday } from "@/features/work-orders/model";

export default async function HalfYearCheckEditPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; half?: string }>;
}) {
  const params = await searchParams;
  const period = parsePeriod(params.year, params.half, seoulToday());
  if (!period) notFound();
  const { actor } = await workSession(
    `/company/half-year-check/edit?year=${period.year}&half=${period.half}`,
    true,
  );
  const check = await withTransaction((c) =>
    readHalfYearCheck(c, actor, period.year, period.half),
  );
  // 확정된 점검은 고칠 수 없다 — 보기 화면으로.
  if (check.status === "CONFIRMED")
    redirect(
      `/company/half-year-check?year=${period.year}&half=${period.half}`,
    );
  return (
    <>
      <PageHeader
        title={`${periodLabel(period.year, period.half)} 점검 작성`}
      />
      <HalfYearCheckForm
        key={`${period.year}-${period.half}-${check.updatedAt ?? ""}`}
        check={check}
      />
    </>
  );
}

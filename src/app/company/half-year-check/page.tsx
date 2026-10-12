import Link from "next/link";
import { notFound } from "next/navigation";
import { PenLine, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { workSession } from "@/server/work-orders";
import { withTransaction } from "@/server/db";
import {
  listHalfYearPeriods,
  readHalfYearCheck,
} from "@/server/half-year-check";
import {
  halfOf,
  parsePeriod,
  type Half,
} from "@/features/half-year-check/model";
import { HalfYearDocument } from "@/features/half-year-check/document";
import { PeriodPicker } from "@/features/half-year-check/period-picker";
import { CheckPrintLink } from "@/features/half-year-check/print-button";
import { seoulToday } from "@/features/work-orders/model";

export default async function HalfYearCheckPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; half?: string }>;
}) {
  const today = seoulToday();
  const params = await searchParams;
  const period = parsePeriod(params.year, params.half, today);
  if (!period) notFound();
  const { session, actor } = await workSession(
    "/company/half-year-check",
    true,
  );
  const { check, periods } = await withTransaction(async (c) => ({
    check: await readHalfYearCheck(c, actor, period.year, period.half),
    periods: await listHalfYearPeriods(c, actor),
  }));
  // 고를 수 있는 반기: 지금 반기, 바로 앞 반기, 기록이 있는 반기. 앞으로 올 반기는 없다.
  const current = halfOf(today);
  const previous: { year: number; half: Half } =
    current.half === 1
      ? { year: current.year - 1, half: 2 }
      : { year: current.year, half: 1 };
  const byKey = new Map<
    string,
    { year: number; half: Half; status?: string }
  >();
  for (const o of [current, previous, period, ...periods])
    byKey.set(`${o.year}-${o.half}`, {
      ...(byKey.get(`${o.year}-${o.half}`) ?? {}),
      ...o,
    });
  const options = [...byKey.values()].sort(
    (a, b) => b.year - a.year || b.half - a.half,
  );
  const confirmed = check.status === "CONFIRMED";
  return (
    <>
      <PageHeader
        title="경영책임자 반기 점검"
        actions={
          <>
            {confirmed && (
              <CheckPrintLink
                year={period.year}
                half={period.half}
                paid={session.membership?.pro_state !== "FREE"}
              />
            )}
            {!confirmed && (
              <Link
                className="btn-primary"
                href={`/company/half-year-check/edit?year=${period.year}&half=${period.half}`}
              >
                {check.updatedAt ? <PenLine size={14} /> : <Plus size={14} />}
                {check.updatedAt ? "이어서 작성" : "점검 작성"}
              </Link>
            )}
          </>
        }
      />
      <div className="policy-year-form">
        <PeriodPicker year={period.year} half={period.half} options={options} />
      </div>
      <HalfYearDocument
        check={check}
        companyName={session.membership!.company_name}
      />
    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { PenLine, Plus, ArrowRight, Search } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { FloatSelect } from "@/components/ui/float-field";
import { workSession } from "@/server/work-orders";
import { withTransaction } from "@/server/db";
import { readSafetyPolicy, safetyPolicyYears } from "@/server/safety-policy";
import { selectedYear } from "@/features/safety-policy/model";
import { PolicyDocument } from "@/features/safety-policy/document";
import { PolicyPrintLink } from "@/features/safety-policy/print-button";
import { seoulToday } from "@/features/work-orders/model";

export default async function PolicyPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const current = Number(seoulToday().slice(0, 4));
  const year = selectedYear((await searchParams).year, current);
  if (year === null) notFound();
  const { session, actor } = await workSession("/company/safety-policy");
  const { policy, years } = await withTransaction(async (c) => ({
    policy: await readSafetyPolicy(c, actor, year),
    years: await safetyPolicyYears(c, actor),
  }));
  const manager = session.membership?.role !== "WORKER";
  const options = [...new Set([current, current + 1, year, ...years])].sort(
    (a, b) => b - a,
  );
  return (
    <>
      <PageHeader
        title="안전보건 방침·목표"
        actions={
          <>
            {policy && (
              <PolicyPrintLink
                year={year}
                paid={session.membership?.pro_state !== "FREE"}
              />
            )}
            {manager && (
              <Link
                className="btn-primary"
                href={`/company/safety-policy/edit?year=${year}`}
              >
                {policy ? <PenLine size={14} /> : <Plus size={14} />}
                {policy ? "수정" : `${year}년 작성`}
              </Link>
            )}
          </>
        }
      />
      <form className="policy-year-form" action="/company/safety-policy">
        <FloatSelect
          id="policy-year"
          label="연도"
          name="year"
          defaultValue={year}
        >
          {options.map((y) => (
            <option key={y} value={y}>
              {y}년
            </option>
          ))}
        </FloatSelect>
        <button className="btn-secondary" type="submit">
          <Search size={14} /> 조회
        </button>
        {year !== current && (
          <Link className="go-link" href="/company/safety-policy">
            올해로 <ArrowRight size={14} />
          </Link>
        )}
      </form>
      {policy ? (
        <PolicyDocument
          policy={policy}
          companyName={session.membership!.company_name}
        />
      ) : (
        <section className="policy-card">
          <p>{year}년 방침·목표가 아직 없습니다.</p>
        </section>
      )}
    </>
  );
}

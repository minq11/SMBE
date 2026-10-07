import { notFound, redirect } from "next/navigation";
import { workSession } from "@/server/work-orders";
import { withTransaction } from "@/server/db";
import { readSafetyPolicy } from "@/server/safety-policy";
import { selectedYear } from "@/features/safety-policy/model";
import { PolicyDocument } from "@/features/safety-policy/document";
import { PolicyPrintButton } from "@/features/safety-policy/print-button";
import { PageHeader } from "@/components/ui/page-header";
import { seoulToday } from "@/features/work-orders/model";

export default async function PolicyPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const year = selectedYear(
    (await searchParams).year,
    Number(seoulToday().slice(0, 4)),
  );
  if (year === null) notFound();
  const { session, actor } = await workSession(
    `/company/safety-policy/print?year=${year}`,
  );
  if (session.membership?.pro_state === "FREE")
    redirect(`/company/safety-policy?year=${year}`);
  const policy = await withTransaction((c) =>
    readSafetyPolicy(c, actor, year, true),
  );
  if (!policy) notFound();
  return (
    <div className="policy-print-page">
      <PageHeader title="게시용 인쇄" actions={<PolicyPrintButton />} />
      <PolicyDocument
        policy={policy}
        companyName={session.membership!.company_name}
      />
    </div>
  );
}

import { notFound } from "next/navigation";
import { workSession } from "@/server/work-orders";
import { withTransaction } from "@/server/db";
import { readSafetyPolicy } from "@/server/safety-policy";
import { DEFAULT_POLICY, selectedYear } from "@/features/safety-policy/model";
import { PolicyForm } from "@/features/safety-policy/form";
import { PageHeader } from "@/components/ui/page-header";
import { seoulToday } from "@/features/work-orders/model";

export default async function PolicyEditPage({
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
    `/company/safety-policy/edit?year=${year}`,
    true,
  );
  const { existing, previous } = await withTransaction(async (c) => ({
    existing: await readSafetyPolicy(c, actor, year),
    previous: year > 2000 ? await readSafetyPolicy(c, actor, year - 1) : null,
  }));
  return (
    <>
      <PageHeader title={`${year}년 방침·목표 작성`} />
      <PolicyForm
        key={`${year}-${existing?.revision ?? 0}`}
        initial={
          existing ?? {
            year,
            revision: 0,
            policy: DEFAULT_POLICY,
            goals: "",
            representative: "",
            establishedOn: seoulToday(),
          }
        }
        previous={existing ? null : previous}
        storageKey={`smbe.policy.${actor.companyId}.${session.user.id}.${year}`}
      />
    </>
  );
}

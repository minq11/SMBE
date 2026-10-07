import type { PoolClient } from "@neondatabase/serverless";
import { memberAccess, type Actor } from "./work-order-service";
import { lockCompany } from "./membership-mutations";
import { WorkOrderError } from "../features/work-orders/model";
import {
  policyInputSchema,
  yearSchema,
  type SafetyPolicy,
} from "../features/safety-policy/model";

export async function readSafetyPolicy(
  client: PoolClient,
  actor: Actor,
  year: number,
  print = false,
) {
  const access = await memberAccess(client, actor);
  if (print && access.pro_state === "FREE")
    throw new WorkOrderError("방침·목표 인쇄는 유료 요금제에서 씁니다.");
  if (!yearSchema.safeParse(year).success)
    throw new WorkOrderError("연도를 확인하세요.");
  const { rows } = await client.query<SafetyPolicy>(
    `SELECT year, revision, policy, goals, representative,
      established_on::text AS "establishedOn", updated_at::text AS "updatedAt",
      updated_by::text AS "updatedBy" FROM company_safety_policies
      WHERE company_id=$1 AND year=$2`,
    [actor.companyId, year],
  );
  return rows[0] ?? null;
}

export async function safetyPolicyYears(client: PoolClient, actor: Actor) {
  await memberAccess(client, actor);
  return (
    await client.query<{ year: number }>(
      "SELECT year FROM company_safety_policies WHERE company_id=$1 ORDER BY year DESC",
      [actor.companyId],
    )
  ).rows.map((row) => row.year);
}

export async function saveSafetyPolicy(
  client: PoolClient,
  actor: Actor,
  raw: unknown,
) {
  const parsed = policyInputSchema.safeParse(raw);
  if (!parsed.success)
    throw new WorkOrderError(
      parsed.error.issues[0]?.message ?? "입력값을 확인하세요.",
    );
  const input = parsed.data;
  // 권한 변경과 저장을 같은 회사 잠금으로 직렬화하고, 오래 열린 폼의 덮어쓰기를 막는다.
  await lockCompany(client, actor.companyId);
  await memberAccess(client, actor, true);
  const previous = await readSafetyPolicy(client, actor, input.year);
  if ((previous?.revision ?? 0) !== input.revision)
    throw new WorkOrderError(
      "다른 화면에서 문서가 변경됐습니다. 다시 열어 확인하세요.",
    );
  await client.query(
    `INSERT INTO company_safety_policies
      (company_id, year, policy, goals, representative, established_on, updated_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (company_id,year) DO UPDATE SET policy=EXCLUDED.policy,
        goals=EXCLUDED.goals, representative=EXCLUDED.representative,
        established_on=EXCLUDED.established_on, updated_by=EXCLUDED.updated_by,
        updated_at=clock_timestamp(), revision=company_safety_policies.revision+1`,
    [
      actor.companyId,
      input.year,
      input.policy,
      input.goals,
      input.representative,
      input.establishedOn,
      actor.userId,
    ],
  );
}

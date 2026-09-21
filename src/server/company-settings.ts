import type { PoolClient } from "@neondatabase/serverless";
import { z } from "zod";
import { WorkOrderError } from "../features/work-orders/model";

/**
 * 회사의 위험성 수준 판단 기준.
 *
 * 위험성평가는 사업주가 기준을 정해 두고 그에 따라 실시하는 구조이므로 원본은 회사에
 * 하나만 둔다. 평가는 생성 시점에 이 값을 복사해 `criteria_snapshot` 으로 보관하므로,
 * 회사가 나중에 기준을 바꿔도 이미 승인된 평가는 그때의 기준으로 남는다.
 *
 * 등급 수(상·중·하)는 스키마에 고정돼 있다. 회사가 정하는 것은 단계 수가 아니라
 * 각 단계의 정의와 허용 가능 경계다.
 *
 * 다른 서비스 모듈과 같이 client 를 주입받는다. `./db` 를 직접 물면 그쪽의
 * server-only 가드까지 딸려와 회귀 테스트가 이 모듈을 import 할 수 없게 된다.
 */

export const MAX_CRITERIA_LENGTH = 4000;

const criteriaSchema = z
  .string()
  .trim()
  .min(1, "판단 기준을 입력하세요.")
  .max(MAX_CRITERIA_LENGTH, "판단 기준이 너무 깁니다.");

export async function readRiskCriteria(
  client: PoolClient,
  companyId: string,
): Promise<string> {
  const { rows } = await client.query<{ risk_criteria: string }>(
    "SELECT risk_criteria FROM companies WHERE id = $1",
    [companyId],
  );
  if (!rows[0]) throw new WorkOrderError("회사를 찾을 수 없습니다.");
  return rows[0].risk_criteria;
}

export async function updateRiskCriteria(
  client: PoolClient,
  companyId: string,
  raw: unknown,
): Promise<void> {
  const parsed = criteriaSchema.safeParse(raw);
  if (!parsed.success)
    throw new WorkOrderError(
      parsed.error.issues[0]?.message ?? "판단 기준을 확인하세요.",
    );
  await client.query("UPDATE companies SET risk_criteria = $2 WHERE id = $1", [
    companyId,
    parsed.data,
  ]);
}

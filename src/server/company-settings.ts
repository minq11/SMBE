import type { PoolClient } from "@neondatabase/serverless";
import { WorkOrderError } from "../features/work-orders/model";
import {
  RISK_LEVELS,
  riskCriteriaSchema,
  type RiskCriteria,
} from "../features/company/risk-criteria";

/**
 * 회사의 위험성 수준 판단 기준.
 *
 * 위험성평가는 사업주가 기준을 정해 두고 그에 따라 실시하는 구조이므로 원본은 회사에
 * 하나만 둔다 (`company_risk_levels`, 상·중·하 세 행). 평가는 생성 시점에 이 세 행을
 * 복사해 `criteria_snapshot` 으로 보관하므로, 회사가 나중에 기준을 바꿔도 이미 승인된
 * 평가는 그때의 기준으로 남는다.
 *
 * 세 행은 회사가 생길 때 DB 트리거가 기본값으로 만든다 (0020). 여기서는 고치기만 한다.
 *
 * 다른 서비스 모듈과 같이 client 를 주입받는다. `./db` 를 직접 물면 그쪽의
 * server-only 가드까지 딸려와 회귀 테스트가 이 모듈을 import 할 수 없게 된다.
 */

export async function readRiskCriteria(
  client: PoolClient,
  companyId: string,
): Promise<RiskCriteria> {
  const { rows } = await client.query<RiskCriteria[number]>(
    `SELECT level, description, acceptance FROM company_risk_levels
      WHERE company_id = $1
      ORDER BY array_position($2::text[], level)`,
    [companyId, RISK_LEVELS],
  );
  if (rows.length !== RISK_LEVELS.length)
    throw new WorkOrderError("회사의 위험성 판단 기준을 찾을 수 없습니다.");
  return rows;
}

export async function updateRiskCriteria(
  client: PoolClient,
  companyId: string,
  raw: unknown,
): Promise<void> {
  const parsed = riskCriteriaSchema.safeParse(raw);
  if (!parsed.success)
    throw new WorkOrderError(
      parsed.error.issues[0]?.message ?? "판단 기준을 확인하세요.",
    );
  for (const row of parsed.data) {
    const { rowCount } = await client.query(
      `UPDATE company_risk_levels SET description = $3, acceptance = $4
        WHERE company_id = $1 AND level = $2`,
      [companyId, row.level, row.description, row.acceptance],
    );
    if (rowCount !== 1)
      throw new WorkOrderError("회사의 위험성 판단 기준을 찾을 수 없습니다.");
  }
}

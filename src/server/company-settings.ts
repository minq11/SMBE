import type { PoolClient } from "@neondatabase/serverless";
import { z } from "zod";
import { WorkOrderError } from "../features/work-orders/model";
import {
  RISK_LEVELS,
  riskCriteriaSchema,
  type RiskCriteria,
} from "../features/company/risk-criteria";
import {
  companyInfoSchema,
  type SizeBand,
} from "../features/company/company-info";

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

const policySchema = z
  .string()
  .trim()
  .min(1, "실시규정을 입력하세요.")
  .max(4000, "실시규정이 너무 깁니다.");

/** 고시 제9조의 실시규정. 회사에 하나, 기본 문안은 0022 가 넣는다. */
export async function readAssessmentPolicy(
  client: PoolClient,
  companyId: string,
): Promise<string> {
  const { rows } = await client.query<{ risk_assessment_policy: string }>(
    "SELECT risk_assessment_policy FROM companies WHERE id = $1",
    [companyId],
  );
  if (!rows[0]) throw new WorkOrderError("회사를 찾을 수 없습니다.");
  return rows[0].risk_assessment_policy;
}

export async function updateAssessmentPolicy(
  client: PoolClient,
  companyId: string,
  raw: unknown,
): Promise<void> {
  const parsed = policySchema.safeParse(raw);
  if (!parsed.success)
    throw new WorkOrderError(
      parsed.error.issues[0]?.message ?? "실시규정을 확인하세요.",
    );
  await client.query(
    "UPDATE companies SET risk_assessment_policy = $2 WHERE id = $1",
    [companyId, parsed.data],
  );
}

/** 중대재해 대응 절차 (중처법 시행령 4조 8호). 기본 문안은 0026 이 넣는다. */
export async function readIncidentManual(
  client: PoolClient,
  companyId: string,
): Promise<string> {
  const { rows } = await client.query<{ incident_response_manual: string }>(
    "SELECT incident_response_manual FROM companies WHERE id = $1",
    [companyId],
  );
  if (!rows[0]) throw new WorkOrderError("회사를 찾을 수 없습니다.");
  return rows[0].incident_response_manual;
}

export async function updateIncidentManual(
  client: PoolClient,
  companyId: string,
  raw: unknown,
): Promise<void> {
  const parsed = z
    .string()
    .trim()
    .min(1, "대응 절차를 입력하세요.")
    .max(4000, "대응 절차가 너무 깁니다.")
    .safeParse(raw);
  if (!parsed.success)
    throw new WorkOrderError(
      parsed.error.issues[0]?.message ?? "대응 절차를 확인하세요.",
    );
  await client.query(
    "UPDATE companies SET incident_response_manual = $2 WHERE id = $1",
    [companyId, parsed.data],
  );
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

/** 회사 정보 화면(`/company`)이 보여 주고 고치는 값. */
export type CompanyInfo = {
  name: string;
  business_type: string;
  initial_employee_size_band: SizeBand;
  business_start_date: string;
  expected_annual_revenue_manwon: number;
  company_code: string;
  /** 그사이 다른 관리자가 고쳤는지 가리는 값 (updated_at). */
  version: string;
};

export async function readCompanyInfo(
  client: PoolClient,
  companyId: string,
): Promise<CompanyInfo> {
  const { rows } = await client.query<CompanyInfo>(
    `SELECT name,
            COALESCE(business_type, '') AS business_type,
            initial_employee_size_band,
            COALESCE(business_start_date::text, '') AS business_start_date,
            expected_annual_revenue_manwon::float8 AS expected_annual_revenue_manwon,
            company_code,
            updated_at::text AS version
       FROM companies
      WHERE id = $1 AND withdrawn_at IS NULL`,
    [companyId],
  );
  if (!rows[0]) throw new WorkOrderError("회사를 찾을 수 없습니다.");
  return rows[0];
}

/**
 * 회사 정보 고치기. **관리감독자만** — 회사 이름과 회사코드는 회사 전체에 걸리는 값이라
 * 회사를 만든 자리(관리감독자)가 정한다. 역할은 부르는 쪽이 아니라 여기서 다시 본다.
 *
 * 회사코드를 바꾸면 옛 코드로는 더 이상 참여할 수 없다. 이미 소속된 사람에게는 영향이 없다.
 */
export async function updateCompanyInfo(
  client: PoolClient,
  actor: { companyId: string; userId: string },
  raw: unknown,
): Promise<void> {
  const parsed = companyInfoSchema.safeParse(raw);
  if (!parsed.success)
    throw new WorkOrderError(
      parsed.error.issues[0]?.message ?? "입력한 값을 확인하세요.",
    );
  const d = parsed.data;

  const { rows: me } = await client.query<{ role: string }>(
    `SELECT role FROM company_members
      WHERE company_id = $1 AND user_id = $2
        AND status = 'ACTIVE' AND left_at IS NULL`,
    [actor.companyId, actor.userId],
  );
  if (me[0]?.role !== "MANAGER_SUPERVISOR")
    throw new WorkOrderError("회사 정보는 관리감독자만 고칠 수 있습니다.");

  const { rows } = await client.query<{ version: string }>(
    "SELECT updated_at::text AS version FROM companies WHERE id = $1 AND withdrawn_at IS NULL FOR UPDATE",
    [actor.companyId],
  );
  if (!rows[0]) throw new WorkOrderError("회사를 찾을 수 없습니다.");
  if (rows[0].version !== d.version)
    throw new WorkOrderError(
      "다른 관리자가 그사이 회사 정보를 고쳤습니다. 새로고침한 뒤 다시 입력하세요.",
    );

  await client.query("SAVEPOINT company_info");
  try {
    await client.query(
      `UPDATE companies
          SET name = $2, business_type = $3, initial_employee_size_band = $4,
              business_start_date = $5::date, expected_annual_revenue_manwon = $6,
              company_code = $7
        WHERE id = $1`,
      [
        actor.companyId,
        d.name,
        d.business_type,
        d.initial_employee_size_band,
        d.business_start_date,
        d.expected_annual_revenue_manwon,
        d.company_code,
      ],
    );
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code !== "23505") throw error;
    await client.query("ROLLBACK TO SAVEPOINT company_info");
    throw new WorkOrderError(
      "이미 다른 회사가 쓰는 회사코드입니다. 다른 코드를 입력하세요.",
    );
  }
  await client.query("RELEASE SAVEPOINT company_info");
  // 무엇을 고쳤는지만 남긴다 — 값은 회사 화면에 그대로 있다.
  await client.query(
    `INSERT INTO audit_logs(company_id,actor_id,action,target_type,target_id,after_json)
     VALUES($2,$1,'UPDATE_COMPANY','companies',$2,
            '{"fields":["name","business_type","initial_employee_size_band","business_start_date","expected_annual_revenue_manwon","company_code"]}'::jsonb)`,
    [actor.userId, actor.companyId],
  );
}

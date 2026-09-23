import "server-only";
import type { PoolClient } from "@neondatabase/serverless";
import { z } from "zod";
import { query, queryOne } from "./db";
import { memberAccess, type Actor } from "./work-order-service";
import { computeValidUntil } from "./standards-service";
import { WorkOrderError, seoulToday } from "../features/work-orders/model";
import type {
  AssessmentKind,
  AssessmentStatus,
} from "../features/standards/constants";

/**
 * 위험성평가 메뉴 — 회사의 평가를 한 곳에서 본다.
 *
 * 평가는 두 길로 생긴다. 표준서에 붙는 회차(`is_simple=false`, 저장 즉시 승인)와
 * 지시서에서 쓰는 간이평가(`is_simple=true`, 승인 절차). 지금까지는 각각 표준서
 * 상세와 지시서 안에서만 보였다. 감독·심사에서 "귀사의 위험성평가를 보여 달라" 에
 * 한 화면으로 답하려면 둘을 합쳐 놓아야 한다. 데이터는 복사하지 않고 묶어 보여
 * 주기만 한다 (설계 5-3).
 *
 * 조치 이행(실제 조치·완료일·조치 후 수준)은 승인 뒤 항목별로 적는다. 평가 승인이
 * 조치 완료를 뜻하지 않는다 (설계 R-03).
 */

export type AssessmentRow = {
  id: string;
  name: string;
  kind: AssessmentKind;
  performed_on: string;
  status: AssessmentStatus;
  is_simple: boolean;
  standard_id: string | null;
  work_order_id: string | null;
  created_by_name: string;
  item_count: number;
  /** 허용 불가로 판정됐는데 아직 조치 완료가 적히지 않은 항목 수 */
  open_action_count: number;
  valid_until: string | null;
  expired: boolean;
};

export type AssessmentOverview = {
  /** 올해 실시된 정기·최초·상시 평가 수 (승인) */
  this_year_count: number;
  pending_count: number;
  open_action_count: number;
  /** 사용 중 표준서 가운데 유효한 평가가 없는 것 */
  needs_assessment: Array<{
    standard_id: string;
    name: string;
    valid_until: string | null;
  }>;
  /** 30일 안에 만료되는 표준서 평가 */
  expiring_soon: Array<{
    standard_id: string;
    name: string;
    valid_until: string;
  }>;
};

const withValidity = <
  T extends {
    kind: AssessmentKind;
    performed_on: string;
    status: AssessmentStatus;
  },
>(
  row: T,
  today: string,
) => {
  const validUntil =
    row.status === "APPROVED"
      ? computeValidUntil(row.kind, row.performed_on)
      : null;
  return {
    ...row,
    valid_until: validUntil,
    expired: validUntil !== null && validUntil < today,
  };
};

export async function listAssessments(
  client: PoolClient,
  actor: Actor,
): Promise<AssessmentRow[]> {
  await memberAccess(client, actor, true);
  const { rows } = await client.query<
    Omit<AssessmentRow, "valid_until" | "expired">
  >(
    `SELECT ra.id, ra.name, ra.assessment_kind AS kind, ra.performed_on::text,
            ra.status, ra.is_simple, ra.standard_id,
            (SELECT wo.id FROM work_orders wo WHERE wo.risk_assessment_id = ra.id LIMIT 1) AS work_order_id,
            u.display_name AS created_by_name,
            (SELECT count(*)::int FROM risk_assessment_items i WHERE i.assessment_id = ra.id) AS item_count,
            (SELECT count(*)::int FROM risk_assessment_items i
              WHERE i.assessment_id = ra.id AND NOT i.initial_allowable
                AND i.actual_completion_date IS NULL) AS open_action_count
       FROM risk_assessments ra JOIN users u ON u.id = ra.created_by
      WHERE ra.company_id = $1
      ORDER BY ra.performed_on DESC, ra.created_at DESC
      LIMIT 300`,
    [actor.companyId],
  );
  const today = seoulToday();
  return rows.map((r) => withValidity(r, today));
}

export async function assessmentOverview(
  client: PoolClient,
  actor: Actor,
): Promise<AssessmentOverview> {
  await memberAccess(client, actor, true);
  const today = seoulToday();
  const year = today.slice(0, 4);
  const counts = await client.query<{
    this_year_count: number;
    pending_count: number;
    open_action_count: number;
  }>(
    `SELECT
       (SELECT count(*)::int FROM risk_assessments ra
         WHERE ra.company_id = $1 AND ra.status = 'APPROVED'
           AND ra.performed_on >= ($2 || '-01-01')::date
           AND ra.assessment_kind IN ('FIRST','PERIODIC','CONTINUOUS')) AS this_year_count,
       (SELECT count(*)::int FROM risk_assessments ra
         WHERE ra.company_id = $1 AND ra.status = 'PENDING') AS pending_count,
       (SELECT count(*)::int FROM risk_assessment_items i
          JOIN risk_assessments ra ON ra.id = i.assessment_id
         WHERE ra.company_id = $1 AND ra.status = 'APPROVED'
           AND NOT i.initial_allowable AND i.actual_completion_date IS NULL) AS open_action_count`,
    [actor.companyId, year],
  );
  // 사용 중 표준서마다 가장 최근 승인 평가 하나. 없거나 만료면 "평가 필요".
  const standards = await client.query<{
    standard_id: string;
    name: string;
    kind: AssessmentKind | null;
    performed_on: string | null;
  }>(
    `SELECT s.id AS standard_id, s.name, ra.assessment_kind AS kind, ra.performed_on::text
       FROM standards s
       LEFT JOIN LATERAL (
         SELECT assessment_kind, performed_on FROM risk_assessments
          WHERE standard_id = s.id AND status = 'APPROVED'
          ORDER BY performed_on DESC LIMIT 1
       ) ra ON true
      WHERE s.company_id = $1 AND s.status = 'APPROVED'
      ORDER BY s.name`,
    [actor.companyId],
  );
  const soon = new Date(today + "T00:00:00Z");
  soon.setUTCDate(soon.getUTCDate() + 30);
  const soonIso = soon.toISOString().slice(0, 10);
  const needs: AssessmentOverview["needs_assessment"] = [];
  const expiring: AssessmentOverview["expiring_soon"] = [];
  for (const s of standards.rows) {
    const validUntil =
      s.kind && s.performed_on
        ? computeValidUntil(s.kind, s.performed_on)
        : null;
    if (!s.performed_on || (validUntil !== null && validUntil < today))
      needs.push({
        standard_id: s.standard_id,
        name: s.name,
        valid_until: validUntil,
      });
    else if (validUntil !== null && validUntil <= soonIso)
      expiring.push({
        standard_id: s.standard_id,
        name: s.name,
        valid_until: validUntil,
      });
  }
  return {
    ...counts.rows[0],
    needs_assessment: needs,
    expiring_soon: expiring,
  };
}

export type AssessmentItemDetail = {
  id: string;
  order_no: number;
  hazard: string;
  initial_risk_level: "HIGH" | "MID" | "LOW";
  initial_allowable: boolean;
  reduction_measure: string;
  responsible_name: string | null;
  planned_completion_date: string | null;
  actual_action: string | null;
  actual_completion_date: string | null;
  post_risk_level: "HIGH" | "MID" | "LOW" | null;
  post_allowable: boolean | null;
};

export type AssessmentDetail = AssessmentRow & {
  criteria: string;
  work_method: string;
  safety_info: {
    equipment: string;
    materials: string;
    environment: string;
    history: string;
  };
  approved_by_name: string | null;
  approved_at: string | null;
  standard_name: string | null;
  work_order_name: string | null;
  participants: string[];
  items: AssessmentItemDetail[];
};

export async function readAssessment(
  client: PoolClient,
  actor: Actor,
  id: string,
): Promise<AssessmentDetail> {
  await memberAccess(client, actor, true);
  const { rows } = await client.query<
    Omit<AssessmentDetail, "valid_until" | "expired" | "participants" | "items">
  >(
    `SELECT ra.id, ra.name, ra.assessment_kind AS kind, ra.performed_on::text,
            ra.status, ra.is_simple, ra.standard_id,
            wo.id AS work_order_id, wo.name AS work_order_name,
            u.display_name AS created_by_name,
            ra.criteria_snapshot AS criteria, ra.work_method_snapshot AS work_method,
            ra.safety_info,
            a.display_name AS approved_by_name, ra.approved_at::text,
            s.name AS standard_name,
            (SELECT count(*)::int FROM risk_assessment_items i WHERE i.assessment_id = ra.id) AS item_count,
            (SELECT count(*)::int FROM risk_assessment_items i
              WHERE i.assessment_id = ra.id AND NOT i.initial_allowable
                AND i.actual_completion_date IS NULL) AS open_action_count
       FROM risk_assessments ra
       JOIN users u ON u.id = ra.created_by
       LEFT JOIN users a ON a.id = ra.approved_by
       LEFT JOIN standards s ON s.id = ra.standard_id
       LEFT JOIN LATERAL (
         SELECT id, name FROM work_orders WHERE risk_assessment_id = ra.id LIMIT 1
       ) wo ON true
      WHERE ra.id = $1 AND ra.company_id = $2`,
    [id, actor.companyId],
  );
  if (!rows[0]) throw new WorkOrderError("평가를 찾을 수 없습니다.");
  const items = await client.query<AssessmentItemDetail>(
    `SELECT i.id, i.order_no, i.hazard, i.initial_risk_level, i.initial_allowable,
            i.reduction_measure, r.display_name AS responsible_name,
            i.planned_completion_date::text, i.actual_action,
            i.actual_completion_date::text, i.post_risk_level, i.post_allowable
       FROM risk_assessment_items i
       LEFT JOIN users r ON r.id = i.responsible_user_id
      WHERE i.assessment_id = $1 ORDER BY i.order_no`,
    [id],
  );
  const parts = await client.query<{ snapshot_display_name: string }>(
    "SELECT snapshot_display_name FROM risk_assessment_participants WHERE assessment_id = $1",
    [id],
  );
  return {
    ...withValidity(rows[0], seoulToday()),
    participants: parts.rows.map((p) => p.snapshot_display_name),
    items: items.rows,
  };
}

const actionSchema = z.object({
  actualAction: z
    .string()
    .trim()
    .min(1, "실제 조치 내용을 적으세요.")
    .max(1000),
  actualCompletionDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "완료일을 선택하세요."),
  postRiskLevel: z.enum(["HIGH", "MID", "LOW"]),
  postAllowable: z.boolean(),
});
export type RiskActionInput = z.infer<typeof actionSchema>;

/**
 * 위험요인 하나의 조치 이행을 적는다. 승인된 평가에만, 관리자만. 다시 적으면
 * 덮어쓴다 — 조치는 최종 상태 하나가 의미 있고, 변경은 audit 에 남는다.
 */
export async function recordRiskAction(
  client: PoolClient,
  actor: Actor,
  input: { assessmentId: string; itemId: string } & RiskActionInput,
): Promise<void> {
  await memberAccess(client, actor, true);
  const parsed = actionSchema.safeParse(input);
  if (!parsed.success)
    throw new WorkOrderError(
      parsed.error.issues[0]?.message ?? "입력을 확인하세요.",
    );
  const { rows } = await client.query<{ status: string }>(
    `SELECT ra.status FROM risk_assessment_items i
       JOIN risk_assessments ra ON ra.id = i.assessment_id
      WHERE i.id = $1 AND ra.id = $2 AND ra.company_id = $3 FOR UPDATE OF ra`,
    [input.itemId, input.assessmentId, actor.companyId],
  );
  if (!rows[0]) throw new WorkOrderError("위험요인을 찾을 수 없습니다.");
  if (rows[0].status !== "APPROVED")
    throw new WorkOrderError("승인된 평가에만 조치를 적을 수 있습니다.");
  await client.query(
    `UPDATE risk_assessment_items
        SET actual_action = $2, actual_completion_date = $3::date,
            post_risk_level = $4, post_allowable = $5
      WHERE id = $1`,
    [
      input.itemId,
      parsed.data.actualAction,
      parsed.data.actualCompletionDate,
      parsed.data.postRiskLevel,
      parsed.data.postAllowable,
    ],
  );
  await client.query(
    `INSERT INTO audit_logs (company_id, actor_id, action, target_type, target_id, path, after_json)
     VALUES ($1, $2, 'RISK_ACTION_RECORD', 'risk_assessment', $3, 'WEB', $4::jsonb)`,
    [
      actor.companyId,
      actor.userId,
      input.assessmentId,
      JSON.stringify({ item_id: input.itemId, ...parsed.data }),
    ],
  );
}

/** 표준서 고르기 화면용 — 사용 중 표준서와 평가 상태. */
export async function standardsForNewAssessment(companyId: string) {
  const today = seoulToday();
  const rows = await query<{
    standard_id: string;
    name: string;
    kind: AssessmentKind | null;
    performed_on: string | null;
  }>(
    `SELECT s.id AS standard_id, s.name, ra.assessment_kind AS kind, ra.performed_on::text
       FROM standards s
       LEFT JOIN LATERAL (
         SELECT assessment_kind, performed_on FROM risk_assessments
          WHERE standard_id = s.id AND status = 'APPROVED'
          ORDER BY performed_on DESC LIMIT 1
       ) ra ON true
      WHERE s.company_id = $1 AND s.status = 'APPROVED'
      ORDER BY s.name`,
    [companyId],
  );
  return rows.map((s) => {
    const validUntil =
      s.kind && s.performed_on
        ? computeValidUntil(s.kind, s.performed_on)
        : null;
    return {
      standard_id: s.standard_id,
      name: s.name,
      last_performed_on: s.performed_on,
      valid_until: validUntil,
      expired: !s.performed_on || (validUntil !== null && validUntil < today),
    };
  });
}

export const assessmentExists = (id: string) =>
  queryOne<{ id: string }>("SELECT id FROM risk_assessments WHERE id = $1", [
    id,
  ]);

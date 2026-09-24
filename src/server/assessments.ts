import "server-only";
import type { PoolClient } from "@neondatabase/serverless";
import { z } from "zod";
import { query, queryOne } from "./db";
import { memberAccess, type Actor } from "./work-order-service";
import { computeValidUntil } from "./standards-service";
import { WorkOrderError, seoulToday } from "../features/work-orders/model";
import type { RiskCriteria } from "../features/company/risk-criteria";
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
  /**
   * 허용 불가로 판정됐는데 아직 허용 수준에 못 이른 항목 수 — 조치 기록이 없거나,
   * 조치 뒤에도 허용 불가라 추가 대책이 남은 것 (고시 제13조).
   */
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
                AND (i.actual_completion_date IS NULL OR i.post_allowable = false)) AS open_action_count
       FROM risk_assessments ra JOIN users u ON u.id = ra.created_by
      WHERE ra.company_id = $1
      ORDER BY ra.performed_on DESC, ra.created_at DESC
      LIMIT 300`,
    [actor.companyId],
  );
  const today = seoulToday();
  return rows.map((r) => withValidity(r, today));
}

/** 사용 중 표준서마다 가장 최근 승인 평가 하나. 없거나 만료면 "평가 필요". */
async function standardsStatus(client: PoolClient, companyId: string) {
  const today = seoulToday();
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
    [companyId],
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
  return { needs, expiring };
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
           AND NOT i.initial_allowable
           AND (i.actual_completion_date IS NULL OR i.post_allowable = false)) AS open_action_count`,
    [actor.companyId, year],
  );
  const { needs, expiring } = await standardsStatus(client, actor.companyId);
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
  /** 평가 시점에 이미 하고 있던 안전조치 */
  current_control: string | null;
  reduction_measure: string;
  responsible_name: string | null;
  planned_completion_date: string | null;
  actual_action: string | null;
  actual_completion_date: string | null;
  post_risk_level: "HIGH" | "MID" | "LOW" | null;
  post_allowable: boolean | null;
  /** 조치 뒤에도 허용 불가일 때의 추가 대책 */
  follow_up_measure: string | null;
};

export type AssessmentDetail = AssessmentRow & {
  criteria: RiskCriteria;
  work_method: string;
  safety_info: {
    equipment: string;
    materials: string;
    environment: string;
    history: string;
  };
  worker_opinion: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  standard_name: string | null;
  /** 평가 당시의 표준서 판 */
  standard_revision_no: number | null;
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
            ra.safety_info, ra.worker_opinion,
            a.display_name AS approved_by_name, ra.approved_at::text,
            s.name AS standard_name, rv.revision_no AS standard_revision_no,
            (SELECT count(*)::int FROM risk_assessment_items i WHERE i.assessment_id = ra.id) AS item_count,
            (SELECT count(*)::int FROM risk_assessment_items i
              WHERE i.assessment_id = ra.id AND NOT i.initial_allowable
                AND (i.actual_completion_date IS NULL OR i.post_allowable = false)) AS open_action_count
       FROM risk_assessments ra
       JOIN users u ON u.id = ra.created_by
       LEFT JOIN users a ON a.id = ra.approved_by
       LEFT JOIN standards s ON s.id = ra.standard_id
       LEFT JOIN standard_revisions rv ON rv.id = ra.standard_revision_id
       LEFT JOIN LATERAL (
         SELECT id, name FROM work_orders WHERE risk_assessment_id = ra.id LIMIT 1
       ) wo ON true
      WHERE ra.id = $1 AND ra.company_id = $2`,
    [id, actor.companyId],
  );
  if (!rows[0]) throw new WorkOrderError("평가를 찾을 수 없습니다.");
  const items = await client.query<AssessmentItemDetail>(
    `SELECT i.id, i.order_no, i.hazard, i.initial_risk_level, i.initial_allowable,
            i.current_control, i.reduction_measure, r.display_name AS responsible_name,
            i.planned_completion_date::text, i.actual_action,
            i.actual_completion_date::text, i.post_risk_level, i.post_allowable,
            i.follow_up_measure
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

const actionSchema = z
  .object({
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
    followUpMeasure: z.string().trim().max(1000).optional().default(""),
  })
  // 고시 제13조: 대책을 실행했는데도 허용 수준이 아니면 추가 대책을 세운다.
  .refine((v) => v.postAllowable || v.followUpMeasure.length > 0, {
    message: "조치 뒤에도 허용 불가면 추가 대책을 적으세요.",
    path: ["followUpMeasure"],
  });
export type RiskActionInput = z.input<typeof actionSchema>;

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
            post_risk_level = $4, post_allowable = $5, follow_up_measure = $6
      WHERE id = $1`,
    [
      input.itemId,
      parsed.data.actualAction,
      parsed.data.actualCompletionDate,
      parsed.data.postRiskLevel,
      parsed.data.postAllowable,
      parsed.data.postAllowable ? null : parsed.data.followUpMeasure,
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

export type HalfYearStats = {
  /** 이 반기에 승인된 평가 수 */
  assessments: number;
  /** 회사 전체의 허용 불가 항목 가운데 허용 수준에 이른 것 */
  actions_done: number;
  /** 아직 남은 것 (조치 기록 없음 또는 조치 뒤에도 허용 불가) */
  actions_open: number;
  /** 사용 중 표준서 가운데 유효한 평가가 없는 것 */
  standards_expired: number;
  pending: number;
};
export type HalfYearReviewRow = {
  id: string;
  period_year: number;
  period_half: 1 | 2;
  reviewed_at: string;
  reviewed_by_name: string;
  stats: HalfYearStats;
  note: string | null;
};
export type HalfYearReview = {
  year: number;
  half: 1 | 2;
  /** 이 반기의 지금 숫자 — 서명하면 이대로 남는다 */
  stats: HalfYearStats;
  /** 이 반기의 점검 기록 (있으면 점검 완료) */
  current: HalfYearReviewRow | null;
  /** 최근 기록 몇 건 (이번 반기 포함) */
  history: HalfYearReviewRow[];
};

const halfOf = (isoDate: string): { year: number; half: 1 | 2 } => ({
  year: Number(isoDate.slice(0, 4)),
  half: Number(isoDate.slice(5, 7)) <= 6 ? 1 : 2,
});
const halfRange = (year: number, half: 1 | 2) =>
  half === 1
    ? [`${year}-01-01`, `${year}-06-30`]
    : [`${year}-07-01`, `${year}-12-31`];

async function halfYearStats(
  client: PoolClient,
  companyId: string,
  year: number,
  half: 1 | 2,
): Promise<HalfYearStats> {
  const [from, to] = halfRange(year, half);
  const { rows } = await client.query<HalfYearStats>(
    `SELECT
       (SELECT count(*)::int FROM risk_assessments ra
         WHERE ra.company_id = $1 AND ra.status = 'APPROVED'
           AND ra.performed_on BETWEEN $2::date AND $3::date) AS assessments,
       (SELECT count(*)::int FROM risk_assessment_items i
          JOIN risk_assessments ra ON ra.id = i.assessment_id
         WHERE ra.company_id = $1 AND ra.status = 'APPROVED' AND NOT i.initial_allowable
           AND i.actual_completion_date IS NOT NULL AND i.post_allowable = true) AS actions_done,
       (SELECT count(*)::int FROM risk_assessment_items i
          JOIN risk_assessments ra ON ra.id = i.assessment_id
         WHERE ra.company_id = $1 AND ra.status = 'APPROVED' AND NOT i.initial_allowable
           AND (i.actual_completion_date IS NULL OR i.post_allowable = false)) AS actions_open,
       (SELECT count(*)::int FROM risk_assessments ra
         WHERE ra.company_id = $1 AND ra.status = 'PENDING') AS pending`,
    [companyId, from, to],
  );
  const { needs } = await standardsStatus(client, companyId);
  return { ...rows[0], standards_expired: needs.length };
}

/**
 * 경영책임자 반기 점검 (중처법 시행령 제4조 제3호). 위험성평가 결과를 보고받고
 * 확인했다는 기록이다. 판례가 "형식적 외관" 을 미이행으로 보므로 점검 시점의
 * 숫자를 같이 남긴다 — 무엇을 보고 서명했는지.
 */
export async function readHalfYearReview(
  client: PoolClient,
  actor: Actor,
): Promise<HalfYearReview> {
  await memberAccess(client, actor, true);
  const { year, half } = halfOf(seoulToday());
  const stats = await halfYearStats(client, actor.companyId, year, half);
  const { rows } = await client.query<HalfYearReviewRow>(
    `SELECT r.id, r.period_year, r.period_half, r.reviewed_at::text,
            u.display_name AS reviewed_by_name, r.stats, r.note
       FROM assessment_reviews r JOIN users u ON u.id = r.reviewed_by
      WHERE r.company_id = $1
      ORDER BY r.period_year DESC, r.period_half DESC, r.reviewed_at DESC
      LIMIT 6`,
    [actor.companyId],
  );
  return {
    year,
    half,
    stats,
    current:
      rows.find((r) => r.period_year === year && r.period_half === half) ??
      null,
    history: rows,
  };
}

export async function recordHalfYearReview(
  client: PoolClient,
  actor: Actor,
  rawNote: unknown,
): Promise<void> {
  await memberAccess(client, actor, true);
  const note = z
    .string()
    .trim()
    .max(2000)
    .safeParse(rawNote ?? "");
  if (!note.success) throw new WorkOrderError("점검 의견이 너무 깁니다.");
  const { year, half } = halfOf(seoulToday());
  const stats = await halfYearStats(client, actor.companyId, year, half);
  await client.query(
    `INSERT INTO assessment_reviews
       (company_id, period_year, period_half, reviewed_by, stats, note)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
    [
      actor.companyId,
      year,
      half,
      actor.userId,
      JSON.stringify(stats),
      note.data || null,
    ],
  );
  await client.query(
    `INSERT INTO audit_logs (company_id, actor_id, action, target_type, target_id, path, after_json)
     VALUES ($1, $2, 'ASSESSMENT_HALF_YEAR_REVIEW', 'company', $1, 'WEB', $3::jsonb)`,
    [actor.companyId, actor.userId, JSON.stringify({ year, half, stats })],
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

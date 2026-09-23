import "server-only";

import { z } from "zod";
import { query, queryOne, withTransaction } from "@/server/db";
import { readRiskCriteria } from "@/server/company-settings";
import {
  ASSESSMENT_KIND_LABEL,
  VALIDITY_MONTHS,
  type AssessmentKind,
  type AssessmentStatus,
  type RiskAssessmentSummary,
  type RiskItem,
  type SafetyInfo,
  type StandardChecklistItem,
  type StandardDetail,
  type StandardListRow,
  type StandardStatus,
  type StandardStep,
} from "@/features/standards/constants";

// 공용 상수·타입 재 export (서버 모듈이 진입점인 기존 소비자들 호환용)
export {
  ASSESSMENT_KIND_LABEL,
  type AssessmentKind,
  type AssessmentStatus,
  type RiskAssessmentSummary,
  type RiskItem,
  type SafetyInfo,
  type StandardChecklistItem,
  type StandardDetail,
  type StandardListRow,
  type StandardStatus,
  type StandardStep,
};

// -----------------------------------------------------------------------------
// Validation schemas
// -----------------------------------------------------------------------------

const riskItemSchema = z.object({
  hazard: z.string().trim().min(1).max(500),
  initial_risk_level: z.enum(["HIGH", "MID", "LOW"]),
  initial_allowable: z.boolean(),
  reduction_measure: z.string().trim().min(1).max(1000),
  responsible_user_id: z.string().uuid().nullable(),
  planned_completion_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
});

const safetyInfoSchema = z.object({
  equipment: z.string().trim().min(1).max(2000),
  materials: z.string().trim().min(1).max(2000),
  environment: z.string().trim().min(1).max(2000),
  history: z.string().trim().min(1).max(2000),
});

// 표준서 저장(신규·편집) 페이로드 (평가는 별도 함수)
export const standardEditSchema = z.object({
  name: z.string().trim().min(1, "표준서명을 입력하세요.").max(120),
  ptw_required: z.boolean(),
  // 편집 시 기존 스텝은 id 를 보존해 첨부 사진 target_id 가 유지된다.
  // 신규 스텝은 id 없이 { text } 만 보내면 서버가 새 uuid 부여.
  steps: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        text: z.string().trim().min(1).max(500),
      }),
    )
    .min(1, "작업 단계를 하나 이상 입력하세요.")
    .max(30),
  checklist_tbm: z
    .array(z.string().trim().min(1).max(500))
    .min(1, "TBM 체크리스트를 하나 이상 입력하세요.")
    .max(30),
  checklist_during: z
    .array(z.string().trim().min(1).max(500))
    .min(1, "작업 중 체크리스트를 하나 이상 입력하세요.")
    .max(30),
});
export type StandardEditPayload = z.infer<typeof standardEditSchema>;

// 위험성평가 회차 등록 페이로드
export const assessmentRoundSchema = z.object({
  kind: z.enum(["FIRST", "PERIODIC", "AD_HOC", "CONTINUOUS"]),
  performed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  work_method: z
    .string()
    .trim()
    .min(1, "작업방법 요약을 입력하세요.")
    .max(4000),
  // 판단 기준은 회사가 정한 값이 원본이다. 클라이언트 값은 받지 않고 서버가
  // 회사 기준을 사본으로 남긴다 (0013). 옛 클라이언트가 보내도 무시한다.
  criteria: z.string().max(2000).optional(),
  safety_info: safetyInfoSchema,
  risks: z.array(riskItemSchema).min(1).max(30),
  participant_user_ids: z
    .array(z.string().uuid())
    .min(1, "참여 근로자를 선택하세요.")
    .max(200),
});
export type AssessmentRoundPayload = z.infer<typeof assessmentRoundSchema>;

// 표준서 최초 생성 페이로드 (표준서 + 최초평가 함께)
export const initialStandardSchema = standardEditSchema.extend({
  first_assessment: assessmentRoundSchema.omit({ kind: true }),
});
export type InitialStandardPayload = z.infer<typeof initialStandardSchema>;

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const RETENTION_YEARS = 3;
function retentionUntilFromToday(): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() + RETENTION_YEARS);
  return d.toISOString().slice(0, 10);
}

function computeValidUntil(
  kind: AssessmentKind,
  performedOn: string,
): string | null {
  const months = VALIDITY_MONTHS[kind];
  if (months === null) return null;
  const d = new Date(performedOn + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// -----------------------------------------------------------------------------
// Read
// -----------------------------------------------------------------------------

export async function listStandards(
  companyId: string,
): Promise<StandardListRow[]> {
  const rows = await query<{
    standard_id: string;
    name: string;
    status: StandardStatus;
    ptw_required: boolean;
    updated_at: string;
    latest_approved_performed_on: string | null;
    latest_approved_kind: AssessmentKind | null;
    approved_assessment_count: number;
  }>(
    `SELECT s.id AS standard_id,
            s.name,
            s.status,
            s.ptw_required,
            s.updated_at,
            (
              SELECT MAX(ra.performed_on)::text FROM risk_assessments ra
               WHERE ra.standard_id = s.id AND ra.status = 'APPROVED'
            ) AS latest_approved_performed_on,
            (
              SELECT ra.assessment_kind FROM risk_assessments ra
                WHERE ra.standard_id = s.id AND ra.status = 'APPROVED'
                ORDER BY ra.performed_on DESC LIMIT 1
            )::text AS latest_approved_kind,
            (
              SELECT COUNT(*)::int FROM risk_assessments ra
               WHERE ra.standard_id = s.id AND ra.status = 'APPROVED'
            ) AS approved_assessment_count
       FROM standards s
      WHERE s.company_id = $1
      ORDER BY
        CASE s.status WHEN 'APPROVED' THEN 0 WHEN 'DRAFT' THEN 1 ELSE 2 END,
        s.updated_at DESC`,
    [companyId],
  );
  return rows.map((r) => {
    const validUntil =
      r.latest_approved_kind && r.latest_approved_performed_on
        ? computeValidUntil(
            r.latest_approved_kind,
            r.latest_approved_performed_on,
          )
        : null;
    const notExpired = validUntil === null || validUntil >= todayIso();
    const usable =
      r.status === "APPROVED" && r.approved_assessment_count > 0 && notExpired;
    return {
      ...r,
      valid_until: validUntil,
      usable,
    };
  });
}

export async function listUsableStandards(companyId: string): Promise<
  Array<{
    standard_id: string;
    name: string;
    ptw_required: boolean;
  }>
> {
  const all = await listStandards(companyId);
  return all
    .filter((s) => s.usable)
    .map((s) => ({
      standard_id: s.standard_id,
      name: s.name,
      ptw_required: s.ptw_required,
    }));
}

export async function getStandardDetail(
  companyId: string,
  standardId: string,
): Promise<StandardDetail | null> {
  const std = await queryOne<{
    id: string;
    name: string;
    status: StandardStatus;
    ptw_required: boolean;
    created_at: string;
    updated_at: string;
    archived_at: string | null;
  }>(
    `SELECT id, name, status, ptw_required, created_at, updated_at, archived_at
       FROM standards
      WHERE id = $1 AND company_id = $2 LIMIT 1`,
    [standardId, companyId],
  );
  if (!std) return null;

  const steps = await query<StandardStep>(
    `SELECT id, order_no, step_text FROM standard_steps
      WHERE standard_id = $1 ORDER BY order_no`,
    [standardId],
  );
  const cl = await query<StandardChecklistItem>(
    `SELECT category, order_no, text FROM standard_checklist_items
      WHERE standard_id = $1 ORDER BY category, order_no`,
    [standardId],
  );
  const tbm = cl.filter((i) => i.category === "TBM").map((i) => i.text);
  const during = cl
    .filter((i) => i.category === "DURING_WORK")
    .map((i) => i.text);

  const rawAssessments = await query<{
    assessment_id: string;
    kind: AssessmentKind;
    performed_on: string;
    status: AssessmentStatus;
    approved_at: string | null;
    approved_by_name: string | null;
  }>(
    `SELECT ra.id AS assessment_id,
            ra.assessment_kind AS kind,
            ra.performed_on::text AS performed_on,
            ra.status,
            ra.approved_at::text AS approved_at,
            u.display_name AS approved_by_name
       FROM risk_assessments ra
       LEFT JOIN users u ON u.id = ra.approved_by
      WHERE ra.standard_id = $1
      ORDER BY ra.performed_on DESC, ra.approved_at DESC NULLS LAST`,
    [standardId],
  );

  const currentApproved = rawAssessments.find((a) => a.status === "APPROVED");
  const today = todayIso();
  const assessments: RiskAssessmentSummary[] = rawAssessments.map((a) => {
    const validUntil =
      a.status === "APPROVED"
        ? computeValidUntil(a.kind, a.performed_on)
        : null;
    return {
      ...a,
      valid_until: validUntil,
      expired: validUntil !== null && validUntil < today,
      is_current: a.assessment_id === currentApproved?.assessment_id,
    };
  });

  let current: StandardDetail["current_assessment"] = null;
  if (currentApproved) {
    const info = await queryOne<{
      criteria_snapshot: string;
      work_method_snapshot: string;
      safety_info: SafetyInfo;
    }>(
      `SELECT criteria_snapshot, work_method_snapshot, safety_info
         FROM risk_assessments WHERE id = $1`,
      [currentApproved.assessment_id],
    );
    const items = await query<RiskItem>(
      `SELECT id, order_no, hazard, initial_risk_level, initial_allowable,
              reduction_measure, responsible_user_id,
              planned_completion_date::text AS planned_completion_date,
              actual_action, actual_completion_date::text AS actual_completion_date,
              post_risk_level, post_allowable
         FROM risk_assessment_items
        WHERE assessment_id = $1 ORDER BY order_no`,
      [currentApproved.assessment_id],
    );
    const parts = await query<{ snapshot_display_name: string }>(
      `SELECT snapshot_display_name FROM risk_assessment_participants
        WHERE assessment_id = $1`,
      [currentApproved.assessment_id],
    );
    const validUntil = computeValidUntil(
      currentApproved.kind,
      currentApproved.performed_on,
    );
    current = {
      assessment_id: currentApproved.assessment_id,
      kind: currentApproved.kind,
      performed_on: currentApproved.performed_on,
      criteria: info?.criteria_snapshot ?? "",
      work_method: info?.work_method_snapshot ?? "",
      safety_info: info?.safety_info ?? {
        equipment: "",
        materials: "",
        environment: "",
        history: "",
      },
      risks: items,
      participant_names: parts.map((p) => p.snapshot_display_name),
      valid_until: validUntil,
      expired: validUntil !== null && validUntil < today,
    };
  }

  return {
    standard_id: std.id,
    name: std.name,
    status: std.status,
    ptw_required: std.ptw_required,
    created_at: std.created_at,
    updated_at: std.updated_at,
    archived_at: std.archived_at,
    steps,
    checklist_tbm: tbm,
    checklist_during: during,
    assessments,
    current_assessment: current,
  };
}

export async function getStandardForPrefill(
  companyId: string,
  standardId: string,
): Promise<{
  standard_id: string;
  name: string;
  ptw_required: boolean;
  work_method: string;
  checklist_tbm: string[];
  checklist_during: string[];
  criteria: string;
  safety_info: SafetyInfo;
  risks: RiskItem[];
  participant_ids: string[];
  assessment_id: string;
  valid_until: string | null;
  expired: boolean;
} | null> {
  const detail = await getStandardDetail(companyId, standardId);
  if (!detail || detail.status !== "APPROVED" || !detail.current_assessment)
    return null;
  const ca = detail.current_assessment;
  const parts = await query<{ user_id: string }>(
    `SELECT user_id FROM risk_assessment_participants
      WHERE assessment_id = $1`,
    [ca.assessment_id],
  );
  return {
    standard_id: detail.standard_id,
    name: detail.name,
    ptw_required: detail.ptw_required,
    work_method: ca.work_method,
    checklist_tbm: detail.checklist_tbm,
    checklist_during: detail.checklist_during,
    criteria: ca.criteria,
    safety_info: ca.safety_info,
    risks: ca.risks,
    participant_ids: parts.map((p) => p.user_id),
    assessment_id: ca.assessment_id,
    valid_until: ca.valid_until,
    expired: ca.expired,
  };
}

export async function listCompanyMembersForPicker(
  companyId: string,
): Promise<Array<{ user_id: string; display_name: string; role: string }>> {
  return query(
    `SELECT m.user_id,
            m.snapshot_display_name AS display_name,
            m.role
       FROM company_members m
      WHERE m.company_id = $1
        AND m.status = 'ACTIVE'
        AND m.left_at IS NULL
      ORDER BY m.role, m.snapshot_display_name`,
    [companyId],
  );
}

// -----------------------------------------------------------------------------
// Mutations
// -----------------------------------------------------------------------------

async function insertRiskAssessmentRound(
  client: {
    query: <T = unknown>(
      text: string,
      params?: unknown[],
    ) => Promise<{ rows: T[] }>;
  },
  args: {
    companyId: string;
    standardId: string;
    actorId: string;
    payload: AssessmentRoundPayload;
    participantNameByUserId: Record<string, string>;
    displayName: string; // for snapshot fallback
  },
): Promise<string> {
  const { companyId, standardId, actorId, payload, participantNameByUserId } =
    args;
  const criteria = await readRiskCriteria(
    client as unknown as Parameters<typeof readRiskCriteria>[0],
    companyId,
  );
  const raRow = await client.query<{ id: string }>(
    `INSERT INTO risk_assessments
       (company_id, is_simple, name, assessment_kind, performed_on, status,
        criteria_snapshot, work_method_snapshot, safety_info,
        created_by, approved_by, approved_at, retention_until, standard_id)
     VALUES ($1, false,
             (SELECT name FROM standards WHERE id = $2),
             $3, $4::date, 'APPROVED',
             $5, $6, $7::jsonb, $8, $8, now(), $9::date, $2)
     RETURNING id`,
    [
      companyId,
      standardId,
      payload.kind,
      payload.performed_on,
      criteria,
      payload.work_method,
      JSON.stringify(payload.safety_info),
      actorId,
      retentionUntilFromToday(),
    ],
  );
  const raId = raRow.rows[0].id;

  for (let i = 0; i < payload.risks.length; i++) {
    const r = payload.risks[i];
    await client.query(
      `INSERT INTO risk_assessment_items
         (assessment_id, order_no, hazard, initial_risk_level, initial_allowable,
          reduction_measure, responsible_user_id, planned_completion_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date)`,
      [
        raId,
        i + 1,
        r.hazard,
        r.initial_risk_level,
        r.initial_allowable,
        r.reduction_measure,
        r.responsible_user_id,
        r.planned_completion_date,
      ],
    );
  }
  for (const uid of payload.participant_user_ids) {
    const name = participantNameByUserId[uid] ?? "구성원";
    await client.query(
      `INSERT INTO risk_assessment_participants
         (assessment_id, user_id, snapshot_display_name)
       VALUES ($1, $2, $3)`,
      [raId, uid, name],
    );
  }
  return raId;
}

/**
 * 신규 표준서 + 최초평가를 함께 생성 (self-approve).
 */
export async function createStandardWithFirstAssessment(input: {
  companyId: string;
  actorId: string;
  actorDisplayName: string;
  payload: InitialStandardPayload;
  participantDisplayNames: Record<string, string>;
}): Promise<{ standardId: string; assessmentId: string }> {
  const { companyId, actorId, payload, participantDisplayNames } = input;
  return withTransaction(async (client) => {
    const std = await client.query<{ id: string }>(
      `INSERT INTO standards
         (company_id, name, ptw_required, status, created_by)
       VALUES ($1, $2, $3, 'APPROVED', $4)
       RETURNING id`,
      [companyId, payload.name, payload.ptw_required, actorId],
    );
    const standardId = std.rows[0].id;

    for (let i = 0; i < payload.steps.length; i++) {
      await client.query(
        `INSERT INTO standard_steps (standard_id, order_no, step_text)
         VALUES ($1, $2, $3)`,
        [standardId, i + 1, payload.steps[i].text],
      );
    }
    for (let i = 0; i < payload.checklist_tbm.length; i++) {
      await client.query(
        `INSERT INTO standard_checklist_items
           (standard_id, category, order_no, text)
         VALUES ($1, 'TBM', $2, $3)`,
        [standardId, i + 1, payload.checklist_tbm[i]],
      );
    }
    for (let i = 0; i < payload.checklist_during.length; i++) {
      await client.query(
        `INSERT INTO standard_checklist_items
           (standard_id, category, order_no, text)
         VALUES ($1, 'DURING_WORK', $2, $3)`,
        [standardId, i + 1, payload.checklist_during[i]],
      );
    }

    const assessmentId = await insertRiskAssessmentRound(client, {
      companyId,
      standardId,
      actorId,
      displayName: input.actorDisplayName,
      participantNameByUserId: participantDisplayNames,
      payload: { ...payload.first_assessment, kind: "FIRST" },
    });

    await client.query(
      `INSERT INTO audit_logs
         (company_id, actor_id, action, target_type, target_id, path,
          after_json, is_self_approval)
       VALUES ($1, $2, 'STANDARD_CREATE', 'standard', $3, 'WEB', $4::jsonb, true)`,
      [
        companyId,
        actorId,
        standardId,
        JSON.stringify({
          name: payload.name,
          first_assessment_id: assessmentId,
        }),
      ],
    );

    return { standardId, assessmentId };
  });
}

/**
 * 표준서 편집 (버전 개념 없음, mutable).
 * 변경 이력은 audit_log 에 before/after 로 저장.
 */
export async function updateStandardMutable(input: {
  companyId: string;
  actorId: string;
  standardId: string;
  payload: StandardEditPayload;
}): Promise<void> {
  const { companyId, actorId, standardId, payload } = input;
  await withTransaction(async (client) => {
    const before = await client.query<{
      name: string;
      ptw_required: boolean;
    }>(
      `SELECT name, ptw_required FROM standards
        WHERE id = $1 AND company_id = $2 FOR UPDATE`,
      [standardId, companyId],
    );
    if (before.rows.length === 0) throw new Error("표준서를 찾을 수 없습니다.");
    const beforeSteps = await client.query<{
      id: string;
      order_no: number;
      step_text: string;
    }>(
      `SELECT id, order_no, step_text FROM standard_steps
        WHERE standard_id = $1 ORDER BY order_no`,
      [standardId],
    );
    const beforeCl = await client.query<{
      category: string;
      order_no: number;
      text: string;
    }>(
      `SELECT category, order_no, text FROM standard_checklist_items
        WHERE standard_id = $1 ORDER BY category, order_no`,
      [standardId],
    );

    await client.query(
      `UPDATE standards SET name = $2, ptw_required = $3 WHERE id = $1`,
      [standardId, payload.name, payload.ptw_required],
    );
    // 스텝: 첨부 사진 target_id 로 사용되는 id 를 보존.
    // 클라이언트가 보낸 id 목록에 없는 기존 스텝만 DELETE, 나머지는 UPDATE, 신규는 INSERT.
    const incomingIds = new Set(
      payload.steps.map((s) => s.id).filter((v): v is string => Boolean(v)),
    );
    const toDelete = beforeSteps.rows
      .map((r) => r.id)
      .filter((id) => !incomingIds.has(id));
    if (toDelete.length > 0) {
      await client.query(
        `DELETE FROM standard_steps WHERE id = ANY($1::uuid[])`,
        [toDelete],
      );
    }
    // UNIQUE (standard_id, order_no) 충돌 방지 위해 남은 스텝의 order_no 를 임시로 음수로 밀고
    // 새 order_no 로 다시 세팅. (한 트랜잭션 내 두 패스)
    await client.query(
      `UPDATE standard_steps SET order_no = -order_no WHERE standard_id = $1`,
      [standardId],
    );
    for (let i = 0; i < payload.steps.length; i++) {
      const s = payload.steps[i];
      if (s.id) {
        await client.query(
          `UPDATE standard_steps SET order_no = $2, step_text = $3
            WHERE id = $1 AND standard_id = $4`,
          [s.id, i + 1, s.text, standardId],
        );
      } else {
        await client.query(
          `INSERT INTO standard_steps (standard_id, order_no, step_text)
           VALUES ($1, $2, $3)`,
          [standardId, i + 1, s.text],
        );
      }
    }
    // 체크리스트는 첨부 사진 대상 아님 → 기존대로 wipe + insert.
    await client.query(
      `DELETE FROM standard_checklist_items WHERE standard_id = $1`,
      [standardId],
    );
    for (let i = 0; i < payload.checklist_tbm.length; i++) {
      await client.query(
        `INSERT INTO standard_checklist_items
           (standard_id, category, order_no, text)
         VALUES ($1, 'TBM', $2, $3)`,
        [standardId, i + 1, payload.checklist_tbm[i]],
      );
    }
    for (let i = 0; i < payload.checklist_during.length; i++) {
      await client.query(
        `INSERT INTO standard_checklist_items
           (standard_id, category, order_no, text)
         VALUES ($1, 'DURING_WORK', $2, $3)`,
        [standardId, i + 1, payload.checklist_during[i]],
      );
    }

    await client.query(
      `INSERT INTO audit_logs
         (company_id, actor_id, action, target_type, target_id, path,
          before_json, after_json)
       VALUES ($1, $2, 'STANDARD_UPDATE', 'standard', $3, 'WEB',
               $4::jsonb, $5::jsonb)`,
      [
        companyId,
        actorId,
        standardId,
        JSON.stringify({
          name: before.rows[0].name,
          ptw_required: before.rows[0].ptw_required,
          steps: beforeSteps.rows,
          checklist: beforeCl.rows,
        }),
        JSON.stringify({
          name: payload.name,
          ptw_required: payload.ptw_required,
          steps: payload.steps,
          checklist_tbm: payload.checklist_tbm,
          checklist_during: payload.checklist_during,
        }),
      ],
    );
  });
}

/**
 * 기존 표준서에 새 위험성평가 회차 추가 (정기·수시·상시).
 * 새 회차가 APPROVED 로 저장되면 이후 지시서 발급의 스냅샷 소스가 됨.
 */
export async function addAssessmentRound(input: {
  companyId: string;
  actorId: string;
  actorDisplayName: string;
  standardId: string;
  payload: AssessmentRoundPayload;
  participantDisplayNames: Record<string, string>;
}): Promise<{ assessmentId: string }> {
  const { companyId, actorId, standardId, payload, participantDisplayNames } =
    input;
  return withTransaction(async (client) => {
    const stdExists = await client.query<{ id: string; status: string }>(
      `SELECT id, status FROM standards
        WHERE id = $1 AND company_id = $2 FOR UPDATE`,
      [standardId, companyId],
    );
    if (stdExists.rows.length === 0)
      throw new Error("표준서를 찾을 수 없습니다.");
    if (stdExists.rows[0].status === "ARCHIVED")
      throw new Error("폐기된 표준서에는 평가를 추가할 수 없습니다.");

    const assessmentId = await insertRiskAssessmentRound(client, {
      companyId,
      standardId,
      actorId,
      displayName: input.actorDisplayName,
      participantNameByUserId: participantDisplayNames,
      payload,
    });

    await client.query(
      `INSERT INTO audit_logs
         (company_id, actor_id, action, target_type, target_id, path,
          after_json, is_self_approval)
       VALUES ($1, $2, 'ASSESSMENT_ADD', 'risk_assessment', $3, 'WEB',
               $4::jsonb, true)`,
      [
        companyId,
        actorId,
        assessmentId,
        JSON.stringify({
          standard_id: standardId,
          kind: payload.kind,
          performed_on: payload.performed_on,
        }),
      ],
    );

    return { assessmentId };
  });
}

export async function archiveStandard(input: {
  companyId: string;
  actorId: string;
  standardId: string;
}): Promise<void> {
  const { companyId, actorId, standardId } = input;
  await withTransaction(async (client) => {
    const cur = await client.query<{ status: StandardStatus }>(
      `SELECT status FROM standards WHERE id = $1 AND company_id = $2 FOR UPDATE`,
      [standardId, companyId],
    );
    if (cur.rows.length === 0) throw new Error("표준서를 찾을 수 없습니다.");
    if (cur.rows[0].status === "ARCHIVED") return;

    await client.query(
      `UPDATE standards
          SET status = 'ARCHIVED', archived_at = now(), archived_by = $2
        WHERE id = $1`,
      [standardId, actorId],
    );

    await client.query(
      `INSERT INTO audit_logs
         (company_id, actor_id, action, target_type, target_id, path)
       VALUES ($1, $2, 'STANDARD_ARCHIVE', 'standard', $3, 'WEB')`,
      [companyId, actorId, standardId],
    );
  });
}

// Export utility for other server modules
export { computeValidUntil };

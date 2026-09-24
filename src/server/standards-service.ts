import "server-only";

import { z } from "zod";
import { query, queryOne, withTransaction } from "@/server/db";
import { readRiskCriteria } from "@/server/company-settings";
import { deleteObjects, retireAttachments } from "@/server/attachments";
import type { RiskCriteria } from "@/features/company/risk-criteria";
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
  type StandardRevisionContent,
  type StandardRevisionSummary,
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
  // 평가 시점에 이미 하던 안전조치. 3단계 판단법 양식의 둘째 칸. 비워도 된다.
  current_control: z.string().trim().max(1000).optional().default(""),
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
  // 무엇을 왜 바꿨나. 개정 초안에만 있고 승인 이력에 남는다.
  change_note: z.string().trim().max(1000).optional().default(""),
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
  // 회사 기준을 사본으로 남긴다 (0013, 0020). 스키마에 없으니 보내도 버려진다.
  safety_info: safetyInfoSchema,
  // 위험요인을 찾을 때 근로자가 말한 것 (고시 제6조 참여의 흔적). 비워도 된다.
  worker_opinion: z.string().trim().max(2000).optional().default(""),
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

  const revisions = await listRevisions(standardId);
  const revision = revisions.find((r) => r.status === "APPROVED") ?? null;
  const draft = revisions.find((r) => r.status === "DRAFT") ?? null;
  const { steps, tbm, during } = revision
    ? await revisionBody(revision.id)
    : {
        steps: [] as StandardStep[],
        tbm: [] as string[],
        during: [] as string[],
      };

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
      criteria_snapshot: RiskCriteria;
      work_method_snapshot: string;
      safety_info: SafetyInfo;
    }>(
      `SELECT criteria_snapshot, work_method_snapshot, safety_info
         FROM risk_assessments WHERE id = $1`,
      [currentApproved.assessment_id],
    );
    const items = await query<RiskItem>(
      `SELECT id, order_no, hazard, initial_risk_level, initial_allowable,
              current_control, reduction_measure, responsible_user_id,
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
      criteria: info?.criteria_snapshot ?? [],
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
    revision,
    draft,
    revisions,
    steps,
    checklist_tbm: tbm,
    checklist_during: during,
    assessments,
    current_assessment: current,
  };
}

async function listRevisions(
  standardId: string,
): Promise<StandardRevisionSummary[]> {
  return query<StandardRevisionSummary>(
    `SELECT r.id, r.revision_no, r.status, r.change_note,
            r.created_at::text AS created_at, c.display_name AS created_by_name,
            r.approved_at::text AS approved_at, a.display_name AS approved_by_name
       FROM standard_revisions r
       JOIN users c ON c.id = r.created_by
       LEFT JOIN users a ON a.id = r.approved_by
      WHERE r.standard_id = $1
      ORDER BY r.revision_no DESC`,
    [standardId],
  );
}

async function revisionBody(revisionId: string) {
  const steps = await query<StandardStep>(
    `SELECT id, order_no, step_text FROM standard_steps
      WHERE revision_id = $1 ORDER BY order_no`,
    [revisionId],
  );
  const cl = await query<StandardChecklistItem>(
    `SELECT category, order_no, text FROM standard_checklist_items
      WHERE revision_id = $1 ORDER BY category, order_no`,
    [revisionId],
  );
  return {
    steps,
    tbm: cl.filter((i) => i.category === "TBM").map((i) => i.text),
    during: cl.filter((i) => i.category === "DURING_WORK").map((i) => i.text),
  };
}

/** 개정본 하나를 통째로. 옛 판 읽기와 초안 수정 화면이 쓴다. */
export async function getRevisionContent(
  companyId: string,
  standardId: string,
  which: { revisionNo: number } | { status: "DRAFT" },
): Promise<StandardRevisionContent | null> {
  const row = await queryOne<
    StandardRevisionSummary & { name: string; ptw_required: boolean }
  >(
    `SELECT r.id, r.revision_no, r.status, r.change_note, r.name, r.ptw_required,
            r.created_at::text AS created_at, c.display_name AS created_by_name,
            r.approved_at::text AS approved_at, a.display_name AS approved_by_name
       FROM standard_revisions r
       JOIN standards s ON s.id = r.standard_id
       JOIN users c ON c.id = r.created_by
       LEFT JOIN users a ON a.id = r.approved_by
      WHERE r.standard_id = $1 AND s.company_id = $2
        AND ${"revisionNo" in which ? "r.revision_no = $3" : "r.status = $3"}
      LIMIT 1`,
    [
      standardId,
      companyId,
      "revisionNo" in which ? which.revisionNo : which.status,
    ],
  );
  if (!row) return null;
  const { steps, tbm, during } = await revisionBody(row.id);
  return {
    ...row,
    standard_id: standardId,
    steps,
    checklist_tbm: tbm,
    checklist_during: during,
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
  safety_info: SafetyInfo;
  risks: RiskItem[];
  participant_ids: string[];
  assessment_id: string;
  valid_until: string | null;
  expired: boolean;
  /** 이 내용이 어느 판인가. 지시서 초안이 들고 있다가 발급 때 박는다. */
  revision_id: string | null;
  revision_no: number | null;
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
    safety_info: ca.safety_info,
    risks: ca.risks,
    participant_ids: parts.map((p) => p.user_id),
    assessment_id: ca.assessment_id,
    valid_until: ca.valid_until,
    expired: ca.expired,
    revision_id: detail.revision?.id ?? null,
    revision_no: detail.revision?.revision_no ?? null,
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
        created_by, approved_by, approved_at, retention_until, standard_id,
        worker_opinion, standard_revision_id)
     VALUES ($1, false,
             (SELECT name FROM standards WHERE id = $2),
             $3, $4::date, 'APPROVED',
             $5::jsonb, $6, $7::jsonb, $8, $8, now(), $9::date, $2, $10,
             (SELECT current_revision_id FROM standards WHERE id = $2))
     RETURNING id`,
    [
      companyId,
      standardId,
      payload.kind,
      payload.performed_on,
      JSON.stringify(criteria),
      payload.work_method,
      JSON.stringify(payload.safety_info),
      actorId,
      retentionUntilFromToday(),
      payload.worker_opinion || null,
    ],
  );
  const raId = raRow.rows[0].id;

  for (let i = 0; i < payload.risks.length; i++) {
    const r = payload.risks[i];
    await client.query(
      `INSERT INTO risk_assessment_items
         (assessment_id, order_no, hazard, initial_risk_level, initial_allowable,
          reduction_measure, responsible_user_id, planned_completion_date, current_control)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9)`,
      [
        raId,
        i + 1,
        r.hazard,
        r.initial_risk_level,
        r.initial_allowable,
        r.reduction_measure,
        r.responsible_user_id,
        r.planned_completion_date,
        r.current_control || null,
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
    // 1판. 만든 사람이 곧 승인자다 (표준서 생성은 자기 승인).
    const rev = await client.query<{ id: string }>(
      `INSERT INTO standard_revisions
         (standard_id, revision_no, status, name, ptw_required, created_by,
          approved_by, approved_at)
       VALUES ($1, 1, 'APPROVED', $2, $3, $4, $4, now()) RETURNING id`,
      [standardId, payload.name, payload.ptw_required, actorId],
    );
    const revisionId = rev.rows[0].id;
    await client.query(
      "UPDATE standards SET current_revision_id = $2 WHERE id = $1",
      [standardId, revisionId],
    );
    await writeRevisionBody(client, standardId, revisionId, payload, false);

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
type Q = {
  query: <T = unknown>(
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

/**
 * 개정본의 단계·체크리스트를 payload 대로 맞춘다.
 * 단계는 id 를 보존한다 — 사진이 단계 id 에 붙어 있다. payload 에 없는 기존 단계만
 * 지우고, 있는 건 고치고, 새것은 넣는다. 체크리스트는 사진 대상이 아니라 통째로 갈아
 * 끼운다. `keepIds=false` 면 전부 새로 넣는다 (1판 생성).
 */
async function writeRevisionBody(
  client: Q,
  standardId: string,
  revisionId: string,
  payload: StandardEditPayload,
  keepIds: boolean,
): Promise<string[]> {
  let orphanKeys: string[] = [];
  if (keepIds) {
    const incoming = new Set(
      payload.steps.map((s) => s.id).filter((v): v is string => Boolean(v)),
    );
    const existing = await client.query<{ id: string }>(
      "SELECT id FROM standard_steps WHERE revision_id = $1",
      [revisionId],
    );
    const toDelete = existing.rows
      .map((r) => r.id)
      .filter((id) => !incoming.has(id));
    if (toDelete.length) {
      // 단계가 사라지면 그 사진도. 파일은 다른 판이 아직 쓸 수 있어 키만 모아 둔다.
      orphanKeys = await retireAttachments(client, "standard_step", toDelete);
      await client.query(
        "DELETE FROM standard_steps WHERE id = ANY($1::uuid[])",
        [toDelete],
      );
    }
    // UNIQUE (revision_id, order_no) 충돌을 피해 음수로 밀었다가 다시 매긴다.
    await client.query(
      "UPDATE standard_steps SET order_no = -order_no WHERE revision_id = $1",
      [revisionId],
    );
  }
  for (let i = 0; i < payload.steps.length; i++) {
    const st = payload.steps[i];
    if (keepIds && st.id) {
      await client.query(
        `UPDATE standard_steps SET order_no = $2, step_text = $3
          WHERE id = $1 AND revision_id = $4`,
        [st.id, i + 1, st.text, revisionId],
      );
    } else {
      await client.query(
        `INSERT INTO standard_steps (standard_id, revision_id, order_no, step_text)
         VALUES ($1, $2, $3, $4)`,
        [standardId, revisionId, i + 1, st.text],
      );
    }
  }
  await client.query(
    "DELETE FROM standard_checklist_items WHERE revision_id = $1",
    [revisionId],
  );
  for (const [category, items] of [
    ["TBM", payload.checklist_tbm],
    ["DURING_WORK", payload.checklist_during],
  ] as const) {
    for (let i = 0; i < items.length; i++) {
      await client.query(
        `INSERT INTO standard_checklist_items
           (standard_id, revision_id, category, order_no, text)
         VALUES ($1, $2, $3, $4, $5)`,
        [standardId, revisionId, category, i + 1, items[i]],
      );
    }
  }
  return orphanKeys;
}

/**
 * 초안 행을 지운다 (단계·체크리스트는 CASCADE, 사진은 DELETED 표시). 버리기와 폐기가
 * 같이 쓴다. 돌려주는 키는 커밋 뒤 `deleteObjects` 로.
 */
async function dropDraft(
  client: Q,
  standardId: string,
): Promise<{ revisionNo: number; orphanKeys: string[] } | null> {
  const draft = await client.query<{ id: string; revision_no: number }>(
    `SELECT id, revision_no FROM standard_revisions
      WHERE standard_id = $1 AND status = 'DRAFT' FOR UPDATE`,
    [standardId],
  );
  if (!draft.rows[0]) return null;
  const steps = await client.query<{ id: string }>(
    "SELECT id FROM standard_steps WHERE revision_id = $1",
    [draft.rows[0].id],
  );
  const orphanKeys = await retireAttachments(
    client,
    "standard_step",
    steps.rows.map((r) => r.id),
  );
  await client.query("DELETE FROM standard_revisions WHERE id = $1", [
    draft.rows[0].id,
  ]);
  return { revisionNo: draft.rows[0].revision_no, orphanKeys };
}

/**
 * 개정 시작: 승인된 현재 판을 통째로 복사한 초안을 만든다. 이미 초안이 있으면 그것.
 * 단계 사진도 따라간다 — 같은 파일을 새 단계가 가리키는 행을 더 만든다.
 */
export async function startRevision(input: {
  companyId: string;
  actorId: string;
  standardId: string;
}): Promise<{ revisionId: string; revisionNo: number; created: boolean }> {
  const { companyId, actorId, standardId } = input;
  return withTransaction(async (client) => {
    const std = await client.query<{
      status: StandardStatus;
      current_revision_id: string | null;
    }>(
      `SELECT status, current_revision_id FROM standards
        WHERE id = $1 AND company_id = $2 FOR UPDATE`,
      [standardId, companyId],
    );
    if (!std.rows[0]) throw new Error("표준서를 찾을 수 없습니다.");
    if (std.rows[0].status === "ARCHIVED")
      throw new Error("폐기된 표준서는 개정할 수 없습니다.");
    const existing = await client.query<{ id: string; revision_no: number }>(
      `SELECT id, revision_no FROM standard_revisions
        WHERE standard_id = $1 AND status = 'DRAFT'`,
      [standardId],
    );
    if (existing.rows[0])
      return {
        revisionId: existing.rows[0].id,
        revisionNo: existing.rows[0].revision_no,
        created: false,
      };
    const cur = await client.query<{
      id: string;
      revision_no: number;
      name: string;
      ptw_required: boolean;
    }>(
      `SELECT id, revision_no, name, ptw_required FROM standard_revisions
        WHERE id = $1`,
      [std.rows[0].current_revision_id],
    );
    if (!cur.rows[0]) throw new Error("승인된 판이 없습니다.");
    const next = await client.query<{ id: string; revision_no: number }>(
      `INSERT INTO standard_revisions
         (standard_id, revision_no, status, name, ptw_required, created_by)
       VALUES ($1,
               (SELECT max(revision_no) + 1 FROM standard_revisions WHERE standard_id = $1),
               'DRAFT', $2, $3, $4)
       RETURNING id, revision_no`,
      [standardId, cur.rows[0].name, cur.rows[0].ptw_required, actorId],
    );
    const draftId = next.rows[0].id;
    // 단계 복사 + 사진 참조 복사. 옛 단계 id → 새 단계 id.
    const steps = await client.query<{
      id: string;
      order_no: number;
      step_text: string;
    }>(
      "SELECT id, order_no, step_text FROM standard_steps WHERE revision_id = $1 ORDER BY order_no",
      [cur.rows[0].id],
    );
    for (const st of steps.rows) {
      const ins = await client.query<{ id: string }>(
        `INSERT INTO standard_steps (standard_id, revision_id, order_no, step_text)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [standardId, draftId, st.order_no, st.step_text],
      );
      await client.query(
        `INSERT INTO attachments
           (company_id, target_type, target_id, storage_key, original_filename,
            mime_type, size_bytes, width, height, status, uploaded_by, created_at, ready_at)
         SELECT company_id, target_type, $2, storage_key, original_filename,
                mime_type, size_bytes, width, height, status, uploaded_by, created_at, ready_at
           FROM attachments
          WHERE target_type = 'standard_step' AND target_id = $1 AND status = 'READY'`,
        [st.id, ins.rows[0].id],
      );
    }
    await client.query(
      `INSERT INTO standard_checklist_items (standard_id, revision_id, category, order_no, text)
       SELECT standard_id, $2, category, order_no, text
         FROM standard_checklist_items WHERE revision_id = $1`,
      [cur.rows[0].id, draftId],
    );
    await client.query(
      `INSERT INTO audit_logs
         (company_id, actor_id, action, target_type, target_id, path, after_json)
       VALUES ($1, $2, 'STANDARD_REVISION_START', 'standard', $3, 'WEB', $4::jsonb)`,
      [
        companyId,
        actorId,
        standardId,
        JSON.stringify({
          revision_no: next.rows[0].revision_no,
          from: cur.rows[0].revision_no,
        }),
      ],
    );
    return {
      revisionId: draftId,
      revisionNo: next.rows[0].revision_no,
      created: true,
    };
  });
}

/** 개정 초안 저장. 승인된 판은 여기로 못 온다. */
export async function updateRevisionDraft(input: {
  companyId: string;
  actorId: string;
  standardId: string;
  payload: StandardEditPayload;
}): Promise<{ revisionId: string }> {
  const { companyId, actorId, standardId, payload } = input;
  const { revisionId, orphanKeys } = await withTransaction(async (client) => {
    const draft = await client.query<{ id: string; revision_no: number }>(
      `SELECT r.id, r.revision_no FROM standard_revisions r
         JOIN standards s ON s.id = r.standard_id
        WHERE r.standard_id = $1 AND s.company_id = $2 AND r.status = 'DRAFT'
          AND s.status <> 'ARCHIVED'
        FOR UPDATE OF r`,
      [standardId, companyId],
    );
    if (!draft.rows[0])
      throw new Error(
        "작성 중인 개정 초안이 없습니다. 개정을 먼저 시작하세요.",
      );
    const revisionId = draft.rows[0].id;
    await client.query(
      `UPDATE standard_revisions SET name = $2, ptw_required = $3, change_note = $4
        WHERE id = $1`,
      [
        revisionId,
        payload.name,
        payload.ptw_required,
        payload.change_note || null,
      ],
    );
    const orphanKeys = await writeRevisionBody(
      client,
      standardId,
      revisionId,
      payload,
      true,
    );
    await client.query(
      `INSERT INTO audit_logs
         (company_id, actor_id, action, target_type, target_id, path, after_json)
       VALUES ($1, $2, 'STANDARD_REVISION_SAVE', 'standard', $3, 'WEB', $4::jsonb)`,
      [
        companyId,
        actorId,
        standardId,
        JSON.stringify({ revision_no: draft.rows[0].revision_no, ...payload }),
      ],
    );
    return { revisionId, orphanKeys };
  });
  await deleteObjects(orphanKeys);
  return { revisionId };
}

/**
 * 개정 승인. 초안 → APPROVED, 이전 승인 판 → SUPERSEDED, 표준서의 현재 판·이름·PTW
 * 갱신. 그 뒤로 이 판은 고치지 않는다.
 */
export async function approveRevision(input: {
  companyId: string;
  actorId: string;
  standardId: string;
  changeNote?: string;
}): Promise<{ revisionNo: number }> {
  const { companyId, actorId, standardId } = input;
  return withTransaction(async (client) => {
    const std = await client.query<{ status: StandardStatus }>(
      `SELECT status FROM standards WHERE id = $1 AND company_id = $2 FOR UPDATE`,
      [standardId, companyId],
    );
    if (!std.rows[0]) throw new Error("표준서를 찾을 수 없습니다.");
    if (std.rows[0].status === "ARCHIVED")
      throw new Error("폐기된 표준서는 승인할 수 없습니다.");
    const draft = await client.query<{
      id: string;
      revision_no: number;
      name: string;
      ptw_required: boolean;
      change_note: string | null;
    }>(
      `SELECT id, revision_no, name, ptw_required, change_note FROM standard_revisions
        WHERE standard_id = $1 AND status = 'DRAFT' FOR UPDATE`,
      [standardId],
    );
    const d = draft.rows[0];
    if (!d) throw new Error("승인할 개정 초안이 없습니다.");
    const stepCount = await client.query<{ n: string }>(
      "SELECT count(*) AS n FROM standard_steps WHERE revision_id = $1",
      [d.id],
    );
    if (Number(stepCount.rows[0].n) === 0)
      throw new Error("작업 단계를 하나 이상 입력하세요.");
    const note = (input.changeNote ?? "").trim() || d.change_note;
    await client.query(
      `UPDATE standard_revisions SET status = 'SUPERSEDED'
        WHERE standard_id = $1 AND status = 'APPROVED'`,
      [standardId],
    );
    await client.query(
      `UPDATE standard_revisions
          SET status = 'APPROVED', approved_by = $2, approved_at = now(), change_note = $3
        WHERE id = $1`,
      [d.id, actorId, note],
    );
    await client.query(
      `UPDATE standards SET current_revision_id = $2, name = $3, ptw_required = $4
        WHERE id = $1`,
      [standardId, d.id, d.name, d.ptw_required],
    );
    await client.query(
      `INSERT INTO audit_logs
         (company_id, actor_id, action, target_type, target_id, path,
          after_json, is_self_approval)
       VALUES ($1, $2, 'STANDARD_REVISION_APPROVE', 'standard', $3, 'WEB', $4::jsonb, true)`,
      [
        companyId,
        actorId,
        standardId,
        JSON.stringify({ revision_no: d.revision_no, change_note: note }),
      ],
    );
    return { revisionNo: d.revision_no };
  });
}

/** 개정 초안 버리기. 복사해 둔 단계·사진 참조도 함께 지운다. */
export async function discardRevision(input: {
  companyId: string;
  actorId: string;
  standardId: string;
}): Promise<void> {
  const { companyId, actorId, standardId } = input;
  const orphanKeys = await withTransaction(async (client) => {
    const std = await client.query<{ id: string }>(
      `SELECT id FROM standards WHERE id = $1 AND company_id = $2 FOR UPDATE`,
      [standardId, companyId],
    );
    if (!std.rows[0]) throw new Error("표준서를 찾을 수 없습니다.");
    const dropped = await dropDraft(client, standardId);
    if (!dropped) return [];
    await client.query(
      `INSERT INTO audit_logs
         (company_id, actor_id, action, target_type, target_id, path, after_json)
       VALUES ($1, $2, 'STANDARD_REVISION_DISCARD', 'standard', $3, 'WEB', $4::jsonb)`,
      [
        companyId,
        actorId,
        standardId,
        JSON.stringify({ revision_no: dropped.revisionNo }),
      ],
    );
    return dropped.orphanKeys;
  });
  await deleteObjects(orphanKeys);
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
  const orphanKeys = await withTransaction(async (client) => {
    const cur = await client.query<{ status: StandardStatus }>(
      `SELECT status FROM standards WHERE id = $1 AND company_id = $2 FOR UPDATE`,
      [standardId, companyId],
    );
    if (cur.rows.length === 0) throw new Error("표준서를 찾을 수 없습니다.");
    if (cur.rows[0].status === "ARCHIVED") return [];
    // 폐기된 표준서에 작성 중인 개정본이 남아 승인되는 일이 없도록 초안은 같이 버린다.
    const dropped = await dropDraft(client, standardId);

    await client.query(
      `UPDATE standards
          SET status = 'ARCHIVED', archived_at = now(), archived_by = $2
        WHERE id = $1`,
      [standardId, actorId],
    );

    await client.query(
      `INSERT INTO audit_logs
         (company_id, actor_id, action, target_type, target_id, path, after_json)
       VALUES ($1, $2, 'STANDARD_ARCHIVE', 'standard', $3, 'WEB', $4::jsonb)`,
      [
        companyId,
        actorId,
        standardId,
        JSON.stringify({ discarded_draft_no: dropped?.revisionNo ?? null }),
      ],
    );
    return dropped?.orphanKeys ?? [];
  });
  await deleteObjects(orphanKeys);
}

// Export utility for other server modules
export { computeValidUntil };

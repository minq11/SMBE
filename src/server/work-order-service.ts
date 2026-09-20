import type { PoolClient } from "@neondatabase/serverless";
import { lockCompany } from "./membership-mutations";
import {
  archiveLocked,
  draftSchema,
  effectiveStatus,
  validateAssessment,
  validateIssue,
  WorkOrderError,
  type WorkDraft,
  type OrderStatus,
  type MemberOption,
} from "../features/work-orders/model";

export type Actor = { companyId: string; userId: string };
export type OrderRow = {
  id: string;
  company_id: string;
  name: string;
  draft_data: WorkDraft;
  revision: number;
  status: OrderStatus;
  risk_assessment_id: string | null;
  issue_version: number;
  issued_at: string | null;
  canceled_at: string | null;
  cancel_reason: string | null;
  created_by: string;
  created_at: string;
  self_approval_at_issue: boolean;
  ptw_required: boolean;
  assessment_status: string | null;
  assessment_created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
};
// 표준서 링크: 지정된 표준서가 자기 회사의 승인된 · 유효 평가를 가진 상태인지 검증.
// nullable string 리턴 (없거나 매칭 실패 시 null).
export async function resolveStandardLink(
  client: PoolClient,
  companyId: string,
  standardId: string | null,
): Promise<string | null> {
  if (!standardId) return null;
  const { rows } = await client.query<{ id: string; status: string }>(
    `SELECT id, status FROM standards
      WHERE id = $1 AND company_id = $2`,
    [standardId, companyId],
  );
  if (rows.length === 0)
    throw new WorkOrderError("표준서를 찾을 수 없습니다.");
  if (rows[0].status !== "APPROVED")
    throw new WorkOrderError(
      "폐기된 표준서는 지시서에 사용할 수 없습니다.",
    );
  return rows[0].id;
}

export async function memberAccess(
  client: PoolClient,
  actor: Actor,
  manager = false,
) {
  const { rows } = await client.query(
    `SELECT m.role, c.pro_state FROM company_members m JOIN companies c ON c.id=m.company_id
     WHERE m.company_id=$1 AND m.user_id=$2 AND m.status='ACTIVE' AND m.left_at IS NULL
       AND c.withdrawn_at IS NULL`,
    [actor.companyId, actor.userId],
  );
  if (!rows[0] || (manager && rows[0].role === "WORKER"))
    throw new WorkOrderError("이 작업을 수행할 권한이 없습니다.");
  return rows[0] as { role: string; pro_state: string };
}
export async function membersForOrder(
  client: PoolClient,
  companyId: string,
): Promise<MemberOption[]> {
  return (
    await client.query<MemberOption>(
      `SELECT m.user_id, u.display_name, m.role FROM company_members m JOIN users u ON u.id=m.user_id
     WHERE m.company_id=$1 AND m.status='ACTIVE' AND m.left_at IS NULL ORDER BY u.display_name`,
      [companyId],
    )
  ).rows;
}
async function validatePeople(
  client: PoolClient,
  companyId: string,
  d: WorkDraft,
) {
  const members = await membersForOrder(client, companyId);
  const ids = new Set(members.map((m) => m.user_id));
  const selected = [
    ...d.participantIds,
    ...d.assigneeIds,
    ...d.risks.map((r) => r.responsibleId).filter(Boolean),
  ];
  if (selected.some((id) => !ids.has(id)))
    throw new WorkOrderError(
      "선택한 인원 중 현재 회사의 활성 구성원이 아닌 사람이 있습니다.",
    );
  return members;
}
export async function auditOrder(
  client: PoolClient,
  actor: Actor,
  id: string,
  action: string,
  after: Record<string, unknown>,
  self = false,
) {
  // Only references, counters and states: never store personal/form text in audit.
  await client.query(
    `INSERT INTO audit_logs(company_id,actor_id,action,target_type,target_id,after_json,is_self_approval)
     VALUES ($1,$2,$3,'work_orders',$4,$5::jsonb,$6)`,
    [actor.companyId, actor.userId, action, id, JSON.stringify(after), self],
  );
}
async function rawOrder(
  client: PoolClient,
  actor: Actor,
  id: string,
  lock = false,
) {
  const { rows } = await client.query<OrderRow>(
    `SELECT w.*, a.status AS assessment_status, a.created_by AS assessment_created_by, a.approved_by, a.approved_at::text
     FROM work_orders w LEFT JOIN risk_assessments a ON a.id=w.risk_assessment_id
     WHERE w.id=$1 AND w.company_id=$2 ${lock ? "FOR UPDATE OF w" : ""}`,
    [id, actor.companyId],
  );
  if (!rows[0]) throw new WorkOrderError("지시서를 찾을 수 없습니다.");
  return rows[0];
}
export async function readOrder(client: PoolClient, actor: Actor, id: string) {
  const access = await memberAccess(client, actor);
  const row = await rawOrder(client, actor, id);
  if (access.role === "WORKER") {
    const assigned = await client.query(
      "SELECT id FROM work_order_assignments WHERE work_order_id=$1 AND user_id=$2 AND status <> 'UNASSIGNED'",
      [id, actor.userId],
    );
    if (row.status === "DRAFT" || !assigned.rows.length)
      throw new WorkOrderError("지시서를 찾을 수 없습니다.");
  }
  const status = effectiveStatus(row.status, row.draft_data);
  if (
    archiveLocked(
      status,
      row.draft_data.endDate,
      row.canceled_at,
      access.pro_state !== "FREE",
    )
  )
    throw new WorkOrderError(
      "무료 이용은 최근 1주일의 지난 기록만 열람할 수 있습니다.",
    );
  return { ...row, status };
}
async function writable(
  client: PoolClient,
  actor: Actor,
  id: string,
  revision: number,
) {
  await lockCompany(client, actor.companyId);
  await memberAccess(client, actor, true);
  const row = await rawOrder(client, actor, id, true);
  if (row.revision !== revision)
    throw new WorkOrderError(
      "다른 화면에서 변경되었습니다. 새로고침 후 다시 시도하세요.",
    );
  return row;
}
export async function saveOrder(
  client: PoolClient,
  actor: Actor,
  id: string,
  revision: number,
  input: unknown,
) {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success)
    throw new WorkOrderError(
      parsed.error.issues[0]?.message ?? "입력값을 확인하세요.",
    );
  const d = parsed.data;
  await lockCompany(client, actor.companyId);
  await memberAccess(client, actor, true);
  await validatePeople(client, actor.companyId, d);
  const linkedStandardId = await resolveStandardLink(
    client,
    actor.companyId,
    d.standardId ?? null,
  );

  if (revision === 0) {
    const inserted = await client.query(
      `INSERT INTO work_orders(id,company_id,name,group_label,draft_data,ptw_required,created_by,standard_id)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8) ON CONFLICT(id) DO NOTHING RETURNING id`,
      [
        id,
        actor.companyId,
        d.name,
        d.groupLabel,
        JSON.stringify(d),
        d.ptwRequired,
        actor.userId,
        linkedStandardId,
      ],
    );
    if (!inserted.rows.length)
      throw new WorkOrderError("이미 저장된 요청입니다. 목록에서 확인하세요.");
  } else {
    const row = await rawOrder(client, actor, id, true);
    if (row.revision !== revision)
      throw new WorkOrderError("다른 화면에서 변경되었습니다. 새로고침하세요.");
    if (row.status !== "DRAFT")
      throw new WorkOrderError(
        "발급된 지시서는 수정할 수 없습니다. 취소 후 복사하세요.",
      );
    if (row.ptw_required && !d.ptwRequired)
      throw new WorkOrderError("PTW 필요 여부를 불필요로 낮출 수 없습니다.");
    await client.query(
      `UPDATE work_orders SET name=$2,group_label=$3,draft_data=$4::jsonb,ptw_required=$5,
       risk_assessment_id=NULL,standard_id=$6,revision=revision+1 WHERE id=$1`,
      [
        id,
        d.name,
        d.groupLabel,
        JSON.stringify(d),
        d.ptwRequired,
        linkedStandardId,
      ],
    );
  }
  await auditOrder(client, actor, id, revision === 0 ? "CREATE" : "UPDATE", {
    revision: revision + 1,
  });
  return id;
}
export async function requestAssessment(
  client: PoolClient,
  actor: Actor,
  id: string,
  revision: number,
) {
  const row = await writable(client, actor, id, revision);
  if (row.status !== "DRAFT")
    throw new WorkOrderError("작성 중인 지시서만 평가를 요청할 수 있습니다.");
  if (row.risk_assessment_id)
    throw new WorkOrderError(
      "이미 평가를 요청했습니다. 내용 변경은 편집에서 진행하세요.",
    );
  const d = row.draft_data;
  validateAssessment(d);
  const members = await validatePeople(client, actor.companyId, d);
  const linkedStandardId = await resolveStandardLink(
    client,
    actor.companyId,
    d.standardId ?? null,
  );
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO risk_assessments(company_id,name,assessment_kind,performed_on,criteria_snapshot,work_method_snapshot,
      safety_info,created_by,retention_until,is_simple,standard_id)
      VALUES ($1,$2,$3,$4::date,$5,$6,$7::jsonb,$8,($4::date + interval '3 years')::date,$9,$10) RETURNING id`,
    [
      actor.companyId,
      d.name,
      d.assessmentKind,
      d.performedOn,
      d.criteria,
      d.method,
      JSON.stringify(d.safetyInfo),
      actor.userId,
      linkedStandardId === null, // 표준서 없으면 간이평가
      linkedStandardId,
    ],
  );
  const assessmentId = rows[0].id;
  for (const [i, risk] of d.risks.entries()) {
    await client.query(
      `INSERT INTO risk_assessment_items(assessment_id,order_no,hazard,initial_risk_level,initial_allowable,
        reduction_measure,responsible_user_id,planned_completion_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date)`,
      [
        assessmentId,
        i,
        risk.hazard,
        risk.level,
        risk.allowable === "yes",
        risk.measure,
        risk.responsibleId || null,
        risk.dueDate || null,
      ],
    );
  }
  for (const userId of d.participantIds) {
    await client.query(
      "INSERT INTO risk_assessment_participants(assessment_id,user_id,snapshot_display_name) VALUES ($1,$2,$3)",
      [
        assessmentId,
        userId,
        members.find((m) => m.user_id === userId)!.display_name,
      ],
    );
  }
  await client.query(
    "UPDATE work_orders SET risk_assessment_id=$2,revision=revision+1 WHERE id=$1",
    [id, assessmentId],
  );
  await auditOrder(client, actor, id, "SUBMIT_ASSESSMENT", { assessmentId });
}
export async function approveAssessment(
  client: PoolClient,
  actor: Actor,
  id: string,
  revision: number,
  allowSelfApproval: boolean,
) {
  const row = await writable(client, actor, id, revision);
  if (row.status !== "DRAFT" || row.assessment_status !== "PENDING")
    throw new WorkOrderError("승인 대기 중인 평가가 없습니다.");
  const { rows } = await client.query(
    "SELECT created_by FROM risk_assessments WHERE id=$1",
    [row.risk_assessment_id],
  );
  const self = rows[0].created_by === actor.userId;
  if (self && !allowSelfApproval)
    throw new WorkOrderError("현재는 다른 관리자의 평가 승인이 필요합니다.");
  await validatePeople(client, actor.companyId, row.draft_data);
  await client.query(
    "UPDATE risk_assessments SET status='APPROVED',approved_by=$2,approved_at=now() WHERE id=$1",
    [row.risk_assessment_id, actor.userId],
  );
  await client.query("UPDATE work_orders SET revision=revision+1 WHERE id=$1", [
    id,
  ]);
  await auditOrder(
    client,
    actor,
    id,
    "APPROVE_ASSESSMENT",
    { assessmentId: row.risk_assessment_id },
    self,
  );
}
export async function issueOrder(
  client: PoolClient,
  actor: Actor,
  id: string,
  revision: number,
) {
  const row = await writable(client, actor, id, revision);
  if (row.status !== "DRAFT")
    throw new WorkOrderError("이미 발급되었거나 취소된 지시서입니다.");
  if (row.assessment_status !== "APPROVED")
    throw new WorkOrderError("위험성평가 승인 후 발급할 수 있습니다.");
  const d = row.draft_data;
  validateIssue(d);
  if (effectiveStatus("ISSUED", d) === "COMPLETED")
    throw new WorkOrderError(
      "작업기간이 이미 종료되었습니다. 일정을 변경하세요.",
    );
  const members = await validatePeople(client, actor.companyId, d);
  const { rows: assessments } = await client.query(
    "SELECT a.*, a.performed_on::text AS performed_on, a.retention_until::text AS retention_until FROM risk_assessments a WHERE id=$1",
    [row.risk_assessment_id],
  );
  const { rows: items } = await client.query(
    `SELECT i.*, i.planned_completion_date::text AS planned_completion_date,
       i.actual_completion_date::text AS actual_completion_date, u.display_name AS responsible_name
       FROM risk_assessment_items i LEFT JOIN users u ON u.id=i.responsible_user_id
       WHERE assessment_id=$1 ORDER BY order_no`,
    [row.risk_assessment_id],
  );
  const { rows: participants } = await client.query(
    "SELECT user_id,snapshot_display_name FROM risk_assessment_participants WHERE assessment_id=$1",
    [row.risk_assessment_id],
  );
  await client.query(
    `INSERT INTO work_order_snapshots(work_order_id,snapshot_kind,payload) VALUES
      ($1,'RISK_ASSESSMENT',$2::jsonb),($1,'WORK_METHOD',$3::jsonb)`,
    [
      id,
      JSON.stringify({ ...assessments[0], items, participants }),
      JSON.stringify({ method: d.method }),
    ],
  );
  // 표준서 기반 지시서면 STANDARD_META 스냅샷도 함께 저장 (감사·심사 대응)
  const { rows: stdMeta } = await client.query<{
    id: string;
    name: string;
    ptw_required: boolean;
    updated_at: string;
  }>(
    `SELECT s.id, s.name, s.ptw_required, s.updated_at
       FROM standards s JOIN work_orders w ON w.standard_id = s.id
      WHERE w.id = $1`,
    [id],
  );
  if (stdMeta.length > 0) {
    await client.query(
      `INSERT INTO work_order_snapshots(work_order_id,snapshot_kind,payload)
       VALUES ($1,'STANDARD_META',$2::jsonb)
       ON CONFLICT (work_order_id, snapshot_kind) DO NOTHING`,
      [
        id,
        JSON.stringify({
          standard_id: stdMeta[0].id,
          standard_name: stdMeta[0].name,
          ptw_required: stdMeta[0].ptw_required,
          standard_updated_at: stdMeta[0].updated_at,
          captured_at: new Date().toISOString(),
        }),
      ],
    );
  }
  for (const [category, values] of [
    ["TBM", d.tbm],
    ["DURING_WORK", d.during],
  ] as const) {
    for (const [i, value] of values.entries())
      await client.query(
        "INSERT INTO work_order_checklist_items(work_order_id,category,order_no,text) VALUES ($1,$2,$3,$4)",
        [id, category, i, value],
      );
  }
  for (const userId of d.assigneeIds) {
    await client.query(
      "INSERT INTO work_order_assignments(work_order_id,user_id,snapshot_display_name) VALUES ($1,$2,$3)",
      [id, userId, members.find((m) => m.user_id === userId)!.display_name],
    );
    await client.query(
      "INSERT INTO work_order_outputs(work_order_id,issue_version,user_id,link_target) SELECT $1,1,id,email FROM users WHERE id=$2",
      [id, userId],
    );
  }
  await client.query(
    `UPDATE work_orders SET status='ISSUED',revision=revision+1,issue_version=1,issued_at=now(),
      work_period_start=$2::date,work_period_end=$3::date,work_start_time=$4::time,work_end_time=$5::time,
      location_free_text=$6 WHERE id=$1`,
    [id, d.startDate, d.endDate, d.startTime, d.endTime, d.location],
  );
  await auditOrder(client, actor, id, "ISSUE", {
    assessmentId: row.risk_assessment_id,
    issueVersion: 1,
    assigneeIds: d.assigneeIds,
  });
  await client.query("SELECT create_work_sessions($1)", [id]);
}
export async function approveAndIssueOrder(
  client: PoolClient,
  actor: Actor,
  id: string,
  revision: number,
) {
  const row = await writable(client, actor, id, revision);
  if (row.status !== "DRAFT")
    throw new WorkOrderError("작성 중인 지시서만 발급할 수 있습니다.");
  validateIssue(row.draft_data);
  let nextRevision = revision;
  if (!row.risk_assessment_id) {
    await requestAssessment(client, actor, id, nextRevision++);
  }
  if (row.assessment_status !== "APPROVED") {
    await approveAssessment(client, actor, id, nextRevision++, true);
  }
  // Approval and issue share the caller's transaction. A failed issue also
  // rolls back approval, snapshots and delivery records.
  await issueOrder(client, actor, id, nextRevision);
}

export async function cancelOrder(
  client: PoolClient,
  actor: Actor,
  id: string,
  revision: number,
  reason: string,
) {
  const row = await writable(client, actor, id, revision);
  if (
    !["ISSUED", "IN_PROGRESS"].includes(
      effectiveStatus(row.status, row.draft_data),
    )
  )
    throw new WorkOrderError("발급·진행 상태의 지시서만 취소할 수 있습니다.");
  if (!reason.trim() || reason.length > 1000)
    throw new WorkOrderError("취소 사유를 1~1,000자로 입력하세요.");
  await client.query(
    "UPDATE work_orders SET status='CANCELED',cancel_reason=$2,canceled_by=$3,canceled_at=now(),revision=revision+1 WHERE id=$1",
    [id, reason.trim(), actor.userId],
  );
  await auditOrder(client, actor, id, "CANCEL", { previousStatus: row.status });
}

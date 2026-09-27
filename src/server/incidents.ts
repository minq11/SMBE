import type { PoolClient } from "@neondatabase/serverless";
import { memberAccess, type Actor } from "./work-order-service";
import { seoulToday } from "../features/work-orders/model";
import {
  DUTY_LABEL,
  IncidentError,
  dutiesFor,
  gradeOf,
  incidentInputSchema,
  scpaAppliesTo,
  seriousUnderScpa,
  toOccurredAt,
  type Duty,
  type DutyKind,
  type IncidentAction,
  type IncidentDetail,
  type IncidentGrade,
  type IncidentInput,
  type IncidentSummary,
  type Victim,
} from "../features/incidents/model";

/**
 * 안전사고 — 사고 뒤 할 일 목록 (docs/incident-plan.md).
 *
 * 쓰기·읽기 모두 관리자. 등급과 할 일은 서버가 입력에서 정한다 (model.ts 의 순수
 * 함수). 삭제는 없다 — 은폐 금지(산안법 57조 1항). 고치면 감사 로그.
 */

async function manager(client: PoolClient, actor: Actor) {
  return memberAccess(client, actor, true);
}

async function scpaApplies(client: PoolClient, companyId: string) {
  const { rows } = await client.query<{ band: string | null }>(
    "SELECT current_employee_size_band::text AS band FROM companies WHERE id=$1",
    [companyId],
  );
  return scpaAppliesTo(rows[0]?.band);
}

async function audit(
  client: PoolClient,
  actor: Actor,
  action: string,
  incidentId: string,
  after: unknown,
) {
  await client.query(
    `INSERT INTO audit_logs(company_id,actor_id,action,target_type,target_id,after_json)
     VALUES($1,$2,$3,'incidents',$4,$5::jsonb)`,
    [actor.companyId, actor.userId, action, incidentId, JSON.stringify(after)],
  );
}

/** 입력 검증 + 회사 소속 확인(장소·지시서·구성원). */
async function resolveInput(
  client: PoolClient,
  actor: Actor,
  raw: unknown,
): Promise<{
  input: IncidentInput;
  grade: IncidentGrade;
  scpa: boolean;
  seriousScpa: boolean;
  workOrderName: string | null;
  victimNames: Map<string, string>;
}> {
  const parsed = incidentInputSchema.safeParse(raw);
  if (!parsed.success)
    throw new IncidentError(
      parsed.error.issues[0]?.message ?? "입력을 확인하세요.",
    );
  const input = parsed.data;
  if (input.kind === "INJURY" && input.victims.length === 0)
    throw new IncidentError(
      "재해는 다친 사람이 있어야 합니다. 없으면 아차사고로 등록하세요.",
    );
  if (input.kind === "NEAR_MISS") input.victims = [];
  if (
    toOccurredAt(input.occurredOn, input.occurredTime) >
    new Date().toISOString()
  )
    throw new IncidentError("발생 시각이 미래입니다.");

  if (input.locationId) {
    const { rows } = await client.query(
      "SELECT 1 FROM work_locations WHERE id=$1 AND company_id=$2",
      [input.locationId, actor.companyId],
    );
    if (!rows[0]) throw new IncidentError("장소를 찾을 수 없습니다.");
  }
  let workOrderName: string | null = null;
  if (input.workOrderId) {
    const { rows } = await client.query<{ name: string }>(
      "SELECT name FROM work_orders WHERE id=$1 AND company_id=$2",
      [input.workOrderId, actor.companyId],
    );
    if (!rows[0]) throw new IncidentError("연결할 지시서를 찾을 수 없습니다.");
    workOrderName = rows[0].name;
  }
  const victimNames = new Map<string, string>();
  if (input.victims.length) {
    const ids = [...new Set(input.victims.map((v) => v.userId))];
    const { rows } = await client.query<{
      user_id: string;
      display_name: string;
    }>(
      `SELECT m.user_id, u.display_name FROM company_members m JOIN users u ON u.id=m.user_id
        WHERE m.company_id=$1 AND m.user_id = ANY($2::uuid[])`,
      [actor.companyId, ids],
    );
    for (const r of rows) victimNames.set(r.user_id, r.display_name);
    if (victimNames.size !== ids.length)
      throw new IncidentError("다친 사람은 우리 회사 구성원이어야 합니다.");
  }
  for (const a of input.actions)
    if (a.responsibleId) {
      const { rows } = await client.query(
        "SELECT 1 FROM company_members WHERE company_id=$1 AND user_id=$2",
        [actor.companyId, a.responsibleId],
      );
      if (!rows[0]) throw new IncidentError("대책 담당자를 찾을 수 없습니다.");
    }
  const scpa = await scpaApplies(client, actor.companyId);
  return {
    input,
    grade: gradeOf(input.kind, input.victims),
    scpa,
    seriousScpa: seriousUnderScpa(input.kind, input.victims, scpa),
    workOrderName,
    victimNames,
  };
}

async function writeChildren(
  client: PoolClient,
  actor: Actor,
  id: string,
  r: Awaited<ReturnType<typeof resolveInput>>,
) {
  await client.query("DELETE FROM incident_victims WHERE incident_id=$1", [id]);
  for (const [i, v] of r.input.victims.entries())
    await client.query(
      `INSERT INTO incident_victims(incident_id,user_id,name,body_part,injury,expected_leave_days,fatal,treatment_months,hospital,sort_no)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        id,
        v.userId,
        r.victimNames.get(v.userId) ?? "",
        v.bodyPart,
        v.injury,
        v.expectedLeaveDays,
        v.fatal,
        v.treatmentMonths,
        v.hospital,
        i,
      ],
    );

  // 대책은 id 가 있으면 고치고(완료 기록을 지키려고), 없으면 새로, 빠진 것은 지운다.
  const keep = r.input.actions.map((a) => a.id).filter(Boolean) as string[];
  await client.query(
    `DELETE FROM incident_actions WHERE incident_id=$1 AND NOT (id = ANY($2::uuid[]))`,
    [id, keep],
  );
  for (const [i, a] of r.input.actions.entries()) {
    if (a.id) {
      const { rowCount } = await client.query(
        `UPDATE incident_actions SET measure=$3, responsible_user_id=$4, due_on=$5, sort_no=$6
          WHERE id=$1 AND incident_id=$2`,
        [a.id, id, a.measure, a.responsibleId, a.dueOn, i],
      );
      if (rowCount) continue;
    }
    await client.query(
      `INSERT INTO incident_actions(incident_id,measure,responsible_user_id,due_on,sort_no)
       VALUES($1,$2,$3,$4,$5)`,
      [id, a.measure, a.responsibleId, a.dueOn, i],
    );
  }

  // 할 일: 등급이 바뀌면 안 하는 일은 빠지고(끝낸 것은 남긴다) 새 일은 더해진다.
  const duties = dutiesFor(r.grade, r.input.occurredOn, r.scpa);
  const kinds = duties.map((d) => d.kind);
  await client.query(
    `DELETE FROM incident_duties WHERE incident_id=$1 AND done_at IS NULL AND NOT (kind = ANY($2::text[]))`,
    [id, kinds],
  );
  for (const [i, d] of duties.entries())
    await client.query(
      `INSERT INTO incident_duties(incident_id,kind,due_on,sort_no) VALUES($1,$2,$3,$4)
       ON CONFLICT (incident_id, kind) DO UPDATE SET due_on=EXCLUDED.due_on, sort_no=EXCLUDED.sort_no`,
      [id, d.kind, d.dueOn, i],
    );
  await syncPrevention(client, actor, id);
}

/** 재발방지대책이 모두 끝나면 "재발방지대책 이행" 할 일도 끝난다. 하나라도 다시
 *  열리면 할 일도 열린다. 대책이 없으면 손으로 끝낸다. */
async function syncPrevention(client: PoolClient, actor: Actor, id: string) {
  const { rows } = await client.query<{ total: number; done: number }>(
    `SELECT count(*)::int AS total, count(done_at)::int AS done
       FROM incident_actions WHERE incident_id=$1`,
    [id],
  );
  const { total, done } = rows[0];
  if (total === 0) return;
  if (done === total)
    await client.query(
      `UPDATE incident_duties SET done_at=coalesce(done_at, now()), done_by=coalesce(done_by,$2)
        WHERE incident_id=$1 AND kind='PREVENTION'`,
      [id, actor.userId],
    );
  else
    await client.query(
      `UPDATE incident_duties SET done_at=NULL, done_by=NULL
        WHERE incident_id=$1 AND kind='PREVENTION'`,
      [id],
    );
}

export async function createIncident(
  client: PoolClient,
  actor: Actor,
  raw: unknown,
): Promise<string> {
  await manager(client, actor);
  const r = await resolveInput(client, actor, raw);
  const i = r.input;
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO incidents(company_id,kind,occurred_at,location_id,location,location_detail,
       work_order_id,work_order_name,occurrence_type,description,immediate_action,work_stopped,
       evacuated,cause,grade,serious_under_scpa,reported_by,updated_by,retention_until)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17,
            ($3::timestamptz AT TIME ZONE 'Asia/Seoul')::date + interval '3 years')
     RETURNING id`,
    [
      actor.companyId,
      i.kind,
      toOccurredAt(i.occurredOn, i.occurredTime),
      i.locationId,
      i.location,
      i.locationDetail,
      i.workOrderId,
      r.workOrderName,
      i.occurrenceType,
      i.description,
      i.immediateAction,
      i.workStopped,
      i.evacuated,
      i.cause,
      r.grade,
      r.seriousScpa,
      actor.userId,
    ],
  );
  const id = rows[0].id;
  await writeChildren(client, actor, id, r);
  await audit(client, actor, "INCIDENT_CREATE", id, {
    kind: i.kind,
    grade: r.grade,
  });
  return id;
}

async function lockOpen(client: PoolClient, actor: Actor, id: string) {
  const { rows } = await client.query<{ status: string }>(
    "SELECT status FROM incidents WHERE id=$1 AND company_id=$2 FOR UPDATE",
    [id, actor.companyId],
  );
  if (!rows[0]) throw new IncidentError("사고 기록을 찾을 수 없습니다.");
  if (rows[0].status === "CLOSED")
    throw new IncidentError("종결된 사고입니다. 고치려면 먼저 다시 여세요.");
}

export async function updateIncident(
  client: PoolClient,
  actor: Actor,
  id: string,
  raw: unknown,
): Promise<void> {
  await manager(client, actor);
  await lockOpen(client, actor, id);
  const r = await resolveInput(client, actor, raw);
  const i = r.input;
  await client.query(
    `UPDATE incidents SET kind=$3, occurred_at=$4, location_id=$5, location=$6, location_detail=$7,
       work_order_id=$8, work_order_name=$9, occurrence_type=$10, description=$11,
       immediate_action=$12, work_stopped=$13, evacuated=$14, cause=$15, grade=$16,
       serious_under_scpa=$17, updated_by=$2, updated_at=now(),
       retention_until=($4::timestamptz AT TIME ZONE 'Asia/Seoul')::date + interval '3 years'
     WHERE id=$1`,
    [
      id,
      actor.userId,
      i.kind,
      toOccurredAt(i.occurredOn, i.occurredTime),
      i.locationId,
      i.location,
      i.locationDetail,
      i.workOrderId,
      r.workOrderName,
      i.occurrenceType,
      i.description,
      i.immediateAction,
      i.workStopped,
      i.evacuated,
      i.cause,
      r.grade,
      r.seriousScpa,
    ],
  );
  await writeChildren(client, actor, id, r);
  await audit(client, actor, "INCIDENT_UPDATE", id, {
    kind: i.kind,
    grade: r.grade,
  });
}

export async function readIncident(
  client: PoolClient,
  actor: Actor,
  id: string,
): Promise<IncidentDetail> {
  await manager(client, actor);
  const { rows } = await client.query<
    Omit<IncidentDetail, "victims" | "actions" | "duties">
  >(
    `SELECT i.id, i.kind, i.grade, i.serious_under_scpa, i.status, i.occurred_at::text,
            i.location_id, i.location, i.location_detail, i.work_order_id, i.work_order_name,
            wo.standard_id, i.occurrence_type, i.description, i.immediate_action, i.work_stopped, i.evacuated,
            i.cause, rb.display_name AS reported_by_name, i.reported_via,
            i.created_at::text, i.updated_at::text, i.closed_at::text,
            cb.display_name AS closed_by_name
       FROM incidents i
       JOIN users rb ON rb.id = i.reported_by
       LEFT JOIN users cb ON cb.id = i.closed_by
       LEFT JOIN work_orders wo ON wo.id = i.work_order_id
      WHERE i.id=$1 AND i.company_id=$2`,
    [id, actor.companyId],
  );
  const head = rows[0];
  if (!head) throw new IncidentError("사고 기록을 찾을 수 없습니다.");
  const [victims, actions, duties] = await Promise.all([
    client.query<Victim>(
      `SELECT id, user_id, name, body_part, injury, expected_leave_days, fatal, treatment_months, hospital
         FROM incident_victims WHERE incident_id=$1 ORDER BY sort_no`,
      [id],
    ),
    client.query<IncidentAction>(
      `SELECT a.id, a.measure, a.responsible_user_id, ru.display_name AS responsible_name,
              a.due_on::text, a.done_at::text, du.display_name AS done_by_name, a.note
         FROM incident_actions a
         LEFT JOIN users ru ON ru.id = a.responsible_user_id
         LEFT JOIN users du ON du.id = a.done_by
        WHERE a.incident_id=$1 ORDER BY a.sort_no`,
      [id],
    ),
    client.query<Duty>(
      `SELECT d.id, d.kind, d.due_on::text, d.done_at::text, u.display_name AS done_by_name, d.note
         FROM incident_duties d LEFT JOIN users u ON u.id = d.done_by
        WHERE d.incident_id=$1 ORDER BY d.sort_no`,
      [id],
    ),
  ]);
  return {
    ...head,
    victims: victims.rows,
    actions: actions.rows,
    duties: duties.rows,
  };
}

const summarySelect = `
  SELECT i.id, i.kind, i.grade, i.serious_under_scpa, i.status, i.occurred_at::text,
         i.location, i.occurrence_type, left(i.description, 80) AS description,
         (SELECT count(*)::int FROM incident_duties d WHERE d.incident_id=i.id AND d.done_at IS NULL) AS open_duty_count,
         (SELECT min(d.due_on)::text FROM incident_duties d WHERE d.incident_id=i.id AND d.done_at IS NULL) AS next_due_on
    FROM incidents i`;

export async function listIncidents(
  client: PoolClient,
  actor: Actor,
): Promise<IncidentSummary[]> {
  await manager(client, actor);
  const { rows } = await client.query<IncidentSummary>(
    `${summarySelect} WHERE i.company_id=$1 ORDER BY i.occurred_at DESC LIMIT 500`,
    [actor.companyId],
  );
  return rows;
}

export type DueDuty = {
  incident_id: string;
  kind: DutyKind;
  title: string;
  due_on: string;
  overdue: boolean;
  incident_kind: IncidentDetail["kind"];
  occurrence_type: IncidentDetail["occurrence_type"];
  occurred_at: string;
};

export type IncidentOverview = {
  year: number;
  year_injuries: number;
  year_near_misses: number;
  open_duties: number;
  /** 지났거나 7일 안에 오는 할 일. 급한 순. */
  due_soon: DueDuty[];
};

export async function incidentOverview(
  client: PoolClient,
  actor: Actor,
  today = seoulToday(),
): Promise<IncidentOverview> {
  await manager(client, actor);
  const year = Number(today.slice(0, 4));
  const { rows: counts } = await client.query<{
    injuries: number;
    near_misses: number;
    open_duties: number;
  }>(
    `SELECT
       (SELECT count(*)::int FROM incidents WHERE company_id=$1 AND kind='INJURY'
          AND (occurred_at AT TIME ZONE 'Asia/Seoul')::date >= make_date($2,1,1)) AS injuries,
       (SELECT count(*)::int FROM incidents WHERE company_id=$1 AND kind='NEAR_MISS'
          AND (occurred_at AT TIME ZONE 'Asia/Seoul')::date >= make_date($2,1,1)) AS near_misses,
       (SELECT count(*)::int FROM incident_duties d JOIN incidents i ON i.id=d.incident_id
         WHERE i.company_id=$1 AND i.status='OPEN' AND d.done_at IS NULL) AS open_duties`,
    [actor.companyId, year],
  );
  const { rows: due } = await client.query<Omit<DueDuty, "title" | "overdue">>(
    `SELECT d.incident_id, d.kind, d.due_on::text, i.kind AS incident_kind,
            i.occurrence_type, i.occurred_at::text
       FROM incident_duties d JOIN incidents i ON i.id=d.incident_id
      WHERE i.company_id=$1 AND i.status='OPEN' AND d.done_at IS NULL
        AND d.due_on IS NOT NULL AND d.due_on <= $2::date + 7
      ORDER BY d.due_on, d.sort_no LIMIT 20`,
    [actor.companyId, today],
  );
  return {
    year,
    year_injuries: counts[0].injuries,
    year_near_misses: counts[0].near_misses,
    open_duties: counts[0].open_duties,
    due_soon: due.map((d) => ({
      ...d,
      title: DUTY_LABEL[d.kind].title,
      overdue: d.due_on < today,
    })),
  };
}

export async function setDutyDone(
  client: PoolClient,
  actor: Actor,
  input: { incidentId: string; dutyId: string; done: boolean; note: string },
): Promise<void> {
  await manager(client, actor);
  await lockOpen(client, actor, input.incidentId);
  const note = input.note.trim().slice(0, 1000);
  const { rowCount } = await client.query(
    input.done
      ? `UPDATE incident_duties SET done_at=now(), done_by=$3, note=$4 WHERE id=$1 AND incident_id=$2`
      : `UPDATE incident_duties SET done_at=NULL, done_by=NULL, note=$4 WHERE id=$1 AND incident_id=$2 AND $3::uuid IS NOT NULL`,
    [input.dutyId, input.incidentId, actor.userId, note],
  );
  if (!rowCount) throw new IncidentError("할 일을 찾을 수 없습니다.");
  await audit(
    client,
    actor,
    input.done ? "INCIDENT_DUTY_DONE" : "INCIDENT_DUTY_REOPEN",
    input.incidentId,
    {
      dutyId: input.dutyId,
    },
  );
}

export async function setActionDone(
  client: PoolClient,
  actor: Actor,
  input: { incidentId: string; actionId: string; done: boolean; note: string },
): Promise<void> {
  await manager(client, actor);
  await lockOpen(client, actor, input.incidentId);
  const note = input.note.trim().slice(0, 1000);
  const { rowCount } = await client.query(
    input.done
      ? `UPDATE incident_actions SET done_at=now(), done_by=$3, note=$4 WHERE id=$1 AND incident_id=$2`
      : `UPDATE incident_actions SET done_at=NULL, done_by=NULL, note=$4 WHERE id=$1 AND incident_id=$2 AND $3::uuid IS NOT NULL`,
    [input.actionId, input.incidentId, actor.userId, note],
  );
  if (!rowCount) throw new IncidentError("재발방지대책을 찾을 수 없습니다.");
  await syncPrevention(client, actor, input.incidentId);
  await audit(client, actor, "INCIDENT_ACTION_DONE", input.incidentId, {
    actionId: input.actionId,
    done: input.done,
  });
}

export async function closeIncident(
  client: PoolClient,
  actor: Actor,
  id: string,
): Promise<void> {
  await manager(client, actor);
  await lockOpen(client, actor, id);
  const { rows } = await client.query<{ open: number }>(
    `SELECT (SELECT count(*) FROM incident_duties WHERE incident_id=$1 AND done_at IS NULL)
          + (SELECT count(*) FROM incident_actions WHERE incident_id=$1 AND done_at IS NULL) AS open`,
    [id],
  );
  if (Number(rows[0].open) > 0)
    throw new IncidentError(
      "할 일과 재발방지대책을 모두 끝내야 종결할 수 있습니다.",
    );
  await client.query(
    `UPDATE incidents SET status='CLOSED', closed_at=now(), closed_by=$2, updated_by=$2, updated_at=now()
      WHERE id=$1`,
    [id, actor.userId],
  );
  await audit(client, actor, "INCIDENT_CLOSE", id, {});
}

export async function reopenIncident(
  client: PoolClient,
  actor: Actor,
  id: string,
): Promise<void> {
  await manager(client, actor);
  const { rowCount } = await client.query(
    `UPDATE incidents SET status='OPEN', closed_at=NULL, closed_by=NULL, updated_by=$3, updated_at=now()
      WHERE id=$1 AND company_id=$2 AND status='CLOSED'`,
    [id, actor.companyId, actor.userId],
  );
  if (!rowCount) throw new IncidentError("종결된 사고가 아닙니다.");
  await audit(client, actor, "INCIDENT_REOPEN", id, {});
}

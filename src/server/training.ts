import type { PoolClient } from "@neondatabase/serverless";
import { memberAccess, type Actor } from "./work-order-service";
import { WorkOrderError } from "../features/work-orders/model";
import { seoulToday } from "../features/work-orders/model";
import {
  halfOf,
  halfRange,
  type Half,
} from "../features/half-year-check/model";
import {
  REQUIRED_HOURS,
  sessionInputSchema,
  TBM_MINUTE_OPTIONS,
  type PersonTraining,
  type TrainingOverview,
  type TrainingSessionDetail,
  type TrainingSessionRow,
} from "../features/training/model";

const isManagerRole = (role: string) => role !== "WORKER";

/**
 * 사람별 교육 현황. 저장된 "필요" 가 아니라 인원·교육·TBM·PTW 기록에서 그때 센다.
 *  - 채용 시: 1년 안에 들어온 사람에게 기록이 없으면 필요. 오래된 인원은 묻지 않는다
 *    (시스템 전에 들어온 사람까지 빨갛게 하면 전부 빨갛다).
 *  - 정기: 이 반기 정기교육 시간 + TBM 산입 시간. 작업자 12, 관리자 8(연 16의 반).
 *  - 특별: 최근 1년 PTW 작업에 배정됐는데 특별교육 기록이 없으면 확인 대상.
 */
export async function trainingPeople(
  client: PoolClient,
  companyId: string,
  year: number,
  half: Half,
  tbmMinutes: number,
  today = seoulToday(),
): Promise<PersonTraining[]> {
  const [from, to] = halfRange(year, half);
  const rows = await client.query<{
    user_id: string;
    name: string;
    role: string;
    joined_on: string;
    hire_done: boolean;
    regular_hours: string;
    tbm_count: number;
    special_done: boolean;
    ptw_recent: boolean;
  }>(
    `SELECT m.user_id, u.display_name AS name, m.role::text AS role,
            (m.joined_at AT TIME ZONE 'Asia/Seoul')::date::text AS joined_on,
            EXISTS (SELECT 1 FROM training_attendees a JOIN training_sessions s ON s.id = a.session_id
                     WHERE s.company_id = $1 AND a.user_id = m.user_id AND s.kind = 'HIRE') AS hire_done,
            COALESCE((SELECT sum(s.hours) FROM training_attendees a JOIN training_sessions s ON s.id = a.session_id
                     WHERE s.company_id = $1 AND a.user_id = m.user_id AND s.kind = 'REGULAR'
                       AND s.held_on BETWEEN $2::date AND $3::date), 0)::text AS regular_hours,
            (SELECT count(*)::int FROM inspections i JOIN work_sessions ws ON ws.id = i.session_id
              WHERE ws.company_id = $1 AND i.inspector_id = m.user_id AND i.category = 'TBM'
                AND i.submitted_at >= $2::date AND i.submitted_at < ($3::date + 1)) AS tbm_count,
            EXISTS (SELECT 1 FROM training_attendees a JOIN training_sessions s ON s.id = a.session_id
                     WHERE s.company_id = $1 AND a.user_id = m.user_id AND s.kind = 'SPECIAL') AS special_done,
            EXISTS (SELECT 1 FROM work_order_assignments wa JOIN work_orders w ON w.id = wa.work_order_id
                     WHERE w.company_id = $1 AND wa.user_id = m.user_id AND w.ptw_required
                       AND w.issued_at >= ($4::date - 365)) AS ptw_recent
       FROM company_members m JOIN users u ON u.id = m.user_id
      WHERE m.company_id = $1 AND m.status = 'ACTIVE' AND m.left_at IS NULL
      ORDER BY (m.role = 'WORKER'), u.display_name`,
    [companyId, from, to, today],
  );
  const yearAgo = new Date(today + "T00:00:00+09:00");
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const yearAgoIso = yearAgo.toISOString().slice(0, 10);
  return rows.rows.map((r) => {
    const regularHours = Number(r.regular_hours);
    const tbmHours = Math.round(((r.tbm_count * tbmMinutes) / 60) * 10) / 10;
    const required = isManagerRole(r.role)
      ? REQUIRED_HOURS.REGULAR_MANAGER_HALF
      : REQUIRED_HOURS.REGULAR_WORKER_HALF;
    const done = Math.round((regularHours + tbmHours) * 10) / 10;
    return {
      user_id: r.user_id,
      name: r.name,
      role: r.role,
      joined_on: r.joined_on,
      hire: r.hire_done
        ? "DONE"
        : r.joined_on >= yearAgoIso
          ? "MISSING"
          : "OLD",
      regular_hours: regularHours,
      tbm_count: r.tbm_count,
      tbm_hours: tbmHours,
      regular_required: required,
      regular_short: Math.max(0, Math.round((required - done) * 10) / 10),
      special_check: r.ptw_recent && !r.special_done,
      special_done: r.special_done,
    };
  });
}

export async function tbmTrainingMinutes(
  client: PoolClient,
  companyId: string,
) {
  const { rows } = await client.query<{ tbm_training_minutes: number }>(
    "SELECT tbm_training_minutes FROM companies WHERE id = $1",
    [companyId],
  );
  return rows[0]?.tbm_training_minutes ?? 0;
}

export async function trainingOverview(
  client: PoolClient,
  actor: Actor,
  today = seoulToday(),
): Promise<TrainingOverview> {
  await memberAccess(client, actor, true);
  const { year, half } = halfOf(today);
  const [from, to] = halfRange(year, half);
  const tbmMinutes = await tbmTrainingMinutes(client, actor.companyId);
  const people = await trainingPeople(
    client,
    actor.companyId,
    year,
    half,
    tbmMinutes,
    today,
  );
  const sessions = await client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM training_sessions
      WHERE company_id = $1 AND held_on BETWEEN $2::date AND $3::date`,
    [actor.companyId, from, to],
  );
  return {
    year,
    half,
    period: { from, to },
    tbmMinutes,
    people,
    sessionsThisHalf: sessions.rows[0].n,
    regularShortCount: people.filter((p) => p.regular_short > 0).length,
    hireMissingCount: people.filter((p) => p.hire === "MISSING").length,
    specialCheckCount: people.filter((p) => p.special_check).length,
  };
}

/** 반기 점검(5조)이 읽는 숫자. */
export async function trainingFacts(
  client: PoolClient,
  companyId: string,
  year: number,
  half: Half,
) {
  const [from, to] = halfRange(year, half);
  const tbmMinutes = await tbmTrainingMinutes(client, companyId);
  const people = await trainingPeople(
    client,
    companyId,
    year,
    half,
    tbmMinutes,
  );
  const sessions = await client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM training_sessions
      WHERE company_id = $1 AND held_on BETWEEN $2::date AND $3::date`,
    [companyId, from, to],
  );
  return {
    sessions: sessions.rows[0].n,
    regular_short: people.filter((p) => p.regular_short > 0).length,
    hire_missing: people.filter((p) => p.hire === "MISSING").length,
  };
}

export async function listTrainingSessions(
  client: PoolClient,
  actor: Actor,
): Promise<TrainingSessionRow[]> {
  await memberAccess(client, actor, true);
  return (
    await client.query<TrainingSessionRow>(
      `SELECT s.id, s.kind, s.held_on::text, s.hours::float AS hours, s.topic, s.instructor,
              (SELECT count(*)::int FROM training_attendees a WHERE a.session_id = s.id) AS attendee_count
         FROM training_sessions s
        WHERE s.company_id = $1
        ORDER BY s.held_on DESC, s.created_at DESC
        LIMIT 500`,
      [actor.companyId],
    )
  ).rows;
}

export async function readTrainingSession(
  client: PoolClient,
  actor: Actor,
  id: string,
): Promise<TrainingSessionDetail | null> {
  await memberAccess(client, actor, true);
  const { rows } = await client.query<Omit<TrainingSessionDetail, "attendees">>(
    `SELECT s.id, s.kind, s.held_on::text, s.hours::float AS hours, s.topic, s.instructor, s.note,
            u.display_name AS created_by_name, s.created_at::text,
            (SELECT count(*)::int FROM training_attendees a WHERE a.session_id = s.id) AS attendee_count
       FROM training_sessions s JOIN users u ON u.id = s.created_by
      WHERE s.id = $1 AND s.company_id = $2`,
    [id, actor.companyId],
  );
  if (!rows[0]) return null;
  const attendees = (
    await client.query<{ user_id: string; name: string }>(
      `SELECT user_id, snapshot_display_name AS name FROM training_attendees
        WHERE session_id = $1 ORDER BY snapshot_display_name`,
      [id],
    )
  ).rows;
  return { ...rows[0], attendees };
}

export async function createTrainingSession(
  client: PoolClient,
  actor: Actor,
  raw: unknown,
): Promise<{ id: string }> {
  const parsed = sessionInputSchema.safeParse(raw);
  if (!parsed.success)
    throw new WorkOrderError(
      parsed.error.issues[0]?.message ?? "입력값을 확인하세요.",
    );
  const input = parsed.data;
  if (input.heldOn > seoulToday())
    throw new WorkOrderError("아직 오지 않은 날짜입니다.");
  await memberAccess(client, actor, true);
  // 참석자는 우리 회사 사람이어야 한다. 퇴사자도 그날 들었으면 남는다.
  const members = await client.query<{ user_id: string; name: string }>(
    `SELECT m.user_id, u.display_name AS name FROM company_members m JOIN users u ON u.id = m.user_id
      WHERE m.company_id = $1 AND m.user_id = ANY($2::uuid[])`,
    [actor.companyId, input.attendeeIds],
  );
  if (members.rows.length !== new Set(input.attendeeIds).size)
    throw new WorkOrderError(
      "참석자 가운데 우리 회사 사람이 아닌 이가 있습니다.",
    );
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO training_sessions (company_id, kind, held_on, hours, topic, instructor, note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [
      actor.companyId,
      input.kind,
      input.heldOn,
      input.hours,
      input.topic,
      input.instructor,
      input.note,
      actor.userId,
    ],
  );
  const id = rows[0].id;
  for (const m of members.rows)
    await client.query(
      `INSERT INTO training_attendees (session_id, user_id, snapshot_display_name) VALUES ($1, $2, $3)`,
      [id, m.user_id, m.name],
    );
  await client.query(
    `INSERT INTO audit_logs (company_id, actor_id, action, target_type, target_id, path, after_json)
     VALUES ($1, $2, 'TRAINING_CREATE', 'training_session', $3, 'WEB', $4::jsonb)`,
    [
      actor.companyId,
      actor.userId,
      id,
      JSON.stringify({
        kind: input.kind,
        held_on: input.heldOn,
        hours: input.hours,
        attendees: members.rows.length,
      }),
    ],
  );
  return { id };
}

/** 잘못 올린 기록은 지운다. 누가 언제 지웠고 무엇이었는지는 감사 로그에. */
export async function deleteTrainingSession(
  client: PoolClient,
  actor: Actor,
  id: string,
): Promise<void> {
  await memberAccess(client, actor, true);
  const detail = await readTrainingSession(client, actor, id);
  if (!detail) throw new WorkOrderError("교육 기록을 찾을 수 없습니다.");
  await client.query(
    "DELETE FROM training_sessions WHERE id = $1 AND company_id = $2",
    [id, actor.companyId],
  );
  await client.query(
    `INSERT INTO audit_logs (company_id, actor_id, action, target_type, target_id, path, before_json)
     VALUES ($1, $2, 'TRAINING_DELETE', 'training_session', $3, 'WEB', $4::jsonb)`,
    [actor.companyId, actor.userId, id, JSON.stringify(detail)],
  );
}

export async function updateTbmTrainingMinutes(
  client: PoolClient,
  actor: Actor,
  raw: unknown,
): Promise<void> {
  await memberAccess(client, actor, true);
  const minutes = Number(raw);
  if (!(TBM_MINUTE_OPTIONS as readonly number[]).includes(minutes))
    throw new WorkOrderError("TBM 산입 시간을 확인하세요.");
  await client.query(
    "UPDATE companies SET tbm_training_minutes = $2 WHERE id = $1",
    [actor.companyId, minutes],
  );
}

import type { PoolClient } from "@neondatabase/serverless";
import { z } from "zod";
import { lockCompany } from "./membership-mutations";
import { memberAccess, membersForOrder, type Actor } from "./work-order-service";
import { WorkOrderError, seoulToday } from "../features/work-orders/model";
import {
  recentWeeks,
  weekEnd,
  weekStartKst,
} from "../features/meetings/model";

/**
 * 주간 안전점검 회의 (I-03).
 *
 * 상시평가의 "매주 논의·공유·이행점검" 요건을 담는다. 이 회의의 역할은 처리가
 * 아니라 **확인**이다 — 회의에서 체크해도 원본 부적합이나 평가 대책은 종결되지
 * 않는다. 종결은 각 처리 화면의 몫이고, 여기서는 그 주에 무엇을 논의했는지가
 * 남는다. 그래서 수집 항목은 원본에 FK 를 걸지 않고 수집 시점 사본(summary)을
 * 들고 있다 (0014).
 */

const weekSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "주 형식이 올바르지 않습니다.");

export type MeetingItem = {
  id: string;
  source_type: "INSPECTION_FINDING" | "RISK_MEASURE" | "INCIDENT";
  source_id: string;
  summary: string;
  reviewed: boolean;
  note: string;
};
export type MeetingRow = {
  week_start: string;
  meeting_id: string | null;
  status: "DRAFT" | "COMPLETED" | null;
  completed_at: string | null;
  created_by_name: string | null;
  item_count: number;
  reviewed_count: number;
  reminded_at: string | null;
};

function assertWeek(raw: string): string {
  const week = weekSchema.parse(raw);
  if (week !== weekStartKst(new Date(Date.parse(week + "T12:00:00Z"))))
    throw new WorkOrderError("주는 월요일 날짜로만 지정할 수 있습니다.");
  if (week > weekStartKst())
    throw new WorkOrderError("아직 오지 않은 주는 열 수 없습니다.");
  return week;
}

/** 최근 n주. 회의가 없는 주는 meeting_id 가 null 인 채로 남아 "미실시"가 된다. */
export async function listMeetings(
  client: PoolClient,
  actor: Actor,
  weeks = 12,
): Promise<MeetingRow[]> {
  await memberAccess(client, actor, true);
  const wanted = recentWeeks(weeks);
  // 주를 먼저 세우고 회의를 붙인다. 회의 행만 나열하면 미실시 주가 목록에서
  // 사라져, 정작 봐야 할 "빠진 주" 가 안 보인다.
  const { rows } = await client.query<MeetingRow>(
    `SELECT w.week_start::text, m.id AS meeting_id, m.status, m.completed_at::text,
            u.display_name AS created_by_name,
            coalesce((SELECT count(*)::int FROM safety_meeting_items i WHERE i.meeting_id=m.id),0) AS item_count,
            coalesce((SELECT count(*)::int FROM safety_meeting_items i WHERE i.meeting_id=m.id AND i.reviewed),0) AS reviewed_count,
            r.sent_at::text AS reminded_at
       FROM unnest($2::date[]) AS w(week_start)
       LEFT JOIN safety_meetings m
              ON m.company_id=$1 AND m.week_start = w.week_start
       LEFT JOIN users u ON u.id = m.created_by
       LEFT JOIN safety_meeting_reminders r
              ON r.company_id=$1 AND r.week_start = w.week_start
      ORDER BY w.week_start DESC`,
    [actor.companyId, wanted],
  );
  return rows;
}

/**
 * 그 주의 회의를 열고 수집 항목을 채운다.
 *
 * DRAFT 인 동안에는 열 때마다 새로 생긴 항목을 덧붙인다 — 주 중간에 부적합이
 * 나와도 같은 회의에서 다룬다. 확인·비고는 UNIQUE 로 보존된다. 완료된 회의에는
 * 더 붙이지 않는다. 회의가 끝난 뒤 생긴 건은 다음 주 회의의 몫이다.
 */
export async function openMeeting(
  client: PoolClient,
  actor: Actor,
  rawWeek: string,
) {
  const week = assertWeek(rawWeek);
  const end = weekEnd(week);
  await lockCompany(client, actor.companyId);
  await memberAccess(client, actor, true);

  const { rows: existing } = await client.query<{ id: string; status: string }>(
    "SELECT id,status FROM safety_meetings WHERE company_id=$1 AND week_start=$2 FOR UPDATE",
    [actor.companyId, week],
  );
  let id = existing[0]?.id ?? null;
  if (!id) {
    id = (
      await client.query<{ id: string }>(
        `INSERT INTO safety_meetings(company_id,week_start,created_by)
         VALUES ($1,$2,$3) RETURNING id`,
        [actor.companyId, week, actor.userId],
      )
    ).rows[0].id;
  } else if (existing[0].status === "COMPLETED") {
    return id;
  }

  // 그 주에 발생한 점검 부적합 (조치대기·조치완료 모두 — 논의 대상은 발생 사실이다)
  const findings = await client.query<{ id: string; summary: string }>(
    `SELECT f.id, w.name || ' · ' || r.item_text AS summary
       FROM inspection_findings f
       JOIN inspection_results r ON r.id = f.result_id
       JOIN inspections i ON i.id = r.inspection_id
       JOIN work_sessions s ON s.id = i.session_id
       JOIN work_orders w ON w.id = s.work_order_id
      WHERE s.company_id=$1 AND s.work_date BETWEEN $2::date AND $3::date
      ORDER BY s.work_date, f.created_at LIMIT 200`,
    [actor.companyId, week, end],
  );
  // 기한이 그 주까지인데 아직 완료되지 않은 감소대책.
  // 승인된 평가만 본다 — 작성 중인 평가의 대책은 아직 이행 의무가 아니다.
  const measures = await client.query<{ id: string; summary: string }>(
    `SELECT ri.id, a.name || ' · ' || ri.hazard AS summary
       FROM risk_assessment_items ri JOIN risk_assessments a ON a.id = ri.assessment_id
      WHERE a.company_id=$1 AND a.status='APPROVED'
        AND ri.actual_completion_date IS NULL
        AND ri.planned_completion_date IS NOT NULL
        AND ri.planned_completion_date <= $2::date
      ORDER BY ri.planned_completion_date LIMIT 200`,
    [actor.companyId, end],
  );

  for (const [type, rows] of [
    ["INSPECTION_FINDING", findings.rows],
    ["RISK_MEASURE", measures.rows],
  ] as const)
    for (const row of rows)
      await client.query(
        `INSERT INTO safety_meeting_items(meeting_id,source_type,source_id,summary)
         VALUES ($1,$2,$3,$4) ON CONFLICT (meeting_id,source_type,source_id) DO NOTHING`,
        [id, type, row.id, row.summary.slice(0, 500)],
      );
  return id;
}

export async function readMeeting(
  client: PoolClient,
  actor: Actor,
  rawWeek: string,
) {
  const week = assertWeek(rawWeek);
  await memberAccess(client, actor, true);
  const { rows } = await client.query<{
    id: string;
    status: "DRAFT" | "COMPLETED";
    discussion: string;
    completed_at: string | null;
    created_by_name: string;
    completed_by_name: string | null;
  }>(
    `SELECT m.id, m.status, m.discussion, m.completed_at::text,
            c.display_name AS created_by_name, d.display_name AS completed_by_name
       FROM safety_meetings m
       JOIN users c ON c.id = m.created_by
       LEFT JOIN users d ON d.id = m.completed_by
      WHERE m.company_id=$1 AND m.week_start=$2`,
    [actor.companyId, week],
  );
  const meeting = rows[0] ?? null;
  const items = meeting
    ? (
        await client.query<MeetingItem>(
          `SELECT id,source_type,source_id,summary,reviewed,note
             FROM safety_meeting_items WHERE meeting_id=$1 ORDER BY source_type, id`,
          [meeting.id],
        )
      ).rows
    : [];
  const attendees = meeting
    ? (
        await client.query<{ user_id: string; snapshot_display_name: string }>(
          "SELECT user_id,snapshot_display_name FROM safety_meeting_attendees WHERE meeting_id=$1",
          [meeting.id],
        )
      ).rows
    : [];
  const members = await membersForOrder(client, actor.companyId);
  return { week, meeting, items, attendees, members };
}

const itemSchema = z.object({
  itemId: z.string().uuid(),
  reviewed: z.boolean(),
  note: z.string().trim().max(1000),
});

/** 항목별 이행 확인·비고. 원본은 건드리지 않는다 — 이건 회의의 장부다. */
export async function saveMeetingItem(
  client: PoolClient,
  actor: Actor,
  input: unknown,
) {
  const data = itemSchema.parse(input);
  await memberAccess(client, actor, true);
  const { rowCount } = await client.query(
    `UPDATE safety_meeting_items i SET reviewed=$2, note=$3
       WHERE i.id=$1 AND EXISTS (
         SELECT 1 FROM safety_meetings m
          WHERE m.id=i.meeting_id AND m.company_id=$4 AND m.status='DRAFT')`,
    [data.itemId, data.reviewed, data.note, actor.companyId],
  );
  if (!rowCount)
    throw new WorkOrderError(
      "완료된 회의이거나 이 회사의 항목이 아닙니다. 완료 후에는 수정할 수 없습니다.",
    );
}

const completeSchema = z.object({
  week: weekSchema,
  attendeeIds: z.array(z.string().uuid()).min(1).max(200),
  discussion: z.string().trim().max(4000),
});

/**
 * 회의 완료.
 *
 * 참석자만 필수다. 논의 내용은 비워도 된다 — 확인 위주로 수 분 내에 끝나야
 * 매주 돌아가고, 필수 서술을 강요하면 형식적인 한 줄만 남는다. 미확인 항목이
 * 있어도 막지 않고 화면에서 몇 건인지 보여준다.
 */
export async function completeMeeting(
  client: PoolClient,
  actor: Actor,
  input: unknown,
) {
  const data = completeSchema.parse(input);
  const week = assertWeek(data.week);
  await lockCompany(client, actor.companyId);
  await memberAccess(client, actor, true);
  const { rows } = await client.query<{ id: string; status: string }>(
    "SELECT id,status FROM safety_meetings WHERE company_id=$1 AND week_start=$2 FOR UPDATE",
    [actor.companyId, week],
  );
  const meeting = rows[0];
  if (!meeting) throw new WorkOrderError("먼저 회의를 열어야 합니다.");
  if (meeting.status === "COMPLETED")
    throw new WorkOrderError("이미 완료된 회의입니다.");

  const members = await membersForOrder(client, actor.companyId);
  const picked = members.filter((m) => data.attendeeIds.includes(m.user_id));
  if (picked.length !== data.attendeeIds.length)
    throw new WorkOrderError("현재 회사의 활성 구성원만 참석자로 기록합니다.");

  await client.query(
    "DELETE FROM safety_meeting_attendees WHERE meeting_id=$1",
    [meeting.id],
  );
  for (const m of picked)
    await client.query(
      `INSERT INTO safety_meeting_attendees(meeting_id,user_id,snapshot_display_name)
       VALUES ($1,$2,$3)`,
      [meeting.id, m.user_id, m.display_name],
    );
  await client.query(
    `UPDATE safety_meetings
        SET status='COMPLETED', discussion=$2, completed_by=$3, completed_at=clock_timestamp()
      WHERE id=$1`,
    [meeting.id, data.discussion, actor.userId],
  );
  await client.query(
    `INSERT INTO audit_logs(company_id,actor_id,action,target_type,target_id,after_json)
     VALUES ($1,$2,'COMPLETE_SAFETY_MEETING','safety_meetings',$3,$4::jsonb)`,
    [
      actor.companyId,
      actor.userId,
      meeting.id,
      JSON.stringify({ week, attendees: picked.length }),
    ],
  );
  return meeting.id;
}

/**
 * 이번 달 발굴·조치 집계. 상시평가의 월간 요건 근거로 쓰인다.
 * 새 월간 메뉴를 만들지 않고 회의 목록 위에 한 줄로 얹는다.
 */
export async function monthlyTally(client: PoolClient, actor: Actor) {
  await memberAccess(client, actor, true);
  const month = seoulToday().slice(0, 7) + "-01";
  const { rows } = await client.query<{ found: number; resolved: number }>(
    `SELECT
       (SELECT count(*)::int FROM inspection_findings f
          JOIN inspection_results r ON r.id=f.result_id
          JOIN inspections i ON i.id=r.inspection_id
          JOIN work_sessions s ON s.id=i.session_id
         WHERE s.company_id=$1 AND s.work_date >= $2::date) AS found,
       (SELECT count(*)::int FROM inspection_findings f
          JOIN inspection_results r ON r.id=f.result_id
          JOIN inspections i ON i.id=r.inspection_id
          JOIN work_sessions s ON s.id=i.session_id
         WHERE s.company_id=$1 AND f.status='RESOLVED'
           AND f.resolved_at >= $2::date) AS resolved`,
    [actor.companyId, month],
  );
  return { month: month.slice(0, 7), ...rows[0] };
}

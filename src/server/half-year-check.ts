import type { PoolClient } from "@neondatabase/serverless";
import { memberAccess, type Actor } from "./work-order-service";
import { lockCompany } from "./membership-mutations";
import { standardsStatus } from "./assessments";
import { readIncidentManual } from "./company-settings";
import { managerRecipients } from "./safety-meeting-reminders";
import { sendEmail } from "./email";
import { appOrigin } from "./config";
import { WorkOrderError } from "../features/work-orders/model";
import { seoulToday } from "../features/work-orders/model";
import { budgetSchema, budgetTotals } from "../features/safety-policy/model";
import {
  checkInputSchema,
  dueHalf,
  EMPTY_NOTES,
  halfRange,
  notesSchema,
  periodLabel,
  type Half,
  type HalfYearCheck,
  type HalfYearFacts,
} from "../features/half-year-check/model";

/**
 * 경영책임자 반기 점검 (중처법 시행령 4조 2·4·7·8호, 5조).
 *
 * 숫자는 우리 기록에서 센다. 작성 중에는 열 때마다 새로 세고, 확정하면 그 순간의
 * 숫자가 행에 박힌다 — "그때 무엇을 보고 서명했나" 가 남아야 한다.
 */
export async function computeHalfYearFacts(
  client: PoolClient,
  companyId: string,
  year: number,
  half: Half,
): Promise<HalfYearFacts> {
  const [from, to] = halfRange(year, half);
  const p = [companyId, from, to];
  const hazard = (
    await client.query<HalfYearFacts["hazard"]>(
      `SELECT
         (SELECT count(*)::int FROM risk_assessments ra
           WHERE ra.company_id = $1 AND ra.status = 'APPROVED' AND NOT ra.order_copy
             AND ra.performed_on BETWEEN $2::date AND $3::date) AS assessments,
         (SELECT count(*)::int FROM risk_assessment_items i
            JOIN risk_assessments ra ON ra.id = i.assessment_id
           WHERE ra.company_id = $1 AND ra.status = 'APPROVED' AND NOT ra.order_copy AND NOT i.initial_allowable
             AND i.actual_completion_date IS NOT NULL AND i.post_allowable = true) AS actions_done,
         (SELECT count(*)::int FROM risk_assessment_items i
            JOIN risk_assessments ra ON ra.id = i.assessment_id
           WHERE ra.company_id = $1 AND ra.status = 'APPROVED' AND NOT ra.order_copy AND NOT i.initial_allowable
             AND (i.actual_completion_date IS NULL OR i.post_allowable = false)) AS actions_open,
         (SELECT count(*)::int FROM risk_assessments ra
           WHERE ra.company_id = $1 AND ra.status = 'PENDING' AND NOT ra.order_copy) AS pending,
         (SELECT count(*)::int FROM inspection_findings f
            JOIN inspection_results r ON r.id = f.result_id
            JOIN inspections i ON i.id = r.inspection_id
            JOIN work_sessions s ON s.id = i.session_id
           WHERE s.company_id = $1 AND f.status = 'OPEN' AND f.created_at < ($3::date + 1)) AS findings_open,
         (SELECT count(*)::int FROM inspection_findings f
            JOIN inspection_results r ON r.id = f.result_id
            JOIN inspections i ON i.id = r.inspection_id
            JOIN work_sessions s ON s.id = i.session_id
           WHERE s.company_id = $1 AND f.status = 'RESOLVED'
             AND f.resolved_at >= $2::date AND f.resolved_at < ($3::date + 1)) AS findings_resolved`,
      p,
    )
  ).rows[0];
  const { needs } = await standardsStatus(client, companyId);

  const supervisors = (
    await client.query<HalfYearFacts["supervisors"][number]>(
      `SELECT m.user_id, u.display_name AS name,
              (SELECT count(*)::int FROM work_orders w
                WHERE w.company_id = $1 AND w.created_by = m.user_id
                  AND w.issued_at >= $2::date AND w.issued_at < ($3::date + 1)) AS orders_issued,
              (SELECT count(*)::int FROM inspections i JOIN work_sessions s ON s.id = i.session_id
                WHERE s.company_id = $1 AND i.inspector_id = m.user_id AND i.category = 'TBM'
                  AND i.submitted_at >= $2::date AND i.submitted_at < ($3::date + 1)) AS tbm_confirmed,
              (SELECT count(*)::int FROM inspections i JOIN work_sessions s ON s.id = i.session_id
                WHERE s.company_id = $1 AND i.inspector_id = m.user_id AND i.category = 'DURING_WORK'
                  AND i.submitted_at >= $2::date AND i.submitted_at < ($3::date + 1)) AS inspections,
              (SELECT count(*)::int FROM inspection_findings f
                 JOIN inspection_results r ON r.id = f.result_id
                 JOIN inspections i ON i.id = r.inspection_id
                 JOIN work_sessions s ON s.id = i.session_id
                WHERE s.company_id = $1 AND f.resolved_by = m.user_id
                  AND f.resolved_at >= $2::date AND f.resolved_at < ($3::date + 1)) AS findings_resolved
         FROM company_members m JOIN users u ON u.id = m.user_id
        WHERE m.company_id = $1 AND m.status = 'ACTIVE' AND m.left_at IS NULL
          AND m.role IN ('MANAGER_SUPERVISOR', 'MANAGER_SAFETY')
        ORDER BY u.display_name`,
      p,
    )
  ).rows;

  const counts = (
    await client.query<Omit<HalfYearFacts["opinions"], "quotes">>(
      `SELECT
         (SELECT count(*)::int FROM incidents
           WHERE company_id = $1 AND kind = 'NEAR_MISS'
             AND occurred_at >= $2::date AND occurred_at < ($3::date + 1)) AS near_misses,
         (SELECT count(*)::int FROM incidents
           WHERE company_id = $1 AND reported_via = 'WORKER'
             AND occurred_at >= $2::date AND occurred_at < ($3::date + 1)) AS worker_reports,
         (SELECT count(DISTINCT pt.user_id)::int FROM risk_assessment_participants pt
            JOIN risk_assessments ra ON ra.id = pt.assessment_id
           WHERE ra.company_id = $1 AND ra.status = 'APPROVED' AND NOT ra.order_copy
             AND ra.performed_on BETWEEN $2::date AND $3::date) AS participants,
         (SELECT count(*)::int FROM safety_meetings
           WHERE company_id = $1 AND status = 'COMPLETED'
             AND week_start BETWEEN $2::date AND $3::date) AS meetings`,
      p,
    )
  ).rows[0];
  const quotes = (
    await client.query<{ date: string; text: string }>(
      `SELECT performed_on::text AS date, worker_opinion AS text
         FROM risk_assessments
        WHERE company_id = $1 AND status = 'APPROVED' AND NOT order_copy
          AND performed_on BETWEEN $2::date AND $3::date
          AND worker_opinion IS NOT NULL AND btrim(worker_opinion) <> ''
        ORDER BY performed_on DESC LIMIT 5`,
      p,
    )
  ).rows;

  const manualText = await readIncidentManual(client, companyId);
  const policy = (
    await client.query<{ budget: unknown }>(
      "SELECT budget FROM company_safety_policies WHERE company_id = $1 AND year = $2",
      [companyId, year],
    )
  ).rows[0];
  const budget = policy ? budgetSchema.safeParse(policy.budget) : null;
  const duties = (
    await client.query<{ name: string; note: string }>(
      `SELECT u.display_name AS name, m.duty_note AS note
         FROM company_members m JOIN users u ON u.id = m.user_id
        WHERE m.company_id = $1 AND m.status = 'ACTIVE' AND m.left_at IS NULL
          AND btrim(m.duty_note) <> ''
        ORDER BY u.display_name`,
      [companyId],
    )
  ).rows;

  return {
    period: { from, to },
    hazard: { ...hazard, standards_expired: needs.length },
    supervisors,
    opinions: { ...counts, quotes },
    manual: {
      length: manualText.length,
      // 비상연락처가 적혀 있는가 — 010-0000-0000 꼴이 하나라도 있으면.
      has_contact: /0\d{1,2}-?\d{3,4}-?\d{4}/.test(manualText),
    },
    legal: {
      policy_exists: Boolean(policy),
      budget:
        budget?.success && budget.data.items.length > 0
          ? budgetTotals(budget.data)
          : null,
      duties,
    },
  };
}

type Row = {
  status: "DRAFT" | "CONFIRMED";
  facts: unknown;
  notes: unknown;
  representative: string;
  confirmed_on: string | null;
  confirmed_by_name: string | null;
  updated_at: string;
};

async function readRow(
  client: PoolClient,
  companyId: string,
  year: number,
  half: Half,
  lock = false,
) {
  const { rows } = await client.query<Row>(
    `SELECT c.status, c.facts, c.notes, c.representative, c.confirmed_on::text,
            u.display_name AS confirmed_by_name, c.updated_at::text
       FROM company_half_year_checks c LEFT JOIN users u ON u.id = c.confirmed_by
      WHERE c.company_id = $1 AND c.year = $2 AND c.half = $3${lock ? " FOR UPDATE OF c" : ""}`,
    [companyId, year, half],
  );
  return rows[0] ?? null;
}

/** 이 반기의 점검. 행이 없으면 빈 초안에 지금 숫자를 채워 돌려준다. */
export async function readHalfYearCheck(
  client: PoolClient,
  actor: Actor,
  year: number,
  half: Half,
): Promise<HalfYearCheck> {
  await memberAccess(client, actor, true);
  const row = await readRow(client, actor.companyId, year, half);
  const notes = notesSchema.safeParse(row?.notes ?? {});
  const facts =
    row?.status === "CONFIRMED"
      ? (row.facts as HalfYearFacts)
      : await computeHalfYearFacts(client, actor.companyId, year, half);
  return {
    year,
    half,
    status: row?.status ?? "DRAFT",
    facts,
    notes: notes.success ? notes.data : EMPTY_NOTES,
    representative: row?.representative ?? "",
    confirmedOn: row?.confirmed_on ?? null,
    confirmedByName: row?.confirmed_by_name ?? null,
    updatedAt: row?.updated_at ?? null,
  };
}

export async function listHalfYearPeriods(client: PoolClient, actor: Actor) {
  await memberAccess(client, actor, true);
  return (
    await client.query<{
      year: number;
      half: Half;
      status: "DRAFT" | "CONFIRMED";
    }>(
      `SELECT year, half, status FROM company_half_year_checks
        WHERE company_id = $1 ORDER BY year DESC, half DESC`,
      [actor.companyId],
    )
  ).rows;
}

/**
 * 저장(초안) 또는 확정. 확정은 대표자명이 있어야 하고, 그 뒤로는 못 고친다.
 * 지난 반기도 뒤늦게 확정할 수 있다 — 안 한 것보다 늦게라도 한 기록이 낫다.
 */
export async function saveHalfYearCheck(
  client: PoolClient,
  actor: Actor,
  raw: unknown,
  confirm: boolean,
): Promise<void> {
  const parsed = checkInputSchema.safeParse(raw);
  if (!parsed.success)
    throw new WorkOrderError(
      parsed.error.issues[0]?.message ?? "입력값을 확인하세요.",
    );
  const input = parsed.data;
  const [from] = halfRange(input.year, input.half);
  if (from > seoulToday())
    throw new WorkOrderError("아직 시작하지 않은 반기입니다.");
  await lockCompany(client, actor.companyId);
  await memberAccess(client, actor, true);
  const existing = await readRow(
    client,
    actor.companyId,
    input.year,
    input.half,
    true,
  );
  if (existing?.status === "CONFIRMED")
    throw new WorkOrderError("확정된 점검은 고칠 수 없습니다.");
  if (confirm && !input.representative)
    throw new WorkOrderError("확정하려면 대표자명을 입력하세요.");
  const facts = confirm
    ? await computeHalfYearFacts(
        client,
        actor.companyId,
        input.year,
        input.half,
      )
    : {};
  await client.query(
    `INSERT INTO company_half_year_checks
       (company_id, year, half, status, facts, notes, representative, confirmed_on, confirmed_by, updated_by)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10)
     ON CONFLICT (company_id, year, half) DO UPDATE SET
       status = EXCLUDED.status, facts = EXCLUDED.facts, notes = EXCLUDED.notes,
       representative = EXCLUDED.representative, confirmed_on = EXCLUDED.confirmed_on,
       confirmed_by = EXCLUDED.confirmed_by, updated_by = EXCLUDED.updated_by,
       updated_at = clock_timestamp()`,
    [
      actor.companyId,
      input.year,
      input.half,
      confirm ? "CONFIRMED" : "DRAFT",
      JSON.stringify(facts),
      JSON.stringify(input.notes),
      input.representative,
      confirm ? seoulToday() : null,
      confirm ? actor.userId : null,
      actor.userId,
    ],
  );
  if (confirm)
    await client.query(
      `INSERT INTO audit_logs (company_id, actor_id, action, target_type, target_id, path, after_json)
       VALUES ($1, $2, 'HALF_YEAR_CHECK_CONFIRM', 'company', $1, 'WEB', $3::jsonb)`,
      [
        actor.companyId,
        actor.userId,
        JSON.stringify({ year: input.year, half: input.half, facts }),
      ],
    );
}

/** 홈·위험성평가 화면이 묻는다: 지금 챙길 반기가 있고, 아직 확정 전인가. */
export async function halfYearCheckDue(
  client: PoolClient,
  companyId: string,
  today = seoulToday(),
): Promise<{
  year: number;
  half: Half;
  status: "NONE" | "DRAFT" | "CONFIRMED";
} | null> {
  const due = dueHalf(today);
  if (!due) return null;
  const row = await readRow(client, companyId, due.year, due.half);
  return { ...due, status: row?.status ?? "NONE" };
}

export type HalfYearReminderResult = {
  period: string | null;
  companies: number;
  sent: number;
  skipped: number;
  failed: number;
};

/**
 * 반기 마지막 달·그다음 달에 확정 전인 회사의 관리자에게 한 통. 한 반기에 한 번 —
 * 행의 reminded_at 이 장부다. 주간 회의 알림과 같은 cron 이 돌린다.
 */
export async function sendHalfYearCheckReminders(
  client: PoolClient,
  options: { now?: Date } = {},
): Promise<HalfYearReminderResult> {
  const today = seoulToday(options.now);
  const due = dueHalf(today);
  const result: HalfYearReminderResult = {
    period: due ? periodLabel(due.year, due.half) : null,
    companies: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
  };
  if (!due) return result;
  const targets = (
    await client.query<{ id: string; name: string; created_by: string }>(
      `SELECT c.id, c.name, c.created_by FROM companies c
        WHERE c.withdrawn_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM company_half_year_checks h
             WHERE h.company_id = c.id AND h.year = $1 AND h.half = $2
               AND (h.status = 'CONFIRMED' OR h.reminded_at IS NOT NULL))
        ORDER BY c.name`,
      [due.year, due.half],
    )
  ).rows;
  result.companies = targets.length;
  const url = `${appOrigin()}/company/half-year-check?year=${due.year}&half=${due.half}`;
  const label = periodLabel(due.year, due.half);
  for (const company of targets) {
    const people = await managerRecipients(client, company.id);
    for (const person of people) {
      const text = [
        `${company.name} · ${label} 경영책임자 점검`,
        "",
        "중대재해처벌법은 반기마다 위험요인 개선·관리감독자 업무·종사자 의견·대응 절차·법령 이행을",
        "경영책임자가 점검하고 기록하라고 합니다. 우리 기록으로 미리 채워 두었습니다.",
        "확인하고 확정하면 됩니다.",
        "",
        `반기 점검 열기: ${url}`,
      ].join("\n");
      const html =
        `<p><strong>${company.name}</strong> · ${label} 경영책임자 점검</p>` +
        `<p>중대재해처벌법은 반기마다 위험요인 개선·관리감독자 업무·종사자 의견·대응 절차·법령 이행을 경영책임자가 점검하고 기록하라고 합니다. 우리 기록으로 미리 채워 두었습니다. 확인하고 확정하면 됩니다.</p>` +
        `<p><a href="${url}">반기 점검 열기</a></p>`;
      const sent = await sendEmail({
        to: person.email,
        subject: `[심플안전] ${label} 경영책임자 반기 점검을 확정해 주세요`,
        text,
        html,
        idempotencyKey: `half-year-check:${company.id}:${due.year}-${due.half}:${person.email}`,
      });
      if (sent.status === "sent") result.sent += 1;
      else if (sent.status === "skipped") result.skipped += 1;
      else result.failed += 1;
    }
    await client.query(
      `INSERT INTO company_half_year_checks (company_id, year, half, reminded_at, updated_by)
       VALUES ($1, $2, $3, now(), $4)
       ON CONFLICT (company_id, year, half) DO UPDATE SET reminded_at = now()`,
      [company.id, due.year, due.half, company.created_by],
    );
  }
  return result;
}

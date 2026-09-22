import type { PoolClient } from "@neondatabase/serverless";
import { sendEmail } from "./email";
import { appOrigin } from "./config";
import { recentWeeks, weekEnd, weekLabel } from "../features/meetings/model";
import { seoulToday } from "../features/work-orders/model";

/**
 * 미실시 주 안전점검 회의 알림.
 *
 * 상시평가는 **매주** 논의·공유·이행점검을 요구한다. 빠진 주는 화면에 표시되지만
 * 화면을 열어야 보이고, 열지 않는 회사가 정확히 빠뜨리는 회사다. 그래서 메일로
 * 먼저 간다.
 *
 * 받는 사람은 **관리감독자와 안전관리자**다. 그 주의 회의를 실시할 책임이 있는
 * 역할이고, 작업자에게 보내면 자기가 할 수 없는 일을 알리는 셈이 된다.
 *
 * 요금제로 막지 않는다. 안전 알림을 유료 기능으로 두면 중대재해 맥락에서
 * 평판 위험이 있다 (docs/notifications.md).
 */

/** 알림 대상 주: 이미 끝난 주 중 최근 N주. 진행 중인 주는 아직 미실시가 아니다. */
export function reportableWeeks(lookback = 4, now = new Date()): string[] {
  const today = seoulToday(now);
  return recentWeeks(lookback + 1, now).filter((w) => weekEnd(w) < today);
}

type Target = {
  company_id: string;
  company_name: string;
  week_start: string;
};

export async function findMissedWeeks(
  client: PoolClient,
  weeks: string[],
): Promise<Target[]> {
  if (!weeks.length) return [];
  return (
    await client.query<Target>(
      `SELECT c.id AS company_id, c.name AS company_name, w.week_start::text
         FROM companies c
         CROSS JOIN unnest($1::date[]) AS w(week_start)
        WHERE c.withdrawn_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM safety_meetings m
             WHERE m.company_id = c.id AND m.week_start = w.week_start
               AND m.status = 'COMPLETED')
          AND NOT EXISTS (
            SELECT 1 FROM safety_meeting_reminders r
             WHERE r.company_id = c.id AND r.week_start = w.week_start)
        ORDER BY c.name, w.week_start`,
      [weeks],
    )
  ).rows;
}

async function recipients(client: PoolClient, companyId: string) {
  return (
    await client.query<{ email: string; display_name: string }>(
      `SELECT u.email, u.display_name
         FROM company_members m JOIN users u ON u.id = m.user_id
        WHERE m.company_id = $1 AND m.status = 'ACTIVE' AND m.left_at IS NULL
          AND m.role IN ('MANAGER_SUPERVISOR','MANAGER_SAFETY')
          AND u.status = 'ACTIVE' AND u.email IS NOT NULL
        ORDER BY u.display_name LIMIT 50`,
      [companyId],
    )
  ).rows;
}

function body(companyName: string, weeks: string[]) {
  const list = weeks.map(weekLabel);
  const url = appOrigin() + "/meetings";
  const subject =
    weeks.length === 1
      ? `[심플안전] ${list[0]} 주간 안전점검 회의가 실시되지 않았습니다`
      : `[심플안전] 주간 안전점검 회의 미실시 ${weeks.length}주`;
  const text = [
    `${companyName} · 주간 안전점검 회의 미실시 안내`,
    "",
    "아래 주의 회의 기록이 없습니다.",
    ...list.map((label) => `  · ${label}`),
    "",
    "상시 위험성평가는 매주 논의·공유·이행점검 기록을 요구합니다.",
    "지난 주의 점검 부적합과 기한이 지난 감소대책은 회의를 열면 자동으로 모입니다.",
    "",
    `회의 열기: ${url}`,
  ].join("\n");
  const html =
    `<p><strong>${companyName}</strong> · 주간 안전점검 회의 미실시 안내</p>` +
    `<p>아래 주의 회의 기록이 없습니다.</p><ul>` +
    list.map((label) => `<li>${label}</li>`).join("") +
    `</ul><p>상시 위험성평가는 매주 논의·공유·이행점검 기록을 요구합니다. 지난 주의 점검 부적합과 기한이 지난 감소대책은 회의를 열면 자동으로 모입니다.</p>` +
    `<p><a href="${url}">회의 열기</a></p>`;
  return { subject, text, html };
}

export type ReminderResult = {
  companies: number;
  weeks: number;
  sent: number;
  skipped: number;
  failed: number;
};

/**
 * 한 번 돌 때 회사마다 메일 **한 통**을 보내고 밀린 주를 한 번에 나열한다.
 * 배치가 몇 주 멈췄다가 돌아도 받는 사람 입장에서는 한 통이다.
 *
 * 발송 장부는 성공·실패와 무관하게 주 단위로 기록한다. 메일이 실패했다고 매번
 * 다시 보내면 같은 주를 반복해 알리게 되고, 그건 알림이 아니라 소음이다.
 */
export async function sendMissedMeetingReminders(
  client: PoolClient,
  options: { lookback?: number; now?: Date } = {},
): Promise<ReminderResult> {
  const weeks = reportableWeeks(options.lookback ?? 4, options.now);
  const missed = await findMissedWeeks(client, weeks);
  const byCompany = new Map<string, { name: string; weeks: string[] }>();
  for (const row of missed) {
    const entry = byCompany.get(row.company_id) ?? {
      name: row.company_name,
      weeks: [],
    };
    entry.weeks.push(row.week_start);
    byCompany.set(row.company_id, entry);
  }

  const result: ReminderResult = {
    companies: byCompany.size,
    weeks: missed.length,
    sent: 0,
    skipped: 0,
    failed: 0,
  };
  for (const [companyId, entry] of byCompany) {
    const people = await recipients(client, companyId);
    const message = body(entry.name, entry.weeks);
    for (const person of people) {
      const outcome = await sendEmail({
        to: person.email,
        subject: message.subject,
        html: message.html,
        text: message.text,
        idempotencyKey: `meeting-reminder-${companyId}-${entry.weeks[0]}-${person.email}`,
      });
      if (outcome.status === "sent") result.sent += 1;
      else if (outcome.status === "failed") result.failed += 1;
      else result.skipped += 1;
    }
    for (const week of entry.weeks)
      await client.query(
        `INSERT INTO safety_meeting_reminders(company_id,week_start,recipients)
         VALUES ($1,$2,$3) ON CONFLICT (company_id,week_start) DO NOTHING`,
        [companyId, week, people.length],
      );
  }
  return result;
}

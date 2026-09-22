import { timingSafeEqual } from "node:crypto";
import { withTransaction } from "@/server/db";
import { sendMissedMeetingReminders } from "@/server/safety-meeting-reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 미실시 주 안전점검 회의 알림 배치.
 *
 * 앱 안에 스케줄러를 두지 않는다. 컨테이너가 여러 개로 늘어나면 각자 타이머를
 * 돌려 같은 메일을 여러 번 보낸다. 대신 호스트 cron 이 주 1회 이 엔드포인트를
 * 때리고, 중복 방지는 DB 의 (company_id, week_start) 유일 제약이 한다.
 *
 *   0 0 * * 1  curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" \
 *                https://smbe.net/api/cron/meeting-reminders
 *
 * 월요일 자정(KST 09:00)에 돌면 막 끝난 주가 대상이 된다. 배치가 몇 주 멈췄다가
 * 돌아도 밀린 주를 한 통으로 묶어 보낸다.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret ?? ""}`;
  if (
    !secret ||
    secret.length < 32 ||
    Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
  )
    return Response.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );

  const result = await withTransaction((client) =>
    sendMissedMeetingReminders(client),
  );
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}

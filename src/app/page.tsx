import { connection } from "next/server";
import { tierOf } from "@/components/shell/tier";
import { redirect } from "next/navigation";
import { Dashboard, type WorkerHome } from "@/features/dashboard/dashboard";
import { getCurrentSession } from "@/server/session";
import { isCurrentUserOperator } from "@/server/operator";
import { listOrders } from "@/server/work-orders";
import { STATUS_LABEL, seoulToday } from "@/features/work-orders/model";
import {
  inspectionMonitor,
  inspectionSessions,
  pendingFindingCount,
} from "@/server/inspection-service";
import { sessionState } from "@/features/inspections/model";

const at = (value: string) =>
  new Date(value).toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
import { withTransaction } from "@/server/db";

export default async function Home() {
  await connection();

  const session = await getCurrentSession();
  // 로그인 상태여도 소속이 없거나 승인 대기이면 온보딩으로 유도
  if (
    session &&
    (!session.membership || session.membership.status !== "ACTIVE")
  ) {
    redirect("/onboarding");
  }

  const isOperator = session ? await isCurrentUserOperator() : false;
  const openFindingCount =
    session?.membership && session.membership.role !== "WORKER"
      ? await withTransaction((client) =>
          pendingFindingCount(client, {
            companyId: session.membership!.company_id,
            userId: session.user.id,
          }),
        )
      : 0;
  const actor = session?.membership
    ? { companyId: session.membership.company_id, userId: session.user.id }
    : null;
  const isManager = session?.membership?.role !== "WORKER";
  const orders = actor ? await listOrders(actor, "active") : null;
  // 로그인한 홈은 오늘 할 일부터다. 오늘 작업 수, (유료면) TBM 미확인 인원,
  // 작성 중 초안 수를 위에 띄운다. 미조치 부적합은 위에서 이미 셌다.
  const today = seoulToday();
  const todayJobs =
    orders?.rows.filter(
      (row) =>
        row.start_date &&
        row.start_date <= today &&
        (row.end_date ?? row.start_date) >= today,
    ).length ?? 0;
  const drafts =
    actor && isManager ? (await listOrders(actor, "draft")).rows.length : 0;
  const monitor =
    actor && isManager
      ? await withTransaction((client) => inspectionMonitor(client, actor))
      : null;
  // 작업자의 홈은 오늘 회차의 TBM·작업 중 점검으로 바로 가는 카드다. 배정된 작업의
  // 회차를 훑어 오늘 것, 놓친 것, 다음 날짜를 고른다. 회차 상태 판정은 점검 화면과
  // 같은 sessionState 를 쓴다 (야간조의 자정 넘김도 거기서 처리한다).
  const worker: WorkerHome | undefined =
    actor && !isManager && orders
      ? await withTransaction(async (client) => {
          const now = new Date();
          const home: WorkerHome = { today: [], missed: 0, next: null };
          for (const row of orders.rows.slice(0, 30)) {
            const sessions = await inspectionSessions(client, row.id);
            for (const s of sessions) {
              const mine = s.tbm_users.includes(actor.userId);
              const assigned =
                mine ||
                s.expected_assignees.some((a) => a.userId === actor.userId);
              if (!assigned) continue;
              const st = sessionState(s, now);
              if (st.state === "TODAY") {
                home.today.push({
                  id: row.id,
                  name: row.name,
                  location: row.location,
                  time: at(s.starts_at) + " ~ " + at(s.ends_at),
                  tbmDone: mine,
                  duringCount: s.during_count,
                });
              } else if (st.state === "PAST" && !mine) {
                home.missed += 1;
                home.missedOrderId ??= row.id;
              } else if (
                st.state === "FUTURE" &&
                (!home.next || s.work_date < home.next)
              ) {
                home.next = s.work_date;
              }
            }
          }
          return home;
        })
      : undefined;

  return (
    <Dashboard
      companyName={session?.membership?.company_name}
      tier={tierOf(session?.membership)}
      userName={session?.user.displayName ?? undefined}
      isAuthenticated={Boolean(session)}
      isOperator={isOperator}
      isManager={isManager}
      openFindingCount={openFindingCount}
      worker={worker}
      today={
        actor
          ? {
              date: today,
              jobs: todayJobs,
              tbmMissing: monitor?.paid ? monitor.summary.tbmMissing : null,
              drafts,
            }
          : undefined
      }
      jobs={orders?.rows.slice(0, 5).map((row) => ({
        href: "/work-orders/" + row.id,
        title: row.name,
        place: row.location,
        time: (row.start_time ?? "") + " ~ " + (row.end_time ?? ""),
        people: row.assignee_count,
        status: STATUS_LABEL[row.status],
      }))}
    />
  );
}

import { connection } from "next/server";
import { tierOf } from "@/components/shell/tier";
import { redirect } from "next/navigation";
import {
  Dashboard,
  type TodoItem,
  type WorkerHome,
} from "@/features/dashboard/dashboard";
import { assessmentOverview } from "@/server/assessments";
import { incidentOverview } from "@/server/incidents";
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
import { pendingJoinCount } from "@/server/members";
import { activePopupNotices, homePosts } from "@/server/board";
import { NoticePopup } from "@/features/board/notice-popup";
import { PushOptIn } from "@/features/push/push-opt-in";
import { renderDoc } from "@/features/board/model";

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
  const joinRequestCount =
    actor && isManager ? await pendingJoinCount(actor.companyId) : 0;
  const orders = actor ? await listOrders(actor, "active") : null;
  // 로그인한 홈은 오늘 할 일부터다. 오늘 작업 수, (멤버십이면) TBM 미확인 인원,
  // 작성 중 초안 수를 위에 띄운다. 미조치 불량은 위에서 이미 셌다.
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

  // 팝업 공지: 구성원이 홈에 들어올 때 창으로. 숨김(오늘/7일)은 기기가 기억한다.
  const popups = actor
    ? (
        await withTransaction((client) =>
          activePopupNotices(client, actor.companyId),
        )
      ).map((n) => ({
        id: n.id,
        kind: n.kind,
        title: n.title,
        html: renderDoc(n.body),
        published_at: n.published_at,
      }))
    : [];
  // 처리할 일 허브. 메뉴마다 흩어진 "지금 봐야 할 것" 을 한 목록으로.
  const todos: TodoItem[] | undefined =
    actor && isManager
      ? await withTransaction(async (client) => {
          const list: TodoItem[] = [];
          if (joinRequestCount > 0)
            list.push({
              href: "/company/members",
              title: "가입 승인 대기",
              detail: "승인해야 작업에 배정할 수 있습니다.",
              count: `${joinRequestCount}명`,
              state: "승인 대기",
              alert: true,
            });
          if (openFindingCount > 0)
            list.push({
              href: "/inspections",
              title: "내가 처리할 안전조치",
              detail: "나에게 배정된 미조치 불량.",
              count: `${openFindingCount}건`,
              state: "조치 대기",
              alert: true,
            });
          const { rows: permits } = await client.query<{ n: number }>(
            `SELECT count(*)::int AS n FROM work_permits p JOIN work_orders w ON w.id=p.work_order_id
              WHERE p.company_id=$1 AND p.approver_id=$2 AND p.status='PENDING' AND w.status<>'CANCELED'`,
            [actor.companyId, actor.userId],
          );
          if (permits[0].n > 0)
            list.push({
              href: "/permits",
              title: "내 PTW 승인 대기",
              detail: "허가가 나야 위험작업을 시작합니다.",
              count: `${permits[0].n}건`,
              state: "승인 대기",
              alert: true,
            });
          const inc = await incidentOverview(client, actor);
          if (inc.open_duties > 0) {
            const overdue = inc.due_soon.filter((d) => d.overdue).length;
            list.push({
              href: "/incidents",
              title: "사고 뒤 할 일",
              detail: overdue
                ? `기한이 지난 일 ${overdue}개가 있습니다.`
                : "등급에 따라 법이 요구하는 일.",
              count: `${inc.open_duties}개`,
              state: overdue ? "기한 지남" : "처리 중",
              alert: overdue > 0,
            });
          }
          const asmt = await assessmentOverview(client, actor);
          if (asmt.open_action_count > 0)
            list.push({
              href: "/assessments",
              title: "조치 남은 위험요인",
              detail: "감소대책의 실제 조치를 적으세요.",
              count: `${asmt.open_action_count}건`,
              state: "조치 필요",
            });
          if (asmt.needs_assessment.length > 0)
            list.push({
              href: "/assessments",
              title: "위험성평가 필요 표준서",
              detail: "유효한 평가가 없어 지시서에 쓸 수 없습니다.",
              count: `${asmt.needs_assessment.length}건`,
              state: "평가 필요",
              alert: true,
            });
          return list;
        })
      : undefined;
  // 홈의 공지사항·오늘의 안전소식 — 최신 두 건씩, 전체는 통합자료실로.
  const board = actor
    ? await withTransaction((client) => homePosts(client, actor.companyId))
    : undefined;
  const paid = tierOf(session?.membership) === "멤버십";

  return (
    <>
      {popups.length > 0 && <NoticePopup notices={popups} />}
      <Dashboard
        topSlot={actor && paid ? <PushOptIn /> : undefined}
        companyName={session?.membership?.company_name}
        tier={tierOf(session?.membership)}
        userName={session?.user.displayName ?? undefined}
        isAuthenticated={Boolean(session)}
        isOperator={isOperator}
        isManager={isManager}
        openFindingCount={openFindingCount}
        pendingJoinCount={joinRequestCount}
        board={board}
        todos={todos}
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
    </>
  );
}

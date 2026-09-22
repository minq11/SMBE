import { connection } from "next/server";
import { tierOf } from "@/components/shell/tier";
import { redirect } from "next/navigation";
import { Dashboard } from "@/features/dashboard/dashboard";
import { getCurrentSession } from "@/server/session";
import { isCurrentUserOperator } from "@/server/operator";
import { listOrders } from "@/server/work-orders";
import { STATUS_LABEL, seoulToday } from "@/features/work-orders/model";
import {
  inspectionMonitor,
  pendingFindingCount,
} from "@/server/inspection-service";
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

  return (
    <Dashboard
      companyName={session?.membership?.company_name}
      tier={tierOf(session?.membership)}
      userName={session?.user.displayName ?? undefined}
      isAuthenticated={Boolean(session)}
      isOperator={isOperator}
      isManager={isManager}
      openFindingCount={openFindingCount}
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

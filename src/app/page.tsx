import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Dashboard } from "@/features/dashboard/dashboard";
import { getCurrentSession } from "@/server/session";
import { isCurrentUserOperator } from "@/server/operator";
import { listOrders } from "@/server/work-orders";
import { STATUS_LABEL } from "@/features/work-orders/model";
import { pendingFindingCount } from "@/server/inspection-service";
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
  const orders = session?.membership
    ? await listOrders(
        {
          companyId: session.membership.company_id,
          userId: session.user.id,
        },
        "active",
      )
    : null;

  return (
    <Dashboard
      companyName={session?.membership?.company_name}
      userName={session?.user.displayName ?? undefined}
      isAuthenticated={Boolean(session)}
      isOperator={isOperator}
      isManager={session?.membership?.role !== "WORKER"}
      openFindingCount={openFindingCount}
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

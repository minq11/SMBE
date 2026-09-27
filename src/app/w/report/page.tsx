import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { withTransaction } from "@/server/db";
import { LINK_COOKIE, resolveAccessToken } from "@/server/worker-access";
import { WorkerReportForm } from "@/features/incidents/report-form";
import "@/features/work-orders/work-orders.css";
import "@/features/incidents/incidents.css";

export const metadata = { title: "사고 신고 · 심플안전" };

/** 링크로 들어온 작업자의 신고. 그 지시서와 장소가 자동으로 붙는다. */
export default async function LinkReportPage() {
  const token = (await cookies()).get(LINK_COOKIE)?.value;
  const grant = token
    ? await withTransaction((c) => resolveAccessToken(c, token))
    : null;
  if (!grant) redirect("/w/expired");
  const { rows } = await withTransaction((c) =>
    c.query<{ name: string; location: string | null }>(
      "SELECT name, draft_data->>'location' AS location FROM work_orders WHERE id=$1",
      [grant.workOrderId],
    ),
  );

  return (
    <main className="link-work">
      <header className="link-work-head">
        <p className="link-work-greeting">
          <strong>{grant.worker.name}</strong>님
        </p>
        <h1>사고 신고</h1>
        <p className="wo-muted">
          {rows[0]?.name ? `${rows[0].name} 작업 중 생긴 일을 ` : ""}세 칸만
          적으면 관리자에게 바로 갑니다. 다칠 뻔한 일도 알려 주세요.
        </p>
      </header>
      <section className="wo-section">
        <WorkerReportForm
          backHref="/w"
          backLabel="내 작업으로"
          defaultLocation={rows[0]?.location ?? ""}
        />
      </section>
    </main>
  );
}

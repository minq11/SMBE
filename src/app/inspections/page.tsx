import Link from "next/link";
import { Search } from "lucide-react";
import { withTransaction } from "@/server/db";
import { workSession } from "@/server/work-orders";
import { pendingFindings } from "@/server/inspection-service";
import { OrderShell } from "@/features/work-orders/order-shell";
import { FindingResolution } from "@/features/inspections/inspection-form";
import { PageHeader } from "@/components/ui/page-header";
import "@/features/work-orders/work-orders.css";
export default async function InspectionsPage() {
  const { session, actor } = await workSession("/inspections");
  const isManager = session.membership?.role !== "WORKER";
  const findings = isManager
    ? await withTransaction((client) => pendingFindings(client, actor))
    : [];
  return (
    <OrderShell session={session} title="안전점검" active="inspection">
      <PageHeader
        title="안전점검"
        description="작업지시의 회차별 점검과 나에게 배정된 부적합 조치"
      />
      <p>
        <Link className="btn-primary" href="/work-orders">
          <Search size={14} /> 작업 선택 · TBM 및 작업 중 점검
        </Link>
      </p>
      {isManager && (
        <section className="wo-section">
          <h2>
            내 부적합 알림함 ·{" "}
            {findings.length > 100 ? "100+" : findings.length}건
          </h2>
          <p className="wo-muted">
            나에게 지정된 미조치 항목을 오래된 순으로 최대 100건 표시합니다.
            과거 점검 원문 열람 제한과 별개로 미조치 항목은 계속 처리할 수
            있습니다. 이메일·푸시 알림은 아직 제공하지 않습니다.
          </p>
          {!findings.length && <p>처리할 부적합이 없습니다.</p>}
          {findings.slice(0, 100).map((f) => (
            <article className="wo-risk" key={f.id}>
              <h3>{f.item_text}</h3>
              <p>
                {f.order_name} · {f.work_date}
              </p>
              <p className="wo-detail-text">{f.comment || "코멘트 없음"}</p>
              <p>
                <Link href={"/work-orders/" + f.order_id + "/inspections"}>
                  원본 점검 보기 (열람 권한 적용)
                </Link>
              </p>
              <FindingResolution id={f.id} />
            </article>
          ))}
        </section>
      )}
    </OrderShell>
  );
}

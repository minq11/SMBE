import Link from "next/link";
import { workSession } from "@/server/work-orders";
import { query } from "@/server/db";
import { OrderShell } from "@/features/work-orders/order-shell";
import { PermitList } from "@/features/ptw/forms";
import { PERMIT_LABEL, permitStatus } from "@/features/ptw/model";
import { seoulToday, type WorkDraft } from "@/features/work-orders/model";
import "@/features/profile/profile.css";
import "@/features/ptw/ptw.css";
export default async function PermitsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    self?: string;
    status?: string;
    from?: string;
    to?: string;
    applicant?: string;
  }>;
}) {
  const { session, actor } = await workSession("/permits", true);
  const filters = await searchParams;
  const rows = await query<{
    work_order_id: string;
    name: string;
    status: string;
    order_status: string;
    draft_data: WorkDraft;
    revision: number;
    approver_id: string;
    self_approval: boolean;
    approver: string;
    applicant: string;
  }>(
    `SELECT p.work_order_id,w.name,p.status,w.status AS order_status,w.draft_data,p.revision,p.approver_id,p.self_approval,u.display_name AS approver,a.display_name AS applicant FROM work_permits p JOIN work_orders w ON w.id=p.work_order_id JOIN users u ON u.id=p.approver_id JOIN users a ON a.id=p.applicant_id WHERE p.company_id=$1 AND ($3::boolean OR (p.approver_id=$2 AND p.status='PENDING' AND w.status<>'CANCELED')) ORDER BY w.draft_data->>'startDate',p.requested_at`,
    [actor.companyId, actor.userId, filters.tab === "all"],
  );
  const today = seoulToday();
  const visible = rows
    .map((p) => ({
      ...p,
      status: permitStatus(p.status, p.order_status, p.draft_data),
    }))
    .filter(
      (p) =>
        (filters.self !== "1" || p.self_approval) &&
        (!filters.status || p.status === filters.status) &&
        (!filters.from || p.draft_data.endDate >= filters.from) &&
        (!filters.to || p.draft_data.startDate <= filters.to) &&
        (!filters.applicant || p.applicant.includes(filters.applicant)),
    )
    .slice(0, 200);
  return (
    <OrderShell session={session} title="위험작업허가">
      <h1>위험작업허가</h1>
      <nav>
        <Link href="/permits">내 승인 대기</Link> ·{" "}
        <Link href="/permits?tab=all">전체 허가</Link> ·{" "}
        <Link href="/work-orders/new">허가가 필요한 작업 지시하기</Link>
      </nav>
      <form className="account-form account-panel">
        <input type="hidden" name="tab" value={filters.tab ?? ""} />
        <label>
          상태
          <select name="status" defaultValue={filters.status ?? ""}>
            <option value="">전체</option>
            {Object.entries(PERMIT_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          기간 시작
          <input type="date" name="from" defaultValue={filters.from} />
        </label>
        <label>
          기간 종료
          <input type="date" name="to" defaultValue={filters.to} />
        </label>
        <label>
          신청자
          <input
            name="applicant"
            defaultValue={filters.applicant}
            maxLength={100}
          />
        </label>
        <label className="account-confirm">
          <input
            type="checkbox"
            name="self"
            value="1"
            defaultChecked={filters.self === "1"}
          />
          자가 승인 건만
        </label>
        <button className="secondary-button">조회</button>
      </form>
      <p>작업 시작일 순으로 최대 200건 표시합니다.</p>
      {visible.length ? (
        <PermitList
          rows={visible.map((p) => ({
            orderId: p.work_order_id,
            revision: p.revision,
            name: p.name,
            canApprove:
              p.status === "PENDING" &&
              p.approver_id === actor.userId &&
              p.draft_data.startDate >= today,
            summary: `${p.draft_data.startDate} ~ ${p.draft_data.endDate} · ${p.draft_data.location} · ${PERMIT_LABEL[p.status]} · 신청자 ${p.applicant} · 승인자 ${p.approver}${p.self_approval ? " · 자가 승인 건" : ""}${p.status === "PENDING" && p.draft_data.startDate <= today ? (p.draft_data.startDate < today ? " · 승인 기한 경과" : " · 오늘 작업") : ""}`,
          }))}
        />
      ) : (
        <p>표시할 허가가 없습니다.</p>
      )}
    </OrderShell>
  );
}

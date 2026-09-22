import Link from "next/link";
import { ArrowLeft, ArrowRight, Plus, Search } from "lucide-react";
import { workSession, listOrders } from "@/server/work-orders";
import { OrderShell } from "@/features/work-orders/order-shell";
import { PageHeader } from "@/components/ui/page-header";
import { NavSpinner } from "@/components/ui/nav-spinner";
import { STATUS_LABEL } from "@/features/work-orders/model";

export default async function WorkOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; page?: string }>;
}) {
  const { session, actor } = await workSession();
  const params = await searchParams;
  const tab = ["all", "active", "draft"].includes(params.tab ?? "")
    ? params.tab!
    : "all";
  const q = (params.q ?? "").slice(0, 120);
  const page = Math.max(
    1,
    Math.min(100000, Number.parseInt(params.page ?? "1") || 1),
  );
  const result = await listOrders(actor, tab, q, page);
  const href = (p: number) =>
    "/work-orders?" + new URLSearchParams({ tab, q, page: String(p) });
  return (
    <OrderShell session={session} title="작업지시 내역">
      <PageHeader
        title={result.isManager ? "작업지시 내역" : "내 작업"}
        description="작업 정보를 확인하고, 승인된 평가를 바탕으로 지시서를 발급합니다."
        actions={
          result.isManager && (
            <Link className="btn-primary" href="/work-orders/new">
              <Plus size={14} /> 작업 지시하기
              <NavSpinner />
            </Link>
          )
        }
      />
      <nav className="wo-tabs" aria-label="지시서 상태">
        {[
          ["all", "전체"],
          ["active", "예정·진행"],
          ...(result.isManager ? [["draft", "작성 중"]] : []),
        ].map(([key, title]) => (
          <Link
            key={key}
            href={"/work-orders?tab=" + key}
            aria-current={tab === key ? "page" : undefined}
          >
            {title}
            <NavSpinner />
          </Link>
        ))}
      </nav>
      <form className="wo-search">
        <input type="hidden" name="tab" value={tab} />
        <label className="wo-field">
          <span>작업명 검색</span>
          <input name="q" defaultValue={q} maxLength={120} />
        </label>
        <button className="btn-secondary">
          <Search size={14} /> 검색
        </button>
      </form>
      {result.locked > 0 && (
        <p className="wo-notice">
          최근 1주일보다 오래된 지난 기록 {result.locked}건은 유료 요금제에서
          열람할 수 있습니다. 발급·진행 중인 작업은 기간 제한 없이 확인할 수
          있습니다.
        </p>
      )}
      {result.rows.length ? (
        <div className="wo-table-wrap">
          <table className="wo-table">
            <thead>
              <tr>
                <th>작업명</th>
                <th>기간·시간</th>
                <th>장소</th>
                <th>배정</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {/* data-label 은 좁은 화면에서 이 표가 카드로 접힐 때
                  각 칸 앞에 붙는 이름표다 (work-orders.css @media). */}
              {result.rows.map((row) => (
                <tr key={row.id}>
                  <td data-label="작업명">
                    <Link href={"/work-orders/" + row.id}>{row.name}</Link>
                    <small>
                      {row.assessment_status === "APPROVED"
                        ? "평가 승인 완료"
                        : row.assessment_status === "PENDING"
                          ? "평가 승인 대기"
                          : "평가 작성 중"}
                    </small>
                  </td>
                  <td data-label="기간·시간">
                    {row.start_date ?? "일정 미확정"}
                    {row.end_date && " ~ " + row.end_date}
                    <small>
                      {row.start_time && row.start_time + " ~ " + row.end_time}
                    </small>
                  </td>
                  <td data-label="장소">{row.location || "미입력"}</td>
                  <td data-label="배정">{row.assignee_count}명</td>
                  <td data-label="상태">{STATUS_LABEL[row.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="wo-empty">
          <h2>표시할 작업지시가 없습니다.</h2>
          <p>
            {result.isManager
              ? "새 작업을 작성하거나 검색 조건을 바꿔보세요."
              : "관리자가 작업을 발급하고 배정하면 여기에 표시됩니다."}
          </p>
        </div>
      )}
      <nav className="wo-actions" aria-label="페이지 이동">
        {page > 1 && (
          <Link className="btn-secondary" href={href(page - 1)}>
            <ArrowLeft size={14} /> 이전
            <NavSpinner />
          </Link>
        )}
        <span>{page}페이지</span>
        {result.hasMore && (
          <Link className="btn-secondary" href={href(page + 1)}>
            다음 <ArrowRight size={14} />
            <NavSpinner />
          </Link>
        )}
      </nav>
    </OrderShell>
  );
}

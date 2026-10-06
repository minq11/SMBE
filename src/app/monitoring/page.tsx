import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ClipboardCheck, Users, ArrowRight, Search, CreditCard } from "lucide-react";
import { withTransaction } from "@/server/db";
import { workSession } from "@/server/work-orders";
import { inspectionMonitor } from "@/server/inspection-service";
import { OrderShell } from "@/features/work-orders/order-shell";
import { FloatField, FloatSelect } from "@/components/ui/float-field";
import { PageHeader } from "@/components/ui/page-header";
import { HelpDialog } from "@/components/ui/help-dialog";
import { Pager } from "@/components/ui/pager";
import { pageOf, parsePage } from "@/lib/paging";
import { PERMIT_LABEL } from "@/features/ptw/model";
import "@/features/work-orders/work-orders.css";

export const metadata = { title: "점검 모니터링 · 심플안전" };

const at = (value: string) =>
  new Date(value).toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

export default async function MonitoringPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; location?: string; page?: string }>;
}) {
  const filters = await searchParams;
  const { session, actor } = await workSession("/monitoring", true);
  if (session.membership?.role === "WORKER") notFound();
  const data = await withTransaction((c) =>
    inspectionMonitor(c, actor, {
      date: filters.date,
      location: filters.location,
    }),
  );
  const paged = pageOf(data.rows, parsePage(filters.page));

  return (
    <OrderShell session={session} title="점검 모니터링" active="monitoring">
      <PageHeader title="점검 모니터링" />

      {!data.paid ? (
        <section className="wo-section">
          <h2>유료 요금제 기능입니다</h2>
          <p className="wo-muted">
            오늘 누가 TBM 을 안 찍었고 어느 작업에 점검이 없는지, 한 화면에서.
          </p>
          <p className="wo-actions">
            <Link className="btn-primary" href="/billing">
              <CreditCard size={14} /> 요금제 보기
            </Link>
            <Link className="go-link" href="/inspections">
              점검 기록 <ArrowRight size={14} />
            </Link>
          </p>
        </section>
      ) : (
        <>
          <form className="account-form account-panel wo-log-filter">
            <FloatField
              id="monitor-filter-date"
              className="float-field--flush"
              label="날짜"
              type="date"
              name="date"
              defaultValue={data.date}
            />
            <FloatSelect
              id="monitor-filter-location"
              className="float-field--flush"
              label="장소"
              name="location"
              defaultValue={filters.location ?? ""}
            >
              <option value="">전체</option>
              {data.locations.map((place) => (
                <option key={place} value={place}>
                  {place}
                </option>
              ))}
            </FloatSelect>
            <button className="btn-secondary" type="submit">
              <Search size={14} /> 조회
            </button>
            <Link className="go-link" href="/monitoring">
              오늘로 <ArrowRight size={14} />
            </Link>
          </form>

          <section className="monitor-summary" aria-label="누락 요약">
            <div>
              <span className="monitor-summary-icon">
                <Users size={16} />
              </span>
              <strong>{data.summary.tbmMissing}명</strong>
              <small>TBM 미확인</small>
            </div>
            <div>
              <span className="monitor-summary-icon">
                <ClipboardCheck size={16} />
              </span>
              <strong>{data.summary.duringMissing}건</strong>
              <small>작업 중 점검 없는 작업</small>
            </div>
            <div>
              <span className="monitor-summary-icon">
                <AlertTriangle size={16} />
              </span>
              <strong>{data.summary.openFindings}건</strong>
              <small>미조치 불량 (전체 기간)</small>
            </div>
          </section>

          <section className="wo-section">
            <div className="wo-section-head">
              <h2>
                {data.date} 작업 {data.summary.sessions}건
              </h2>
              <HelpDialog title="점검 모니터링" variant="icon">
                <dl className="help-rows">
                  <dt>완료</dt>
                  <dd>배정 인원 전원 TBM + 작업 중 점검 1건 이상이면 이행 완료.</dd>
                  <dt>불량</dt>
                  <dd>미조치 불량은 작업일과 무관하게 남아, 요약은 전체 기간을 셉니다.</dd>
                </dl>
              </HelpDialog>
            </div>
            {!data.summary.sessions && <p>이 날짜에 도는 작업이 없습니다.</p>}
            <ul className="monitor-list" role="list">
              {paged.rows.map((row) => {
                const done =
                  row.expected_assignees.length > 0 &&
                  !row.missing.length &&
                  row.during_count > 0;
                return (
                  <li
                    key={row.session_id}
                    className={
                      "monitor-row" + (done ? " is-done" : " is-pending")
                    }
                  >
                    <div className="monitor-row-main">
                      <Link href={"/work-orders/" + row.order_id}>
                        {row.order_name}
                      </Link>
                      <p className="wo-muted">
                        {at(row.starts_at)} ~ {at(row.ends_at)} ·{" "}
                        {row.location || "장소 미입력"}
                      </p>
                      <p>
                        TBM {row.expected_assignees.length - row.missing.length}
                        /{row.expected_assignees.length}명 · 작업 중{" "}
                        {row.during_count}건 · {done ? "이행 완료" : "미이행"}
                        {row.open_findings > 0 &&
                          ` · 미조치 ${row.open_findings}건`}
                      </p>
                      {row.missing.length > 0 && (
                        <p className="monitor-missing">
                          미확인: {row.missing.join(", ")}
                        </p>
                      )}
                      {row.ptw_required && row.permit_status !== "APPROVED" && (
                        <p className="monitor-missing">
                          PTW{" "}
                          {row.permit_status
                            ? (PERMIT_LABEL[row.permit_status] ??
                              row.permit_status)
                            : "미신청"}
                        </p>
                      )}
                    </div>
                    <Link
                      className="go-link"
                      href={
                        "/work-orders/" +
                        row.order_id +
                        "/inspections?session=" +
                        row.session_id
                      }
                    >
                      점검 보기 <ArrowRight size={14} />
                    </Link>
                  </li>
                );
              })}
            </ul>
            <Pager
              page={paged.page}
              pageCount={paged.pageCount}
              hrefFor={(n) => {
                const q = new URLSearchParams();
                if (filters.date) q.set("date", filters.date);
                if (filters.location) q.set("location", filters.location);
                if (n > 1) q.set("page", String(n));
                const qs = q.toString();
                return "/monitoring" + (qs ? "?" + qs : "");
              }}
            />
          </section>
        </>
      )}
    </OrderShell>
  );
}

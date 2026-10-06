import Link from "next/link";
import { ChevronDown, Search, ArrowRight } from "lucide-react";
import { seoulToday, validDate } from "@/features/work-orders/model";
import { withTransaction } from "@/server/db";
import { workSession } from "@/server/work-orders";
import {
  pendingFindings,
  companyInspectionLog,
} from "@/server/inspection-service";
import { OrderShell } from "@/features/work-orders/order-shell";
import { FindingResolution } from "@/features/inspections/inspection-form";
import { InspectionLog } from "@/features/inspections/log-list";
import { PageHeader } from "@/components/ui/page-header";
import { HelpDialog } from "@/components/ui/help-dialog";
import { Pager } from "@/components/ui/pager";
import { pageOf, parsePage } from "@/lib/paging";
import { FloatField } from "@/components/ui/float-field";
import "@/features/work-orders/work-orders.css";

const at = (value: string) =>
  new Date(value).toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

/** 기본 조회 기간. 오늘까지 4주 — 한 달치 누락을 한 번에 훑는다. */
const DEFAULT_DAYS = 28;
const shiftDay = (day: string, days: number) =>
  new Date(new Date(day + "T00:00:00Z").getTime() + days * 86400000)
    .toISOString()
    .slice(0, 10);
const md = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(8))}`;

export default async function InspectionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    q?: string;
    fpage?: string;
  }>;
}) {
  const filters = await searchParams;
  const { session, actor } = await workSession("/inspections");
  const isManager = session.membership?.role !== "WORKER";
  // 기간은 서버가 한 번 거르고, 오늘·이번 주·미이행 같은 칩은 받은 목록을 화면에서
  // 거른다 (features/inspections/log-list.tsx). 날짜가 비면 오늘까지 4주.
  const today = seoulToday();
  const custom = Boolean(filters.from || filters.to || filters.q);
  const from =
    filters.from && validDate(filters.from)
      ? filters.from
      : shiftDay(today, -(DEFAULT_DAYS - 1));
  const to = filters.to && validDate(filters.to) ? filters.to : today;
  const period = custom ? `${md(from)} ~ ${md(to)}` : "최근 4주";
  const [findings, log] = await Promise.all([
    isManager
      ? withTransaction((client) => pendingFindings(client, actor))
      : Promise.resolve([]),
    isManager
      ? withTransaction((client) =>
          companyInspectionLog(client, actor, { from, to, q: filters.q }),
        )
      : Promise.resolve({ rows: [], limited: false }),
  ]);
  const rows = log.rows.map((r) => ({
    ...r,
    time: `${at(r.starts_at)} ~ ${at(r.ends_at)}`,
  }));
  const findingPage = pageOf(findings.slice(0, 100), parsePage(filters.fpage));
  const findingHref = (n: number) => {
    const q = new URLSearchParams();
    for (const k of ["from", "to", "q"] as const)
      if (filters[k]) q.set(k, filters[k]);
    if (n !== 1) q.set("fpage", String(n));
    const qs = q.toString();
    return "/inspections" + (qs ? "?" + qs : "");
  };

  return (
    <OrderShell session={session} title="안전점검" active="inspection">
      <PageHeader
        title="안전점검"
        actions={
          <div className="wo-actions">
            {isManager && (
              <Link className="go-link" href="/meetings">
                주간 안전점검 회의 <ArrowRight size={14} />
              </Link>
            )}
            <Link className="btn-primary" href="/work-orders">
              <Search size={14} /> 작업 선택 · TBM 및 작업 중 점검
            </Link>
          </div>
        }
      />

      {isManager && (
        <InspectionLog rows={rows} today={today} limited={log.limited}>
          <details className="wo-filter-details" open={custom}>
            <summary>
              <ChevronDown size={14} aria-hidden="true" />
              <span className="wo-period">{period}</span>
              기간·작업명으로 자세히 찾기
            </summary>
            {/* account-form 은 빼 둔다 — 그 입력칸 규칙이 float-field 보다 세다. */}
            <form className="account-panel wo-log-filter">
              <FloatField
                id="inspections-filter-from"
                className="float-field--flush"
                label="시작일"
                type="date"
                name="from"
                defaultValue={from}
              />
              <FloatField
                id="inspections-filter-to"
                className="float-field--flush"
                label="종료일"
                type="date"
                name="to"
                defaultValue={to}
              />
              <label>
                작업명
                <input
                  type="search"
                  name="q"
                  maxLength={100}
                  defaultValue={filters.q ?? ""}
                  placeholder="작업명 일부"
                  enterKeyHint="search"
                />
              </label>
              <button className="btn-secondary" type="submit">
                <Search size={14} /> 조회
              </button>
              <Link className="go-link" href="/inspections">
                초기화 <ArrowRight size={14} />
              </Link>
            </form>
          </details>
        </InspectionLog>
      )}

      {isManager && (
        <section className="wo-section">
          <div className="wo-section-head">
            <h2>
              내 불량 알림함 ·{" "}
              {findings.length > 100 ? "100+" : findings.length}건
            </h2>
            <HelpDialog title="내 불량 알림함" variant="icon">
              <dl className="help-rows">
                <dt>무엇</dt>
                <dd>나에게 지정된 미조치 항목. 오래된 순으로 최대 100건.</dd>
                <dt>언제</dt>
                <dd>
                  지난 점검의 열람 제한과 상관없이 처리할 수 있습니다. 홈의
                  처리할 일에도 같이 보입니다.
                </dd>
                <dt>알림</dt>
                <dd>이메일·푸시는 아직 없습니다. 이 화면과 홈에서 확인.</dd>
              </dl>
            </HelpDialog>
          </div>
          {!findings.length && <p>처리할 불량이 없습니다.</p>}
          {findingPage.rows.map((f) => (
            <article className="wo-risk" key={f.id}>
              <h3>{f.item_text}</h3>
              <p>
                {f.order_name} · {f.work_date}
              </p>
              <p className="wo-detail-text">{f.comment || "코멘트 없음"}</p>
              <p>
                <Link href={"/work-orders/" + f.order_id + "/inspections"}>
                  원본 점검 보기
                </Link>
              </p>
              <FindingResolution id={f.id} />
            </article>
          ))}
          <Pager
            page={findingPage.page}
            pageCount={findingPage.pageCount}
            hrefFor={findingHref}
          />
        </section>
      )}
    </OrderShell>
  );
}

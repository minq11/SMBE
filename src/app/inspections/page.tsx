import Link from "next/link";
import { CalendarCheck, Search } from "lucide-react";
import { withTransaction } from "@/server/db";
import { workSession } from "@/server/work-orders";
import {
  pendingFindings,
  companyInspectionLog,
  type LogRow,
} from "@/server/inspection-service";
import { OrderShell } from "@/features/work-orders/order-shell";
import { FindingResolution } from "@/features/inspections/inspection-form";
import { PageHeader } from "@/components/ui/page-header";
import "@/features/work-orders/work-orders.css";

const at = (value: string) =>
  new Date(value).toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
  });

const STATE_OPTIONS = [
  ["", "전체"],
  ["MISSING", "누락 회차만"],
  ["DONE", "완료 회차만"],
  ["FAIL", "미조치 부적합 있음"],
  ["BACKFILLED", "사후 입력 포함"],
] as const;

/** 회차 한 줄이 이행됐는가 — 배정 전원 TBM + 작업 중 1건 이상. */
function done(r: LogRow) {
  return r.expected > 0 && r.tbm_done >= r.expected && r.during_count > 0;
}

export default async function InspectionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    q?: string;
    state?: string;
  }>;
}) {
  const filters = await searchParams;
  const { session, actor } = await workSession("/inspections");
  const isManager = session.membership?.role !== "WORKER";
  type LogState = (typeof STATE_OPTIONS)[number][0];
  const state: LogState = (STATE_OPTIONS.find(
    ([v]) => v === filters.state,
  )?.[0] ?? "") as LogState;
  const [findings, log] = await Promise.all([
    isManager
      ? withTransaction((client) => pendingFindings(client, actor))
      : Promise.resolve([]),
    isManager
      ? withTransaction((client) =>
          companyInspectionLog(client, actor, {
            from: filters.from,
            to: filters.to,
            q: filters.q,
            state,
          }),
        )
      : Promise.resolve({ rows: [], locked: 0, limited: false }),
  ]);

  return (
    <OrderShell session={session} title="안전점검" active="inspection">
      <PageHeader
        title="안전점검"
        description="회사 전체의 회차별 점검 이행 현황과 나에게 배정된 부적합 조치"
      />
      <p className="wo-actions">
        <Link className="btn-primary" href="/work-orders">
          <Search size={14} /> 작업 선택 · TBM 및 작업 중 점검
        </Link>
        {isManager && (
          <Link className="btn-secondary" href="/meetings">
            <CalendarCheck size={14} /> 주간 안전점검 회의
          </Link>
        )}
      </p>

      {isManager && (
        <section className="wo-section">
          <h2>점검 기록 · 회차 {log.rows.length}건</h2>
          <p className="wo-muted">
            배정 인원 전원 TBM + 작업 중 점검 1건 이상이면 이행 완료입니다.
            회차를 열면 작업자별 기록과 관리자 사후 입력·수정을 할 수 있습니다.
          </p>
          <form className="account-form account-panel wo-log-filter">
            <label>
              시작일
              <input type="date" name="from" defaultValue={filters.from ?? ""} />
            </label>
            <label>
              종료일
              <input type="date" name="to" defaultValue={filters.to ?? ""} />
            </label>
            <label>
              작업명
              <input
                name="q"
                maxLength={100}
                defaultValue={filters.q ?? ""}
                placeholder="작업명 일부"
              />
            </label>
            <label>
              상태
              <select name="state" defaultValue={state}>
                {STATE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn-secondary" type="submit">
              조회
            </button>
            <Link className="btn-secondary" href="/inspections">
              초기화
            </Link>
          </form>

          {!log.rows.length && <p>조건에 맞는 회차가 없습니다.</p>}
          {log.rows.map((r) => (
            <article className="wo-risk wo-log-row" key={r.session_id}>
              <h3>
                <Link
                  href={
                    "/work-orders/" +
                    r.order_id +
                    "/inspections?session=" +
                    r.session_id
                  }
                >
                  {r.work_date} · {r.order_name}
                </Link>
              </h3>
              <p className="wo-muted">
                {at(r.starts_at)} ~ {at(r.ends_at)}
              </p>
              <p>
                TBM {r.tbm_done}/{r.expected}명 · 작업 중 {r.during_count}건 ·{" "}
                {done(r) ? "이행 완료" : "미이행"}
              </p>
              <p>
                부적합 {r.total_findings}건
                {r.open_findings > 0 && ` · 미조치 ${r.open_findings}건`}
                {r.backfilled > 0 && ` · 사후 입력 ${r.backfilled}건`}
              </p>
            </article>
          ))}
          {log.limited && (
            <p className="wo-muted">
              200건까지만 표시합니다. 기간을 좁혀 조회하세요.
            </p>
          )}
          {log.locked > 0 && (
            <p className="wo-muted">
              무료 요금제는 최근 1주일만 열람할 수 있습니다. 이전 회차{" "}
              {log.locked}건은 보관되어 있으며 유료 전환 시 다시 열립니다.
            </p>
          )}
        </section>
      )}

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

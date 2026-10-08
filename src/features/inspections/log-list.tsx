"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import type { LogRow } from "@/server/inspection-service";
import { ClientPager } from "@/components/ui/pager-client";
import { HelpDialog } from "@/components/ui/help-dialog";
import { useToast } from "@/components/ui/toast";
import { MembershipLink } from "@/components/ui/paid-lock";
import { pageOf } from "@/lib/paging";
import { LOG_CHIPS, isDone, matchesChip, type LogChip } from "./log-filter";

/** 서버가 시각을 글자로 만들어 보낸다 — 브라우저마다 다르게 찍히지 않게. */
export type LogListRow = LogRow & { time: string };

/**
 * 점검 기록 목록. 받은 회차를 칩으로 화면에서만 거르고 10건씩 넘긴다.
 * 잠긴 회차(무료의 1주일 밖)는 날짜·작업명만 보이고, 누르면 멤버십 안내가 잠깐 뜬다.
 */
export function InspectionLog({
  rows,
  today,
  limited,
  children,
}: {
  rows: LogListRow[];
  today: string;
  limited: boolean;
  /** 기간·작업명 자세히 찾기 (서버 폼). 칩 아래에 놓인다. */
  children?: ReactNode;
}) {
  const [chip, setChip] = useState<LogChip>("all");
  const [page, setPage] = useState(1);
  const { show, toast } = useToast();
  const shown = rows.filter((r) => matchesChip(r, chip, today));
  const current = pageOf(shown, page);
  const pick = (next: LogChip) => {
    setChip(next);
    setPage(1);
  };
  const lockedTap = () =>
    show(
      <>
        지난 기록은 멤버십에 가입된 회사만 열 수 있습니다. 무료는 최근 1주일까지.{" "}
        <MembershipLink />
      </>,
    );

  return (
    <section className="wo-section">
      <div className="wo-section-head">
        <h2>점검 기록 · 회차 {shown.length}건</h2>
        <HelpDialog title="점검 기록" variant="icon">
          <dl className="help-rows">
            <dt>무엇</dt>
            <dd>회사 전체의 회차별 점검 이행 현황. 한 줄이 한 회차.</dd>
            <dt>완료</dt>
            <dd>배정 인원 전원 TBM + 작업 중 점검 1건 이상이면 이행 완료.</dd>
            <dt>열면</dt>
            <dd>작업자별 기록과 관리자 사후 입력·수정.</dd>
          </dl>
        </HelpDialog>
      </div>
      <div className="wo-presets" role="group" aria-label="빠른 필터">
        {LOG_CHIPS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={chip === key}
            onClick={() => pick(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {children}
      {!shown.length && <p>조건에 맞는 회차가 없습니다.</p>}
      {current.rows.map((r) =>
        r.locked ? (
          // 카드 어디를 눌러도 안내가 뜬다. 안의 단추는 키보드·읽기 도구의 자리이고
          // 누름은 카드로 올라와 한 번만 처리된다.
          <article
            className="wo-risk wo-log-row is-locked"
            key={r.session_id}
            onClick={lockedTap}
          >
            <h3>
              <button type="button" className="wo-log-lock">
                <Lock size={14} aria-hidden="true" />
                {r.work_date} · {r.order_name}
              </button>
            </h3>
            <p className="wo-muted">{r.time}</p>
          </article>
        ) : (
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
            <p className="wo-muted">{r.time}</p>
            <p>
              TBM {r.tbm_done}/{r.expected}명 · 작업 중 {r.during_count}건 ·{" "}
              {isDone(r) ? "이행 완료" : "미이행"}
            </p>
            <p>
              불량 {r.total_findings}건
              {r.open_findings > 0 && ` · 미조치 ${r.open_findings}건`}
              {r.backfilled > 0 && ` · 사후 입력 ${r.backfilled}건`}
            </p>
          </article>
        ),
      )}
      <ClientPager
        page={current.page}
        pageCount={current.pageCount}
        onPage={setPage}
      />
      {limited && (
        <p className="wo-muted">200건까지만 표시합니다. 기간을 좁혀 조회하세요.</p>
      )}
      {toast}
    </section>
  );
}

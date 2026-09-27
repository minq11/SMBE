"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, TriangleAlert } from "lucide-react";
import { ClientPager } from "@/components/ui/pager-client";
import { pageOf } from "@/lib/paging";
import {
  GRADE_LABEL,
  GRADE_TONE,
  incidentTitle,
  shortDay,
  type IncidentSummary,
} from "./model";

type Tab = "all" | "open" | "closed";

/**
 * 사고 목록. 위험성평가 목록과 같은 틀: 탭(전체·처리 중·종결) → 행 → 쪽 넘기기.
 * 행의 오른쪽은 등급과 남은 할 일 — 지금 봐야 할 것.
 */
export function IncidentsListView({ items }: { items: IncidentSummary[] }) {
  const [tab, setTab] = useState<Tab>("all");
  const [page, setPage] = useState(1);
  const pick = (t: Tab) => {
    setTab(t);
    setPage(1);
  };
  const open = items.filter((i) => i.status === "OPEN");
  const closed = items.filter((i) => i.status === "CLOSED");
  const filtered = tab === "all" ? items : tab === "open" ? open : closed;
  const paged = pageOf(filtered, page);

  return (
    <div className="stack">
      <div className="tabs" role="tablist" aria-label="사고 상태">
        {(
          [
            ["all", "전체", items.length],
            ["open", "처리 중", open.length],
            ["closed", "종결", closed.length],
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`tab${tab === key ? " is-active" : ""}${key === "open" && count > 0 ? " has-highlight" : ""}`}
            onClick={() => pick(key)}
          >
            {label}
            <span className="tab-count">{count}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="panel">
          <div className="empty-state">
            <span className="empty-state-icon">
              <TriangleAlert size={22} />
            </span>
            <strong>
              {tab === "all"
                ? "등록된 사고가 없어요"
                : "해당하는 사고가 없어요"}
            </strong>
            <p>
              {tab === "all"
                ? "아차사고도 기록하세요. 다치기 전에 고칠 기회입니다."
                : "다른 탭을 확인하세요."}
            </p>
          </div>
        </div>
      ) : (
        <ul className="row-list" role="list">
          {paged.rows.map((i) => (
            <li key={i.id}>
              <Link href={`/incidents/${i.id}`} className="row">
                <span className="row-main">
                  <strong>{incidentTitle(i)}</strong>
                  <small>
                    {shortDay(i.occurred_at)} · {i.location || "장소 미입력"}
                  </small>
                </span>
                <span className="row-meta">
                  <span className="inc-grade" data-tone={GRADE_TONE[i.grade]}>
                    {GRADE_LABEL[i.grade]}
                    {i.serious_under_scpa ? " · 중대산업재해" : ""}
                  </span>
                  {i.status === "CLOSED" ? (
                    <span className="inc-tag inc-tag--ok">종결</span>
                  ) : i.open_duty_count > 0 ? (
                    <span className="inc-tag inc-tag--open">
                      할 일 {i.open_duty_count}
                    </span>
                  ) : (
                    <span className="inc-tag inc-tag--ok">종결 가능</span>
                  )}
                </span>
                <ChevronRight size={14} className="row-chev" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <ClientPager
        page={paged.page}
        pageCount={paged.pageCount}
        onPage={setPage}
      />
    </div>
  );
}

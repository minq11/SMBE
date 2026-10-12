"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, GraduationCap } from "lucide-react";
import { ClientPager } from "@/components/ui/pager-client";
import { pageOf } from "@/lib/paging";
import {
  fmtHours,
  KIND_LABEL,
  TRAINING_KINDS,
  type TrainingKind,
  type TrainingSessionRow,
} from "./model";

type Tab = "all" | TrainingKind;

/** 교육 기록 목록. 탭(전체·종류) → 행 → 쪽 넘기기. 칩은 화면에서 거른다. */
export function TrainingListView({ items }: { items: TrainingSessionRow[] }) {
  const [tab, setTab] = useState<Tab>("all");
  const [page, setPage] = useState(1);
  const pick = (t: Tab) => {
    setTab(t);
    setPage(1);
  };
  const filtered = tab === "all" ? items : items.filter((i) => i.kind === tab);
  const paged = pageOf(filtered, page);
  return (
    <div className="stack">
      <div className="tabs" role="tablist" aria-label="교육 종류">
        {(
          [
            ["all", "전체", items.length],
            ...TRAINING_KINDS.map(
              (k) =>
                [
                  k,
                  KIND_LABEL[k],
                  items.filter((i) => i.kind === k).length,
                ] as const,
            ),
          ] as ReadonlyArray<readonly [Tab, string, number]>
        ).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`tab${tab === key ? " is-active" : ""}`}
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
            <GraduationCap className="empty-state-icon" size={28} />
            <strong>아직 교육 기록이 없습니다.</strong>
            <p>교육을 한 날 바로 등록하면 이수 명부와 교육일지가 됩니다.</p>
          </div>
        </div>
      ) : (
        <ul className="row-list" role="list">
          {paged.rows.map((item) => (
            <li key={item.id}>
              <Link href={`/training/${item.id}`} className="row">
                <span className="row-main">
                  <strong>{item.topic}</strong>
                  <small>
                    {KIND_LABEL[item.kind]} · {fmtHours(item.hours)} · 참석{" "}
                    {item.attendee_count}명
                    {item.instructor ? ` · ${item.instructor}` : ""}
                  </small>
                </span>
                <span className="row-meta">
                  <span className="row-fact">{item.held_on}</span>
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

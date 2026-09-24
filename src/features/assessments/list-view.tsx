"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ClipboardList, FileText, ShieldCheck } from "lucide-react";
import type { AssessmentRow } from "@/server/assessments";
import { KIND_SHORT, STATUS_LABEL, shortDate } from "./model";

type Tab = "all" | "valid" | "action" | "expired";

/**
 * 평가 목록. 한 행이 평가 하나다. 표준서 회차와 지시서 간이평가가 섞여 있고
 * 출처는 행 안에 적는다. 탭은 "지금 봐야 할 것" 순 — 조치 필요, 만료.
 */
export function AssessmentsListView({ items }: { items: AssessmentRow[] }) {
  const [tab, setTab] = useState<Tab>("all");
  const buckets = {
    valid: items.filter((i) => i.status === "APPROVED" && !i.expired),
    action: items.filter(
      (i) => i.status === "APPROVED" && !i.expired && i.open_action_count > 0,
    ),
    expired: items.filter((i) => i.expired),
  };
  const filtered =
    tab === "all"
      ? items
      : tab === "valid"
        ? buckets.valid
        : tab === "action"
          ? buckets.action
          : buckets.expired;

  return (
    <div className="stack">
      <div className="tabs" role="tablist" aria-label="위험성평가 상태">
        <TabBtn
          label="전체"
          count={items.length}
          active={tab === "all"}
          onClick={() => setTab("all")}
        />
        <TabBtn
          label="유효"
          count={buckets.valid.length}
          active={tab === "valid"}
          onClick={() => setTab("valid")}
        />
        <TabBtn
          label="조치 필요"
          count={buckets.action.length}
          active={tab === "action"}
          highlight={buckets.action.length > 0}
          onClick={() => setTab("action")}
        />
        <TabBtn
          label="만료"
          count={buckets.expired.length}
          active={tab === "expired"}
          onClick={() => setTab("expired")}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="panel">
          <div className="empty-state">
            <span className="empty-state-icon">
              <ShieldCheck size={22} />
            </span>
            <strong>
              {tab === "all" ? "아직 위험성평가가 없어요" : "해당하는 위험성평가가 없어요"}
            </strong>
            <p>
              {tab === "all"
                ? "표준서를 만들면 최초 위험성평가가 같이 등록됩니다. 표준서 없는 작업은 지시서에서 간이평가로 기록합니다."
                : "다른 탭을 확인하세요."}
            </p>
          </div>
        </div>
      ) : (
        <ul className="row-list" role="list">
          {filtered.map((a) => (
            <li key={a.id}>
              <Link href={`/assessments/${a.id}`} className="row">
                <span className="std-row-icon">
                  {a.is_simple ? (
                    <ClipboardList size={16} />
                  ) : (
                    <FileText size={16} />
                  )}
                </span>
                <span className="row-main">
                  <strong>{a.name}</strong>
                  <small>
                    {KIND_SHORT[a.kind]} 위험성평가 · {shortDate(a.performed_on)} ·{" "}
                    {a.is_simple ? "지시서 간이 위험성평가" : "표준서"} · 위험요인{" "}
                    {a.item_count}
                  </small>
                </span>
                <span className="row-meta">
                  {a.status !== "APPROVED" ? (
                    <span className="asmt-tag asmt-tag--pending">
                      {STATUS_LABEL[a.status]}
                    </span>
                  ) : a.expired ? (
                    <span className="asmt-tag asmt-tag--expired">만료</span>
                  ) : a.open_action_count > 0 ? (
                    <span className="asmt-tag asmt-tag--action">
                      조치 {a.open_action_count}건 남음
                    </span>
                  ) : (
                    <span className="asmt-tag asmt-tag--ok">
                      {a.valid_until ? `~${shortDate(a.valid_until)}` : "상시"}
                    </span>
                  )}
                </span>
                <ArrowRight size={14} className="row-chev" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TabBtn({
  label,
  count,
  active,
  highlight = false,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  highlight?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`tab${active ? " is-active" : ""}${highlight ? " has-highlight" : ""}`}
      onClick={onClick}
    >
      {label}
      <span className="tab-count">{count}</span>
    </button>
  );
}

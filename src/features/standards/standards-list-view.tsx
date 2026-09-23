"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  FileText,
} from "lucide-react";
import type { StandardListRow } from "@/features/standards/constants";

type Tab = "all" | "active" | "draft" | "archived";

export function StandardsListView({ items }: { items: StandardListRow[] }) {
  const [tab, setTab] = useState<Tab>("all");

  const buckets = {
    active: items.filter((i) => i.status === "APPROVED"),
    draft: items.filter((i) => i.status === "DRAFT"),
    archived: items.filter((i) => i.status === "ARCHIVED"),
  };

  const filtered =
    tab === "all"
      ? items
      : tab === "active"
        ? buckets.active
        : tab === "draft"
          ? buckets.draft
          : buckets.archived;

  return (
    <>
      <div className="stack">
        <div className="tabs" role="tablist" aria-label="표준서 상태">
          <TabBtn
            label="전체"
            count={items.length}
            active={tab === "all"}
            onClick={() => setTab("all")}
          />
          <TabBtn
            label="확정됨"
            count={buckets.active.length}
            active={tab === "active"}
            onClick={() => setTab("active")}
          />
          <TabBtn
            label="작성 중"
            count={buckets.draft.length}
            active={tab === "draft"}
            onClick={() => setTab("draft")}
          />
          <TabBtn
            label="폐기"
            count={buckets.archived.length}
            active={tab === "archived"}
            onClick={() => setTab("archived")}
          />
        </div>

        {filtered.length === 0 ? (
          <div className="panel">
            <div className="empty-state">
              <span className="empty-state-icon">
                <FileText size={22} />
              </span>
              <strong>표준서가 없어요</strong>
              <p>
                반복 작업의 방법·체크리스트·위험성평가를 한 번 등록하면 이후
                지시서 작성 시 바로 재사용할 수 있습니다. 위 [표준서 만들기] 로
                시작하세요.
              </p>
            </div>
          </div>
        ) : (
          <ul className="row-list" role="list">
            {filtered.map((item) => (
              <li key={item.standard_id}>
                <Link href={`/standards/${item.standard_id}`} className="row">
                  <span className="std-row-icon">
                    {item.status === "APPROVED" ? (
                      <CheckCircle2 size={16} />
                    ) : item.status === "DRAFT" ? (
                      <ClipboardList size={16} />
                    ) : (
                      <FileText size={16} />
                    )}
                  </span>
                  <span className="row-main">
                    <strong>{item.name}</strong>
                    <small>
                      {item.status === "APPROVED"
                        ? `${item.usable ? "사용 가능" : "평가 만료 · 정기평가 필요"}${item.ptw_required ? " · PTW 필요" : ""} · 평가 회차 ${item.approved_assessment_count}건`
                        : item.status === "DRAFT"
                          ? "작성 중"
                          : "폐기됨"}
                    </small>
                  </span>
                  <span className="row-meta">
                    <span className="row-fact">
                      {item.latest_approved_performed_on
                        ? `최근 평가 ${new Date(item.latest_approved_performed_on).toLocaleDateString("ko-KR")}`
                        : `수정 ${new Date(item.updated_at).toLocaleDateString("ko-KR")}`}
                    </span>
                  </span>
                  <ArrowRight size={14} className="row-chev" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function TabBtn({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`tab${active ? " is-active" : ""}`}
      onClick={onClick}
    >
      {label}
      <span className="tab-count">{count}</span>
    </button>
  );
}

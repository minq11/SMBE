"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MessageSquare, TriangleAlert, X } from "lucide-react";
import type { AssessmentReferences } from "@/server/assessment-references";
import {
  GRADE_LABEL,
  KIND_LABEL,
  OCCURRENCE_LABEL,
} from "@/features/incidents/model";
import { koDate } from "@/features/assessments/model";

type Tab = "incidents" | "opinions";

/**
 * 위험요인을 찾을 때 참고할 우리 회사 기록 — 과거 사고·아차사고, 작업자 의견(TBM·점검의
 * 불량·코멘트·종합의견). 단추 둘이 창을 연다. 표준서가 있으면 그 표준서로 발급한
 * 지시서의 기록을 앞에 "이 표준서" 표시로 모은다. 기록으로 가는 링크는 새 창 — 쓰던 폼을
 * 잃지 않는다.
 */
export function ReferencePanel({
  references,
  standardId,
}: {
  references: AssessmentReferences;
  standardId?: string | null;
}) {
  const [tab, setTab] = useState<Tab | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (tab && !el.open) el.showModal();
    else if (!tab && el.open) el.close();
  }, [tab]);
  const close = () => setTab(null);
  const mine = (sid: string | null) =>
    Boolean(standardId && sid === standardId);
  const incidents = [...references.incidents].sort(
    (a, b) => Number(mine(b.standard_id)) - Number(mine(a.standard_id)),
  );
  const opinions = [...references.opinions].sort(
    (a, b) => Number(mine(b.standard_id)) - Number(mine(a.standard_id)),
  );
  const count = (n: number, m: number) =>
    standardId && m > 0 ? `${m} · 전체 ${n}` : String(n);
  const mineIncidents = incidents.filter((i) => mine(i.standard_id)).length;
  const mineOpinions = opinions.filter((o) => mine(o.standard_id)).length;

  return (
    <>
      {/* 단추가 아니라 글 한 줄 — "참고 자료 · 과거 사고 n · 작업자 의견 n". 누르면 창. */}
      <p className="ref-row" role="group" aria-label="참고 자료">
        <span className="ref-row-label">참고 자료</span>
        <button
          type="button"
          className="ref-link-btn"
          onClick={() => setTab("incidents")}
        >
          <TriangleAlert size={13} aria-hidden="true" /> 과거 사고·아차사고{" "}
          <b>{count(incidents.length, mineIncidents)}</b>
        </button>
        <span className="ref-sep" aria-hidden="true">
          ·
        </span>
        <button
          type="button"
          className="ref-link-btn"
          onClick={() => setTab("opinions")}
        >
          <MessageSquare size={13} aria-hidden="true" /> 작업자 의견{" "}
          <b>{count(opinions.length, mineOpinions)}</b>
        </button>
      </p>
      <dialog
        ref={ref}
        className="law-dialog ref-dialog"
        aria-labelledby="ref-dialog-title"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClose={close}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        {tab && (
          <div className="reason-dialog-body">
            <button
              type="button"
              className="reason-dialog-close"
              onClick={close}
              aria-label="닫기"
            >
              <X size={20} />
            </button>
            <p className="public-kicker">참고 자료</p>
            <h2 id="ref-dialog-title">
              {tab === "incidents" ? "과거 사고·아차사고" : "작업자 의견"}
            </h2>
            <p className="ref-lead">
              {tab === "incidents"
                ? "우리 회사에서 실제로 났던 일입니다. 같은 위험요인이 이 작업에도 있는지 보세요."
                : "TBM·작업 중 점검에서 작업자가 불량으로 고르거나 적은 말, 그리고 종합의견입니다."}
            </p>
            {tab === "incidents" ? (
              incidents.length === 0 ? (
                <p className="wo-muted">등록된 사고·아차사고가 없습니다.</p>
              ) : (
                <ul className="ref-list" role="list">
                  {incidents.map((i) => (
                    <li key={i.id}>
                      <div className="ref-item-head">
                        {mine(i.standard_id) && (
                          <span className="ref-tag">이 표준서</span>
                        )}
                        <span
                          className="inc-grade"
                          data-tone={i.kind === "INJURY" ? "danger" : "info"}
                        >
                          {KIND_LABEL[i.kind]} · {GRADE_LABEL[i.grade]}
                        </span>
                        <small>
                          {koDate(i.occurred_at)} ·{" "}
                          {i.location || "장소 미입력"}
                        </small>
                      </div>
                      <Link
                        href={`/incidents/${i.id}`}
                        target="_blank"
                        rel="noopener"
                      >
                        {OCCURRENCE_LABEL[i.occurrence_type]} — {i.description}
                      </Link>
                    </li>
                  ))}
                </ul>
              )
            ) : opinions.length === 0 ? (
              <p className="wo-muted">
                아직 작업자 의견이 없습니다. TBM·점검에서 불량을 고르거나
                종합의견을 적으면 여기 모입니다.
              </p>
            ) : (
              <ul className="ref-list" role="list">
                {opinions.map((o) => (
                  <li key={o.kind + o.id}>
                    <div className="ref-item-head">
                      {mine(o.standard_id) && (
                        <span className="ref-tag">이 표준서</span>
                      )}
                      <span
                        className="inc-grade"
                        data-tone={
                          o.result === "FAIL"
                            ? "danger"
                            : o.kind === "OVERALL"
                              ? "info"
                              : "plain"
                        }
                      >
                        {o.kind === "OVERALL"
                          ? "종합의견"
                          : o.result === "FAIL"
                            ? "불량"
                            : "코멘트"}
                        {" · "}
                        {o.category === "TBM" ? "TBM" : "작업 중"}
                      </span>
                      <small>
                        {koDate(o.at)} · {o.who}
                      </small>
                    </div>
                    <p className="ref-text">{o.text}</p>
                    <Link
                      href={`/work-orders/${o.order_id}/inspections`}
                      target="_blank"
                      rel="noopener"
                      className="ref-link"
                    >
                      {o.order_name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="law-dialog-actions">
              <button type="button" className="btn-secondary" onClick={close}>
                닫기
              </button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}

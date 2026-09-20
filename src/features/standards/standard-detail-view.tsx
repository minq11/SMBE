"use client";

import { useTransition } from "react";
import Link from "next/link";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  CircleAlert,
  Pencil,
  Plus,
  ShieldCheck,
} from "lucide-react";
import type { StandardDetail } from "@/server/standards-service";
import { ASSESSMENT_KIND_LABEL } from "@/server/standards-service";
import { archiveStandardAction } from "./actions";

const RISK_LABEL = { HIGH: "상", MID: "중", LOW: "하" } as const;

export function StandardDetailView({ detail }: { detail: StandardDetail }) {
  const [pending, startTransition] = useTransition();

  const onArchive = () => {
    if (
      !confirm(
        `${detail.name} 을 폐기할까요? 폐기된 표준서는 새 지시서 작성에서 선택할 수 없습니다. 기존에 발급된 지시서에는 영향이 없습니다.`,
      )
    )
      return;
    startTransition(async () => {
      const form = new FormData();
      form.set("standard_id", detail.standard_id);
      await archiveStandardAction(form);
    });
  };

  const active = detail.status === "APPROVED";
  const archived = detail.status === "ARCHIVED";
  const current = detail.current_assessment;
  const noValid = !current || current.expired;

  return (
    <>
      <Link href="/standards" className="text-button std-back-link">
        <ArrowLeft size={13} /> 표준서 목록
      </Link>

      <header className="std-detail-hero">
        <div>
          <span className="std-detail-tag">
            {active ? "사용 중" : archived ? "폐기" : "작성 중"}
            {detail.ptw_required ? " · PTW 필요" : ""}
          </span>
          <h1>{detail.name}</h1>
          <p className="std-detail-meta">
            생성 {new Date(detail.created_at).toLocaleDateString("ko-KR")} · 최근
            수정 {new Date(detail.updated_at).toLocaleDateString("ko-KR")}
          </p>
        </div>
        <div className="std-detail-actions">
          {active && !noValid && (
            <Link
              href={`/work-orders/new?standard=${detail.standard_id}`}
              className="primary-button"
            >
              <ShieldCheck size={14} /> 이 표준서로 지시서 작성
              <ArrowRight size={13} />
            </Link>
          )}
          {!archived && (
            <Link
              href={`/standards/${detail.standard_id}/edit`}
              className="ghost-button"
            >
              <Pencil size={13} /> 수정
            </Link>
          )}
          {!archived && (
            <Link
              href={`/standards/${detail.standard_id}/assessments/new`}
              className="ghost-button"
            >
              <Plus size={13} /> 평가 회차 추가
            </Link>
          )}
          {!archived && (
            <button
              type="button"
              className="ghost-button ghost-button--danger"
              onClick={onArchive}
              disabled={pending}
            >
              <Archive size={13} /> 폐기
            </button>
          )}
        </div>
      </header>

      {active && noValid && (
        <div className="std-warn-banner" role="alert">
          <CircleAlert size={16} />
          <div>
            <strong>유효한 위험성평가가 없거나 만료됐습니다.</strong>
            <p>
              지시서 발급에 사용하려면{" "}
              <Link href={`/standards/${detail.standard_id}/assessments/new`}>
                정기평가 회차를 새로 등록
              </Link>{" "}
              하세요. 산안법상 정기평가는 매년, 최초평가는 3년마다 실시가
              권장됩니다.
            </p>
          </div>
        </div>
      )}

      {current && !current.expired && (
        <div className="std-info-banner">
          <ShieldCheck size={16} />
          <div>
            <strong>
              현재 사용 중 평가: {ASSESSMENT_KIND_LABEL[current.kind]} (
              {new Date(current.performed_on).toLocaleDateString("ko-KR")})
            </strong>
            <p>
              유효기간{" "}
              {current.valid_until
                ? `${new Date(current.valid_until).toLocaleDateString("ko-KR")}까지`
                : "상시"}{" "}
              — 지시서 발급 시 이 평가가 스냅샷으로 복사됩니다.
            </p>
          </div>
        </div>
      )}

      <section className="std-detail-section">
        <h2>작업 단계</h2>
        {detail.steps.length > 0 ? (
          <ol className="std-detail-list">
            {detail.steps.map((s) => (
              <li key={s.order_no}>{s.step_text}</li>
            ))}
          </ol>
        ) : (
          <p className="std-form-note">등록된 단계가 없습니다.</p>
        )}
      </section>

      <section className="std-detail-section">
        <h2>체크리스트</h2>
        <div className="std-detail-checklist">
          <div>
            <span className="std-detail-sublabel">작업 전 (TBM)</span>
            <ul>
              {detail.checklist_tbm.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </div>
          <div>
            <span className="std-detail-sublabel">작업 중</span>
            <ul>
              {detail.checklist_during.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {current && (
        <section className="std-detail-section">
          <h2>현재 사용 중 위험성평가</h2>
          {current.criteria && (
            <div className="std-detail-note">
              <span className="std-detail-sublabel">위험성 판단 기준</span>
              <p>{current.criteria}</p>
            </div>
          )}
          <dl className="std-detail-info">
            <div>
              <dt>설비</dt>
              <dd>{current.safety_info.equipment}</dd>
            </div>
            <div>
              <dt>물질</dt>
              <dd>{current.safety_info.materials}</dd>
            </div>
            <div>
              <dt>주변 환경</dt>
              <dd>{current.safety_info.environment}</dd>
            </div>
            <div>
              <dt>재해·아차사고</dt>
              <dd>{current.safety_info.history}</dd>
            </div>
          </dl>
          <div className="std-detail-risks">
            <span className="std-detail-sublabel">위험요인 · 감소대책</span>
            <ol>
              {current.risks.map((r) => (
                <li key={r.order_no} className="std-detail-risk">
                  <p className="std-detail-risk-head">
                    <strong>{r.hazard}</strong>
                    <span
                      className={`std-detail-risk-badge std-detail-risk-badge--${r.initial_risk_level.toLowerCase()}`}
                    >
                      {RISK_LABEL[r.initial_risk_level]}
                    </span>
                    <span className="std-detail-risk-allow">
                      {r.initial_allowable ? "허용 가능" : "허용 불가"}
                    </span>
                  </p>
                  <p className="std-detail-risk-measure">
                    → {r.reduction_measure}
                  </p>
                </li>
              ))}
            </ol>
          </div>
          {current.participant_names.length > 0 && (
            <p className="std-detail-participants">
              <span className="std-detail-sublabel">평가 참여자</span>
              <span>{current.participant_names.join(", ")}</span>
            </p>
          )}
        </section>
      )}

      <section className="std-detail-section">
        <h2>위험성평가 회차 이력 ({detail.assessments.length}건)</h2>
        {detail.assessments.length === 0 ? (
          <p className="std-form-note">등록된 평가가 없습니다.</p>
        ) : (
          <ul className="std-assessment-history" role="list">
            {detail.assessments.map((a) => (
              <li
                key={a.assessment_id}
                className={`std-assessment-row${a.is_current ? " is-current" : ""}${
                  a.expired ? " is-expired" : ""
                }`}
              >
                <span className="std-assessment-kind">
                  {ASSESSMENT_KIND_LABEL[a.kind]}
                </span>
                <span className="std-assessment-date">
                  실시일{" "}
                  {new Date(a.performed_on).toLocaleDateString("ko-KR")}
                </span>
                {a.valid_until && (
                  <span className="std-assessment-valid">
                    유효 ~{" "}
                    {new Date(a.valid_until).toLocaleDateString("ko-KR")}
                  </span>
                )}
                <span
                  className={`std-assessment-status std-assessment-status--${a.status.toLowerCase()}`}
                >
                  {a.status === "APPROVED"
                    ? "승인"
                    : a.status === "PENDING"
                      ? "승인 대기"
                      : a.status === "DRAFT"
                        ? "작성 중"
                        : "반려"}
                </span>
                {a.is_current && (
                  <span className="std-assessment-badge std-assessment-badge--current">
                    현재 사용 중
                  </span>
                )}
                {a.expired && (
                  <span className="std-assessment-badge std-assessment-badge--expired">
                    만료
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

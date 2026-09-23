"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Save } from "lucide-react";
import type { CompanyDetail } from "@/server/admin";
import {
  updateFreeLimitAction,
  updatePlanAction,
  type ActionState,
} from "./actions";
import { PAID_PLANS, seatCapFor, planName } from "@/features/billing/plans";
import { FormErrorDialog } from "@/components/ui/form-error-dialog";

const SIZE_LABEL: Record<CompanyDetail["initial_employee_size_band"], string> =
  {
    UNDER_5: "5인 미만",
    FROM_5_TO_19: "5인 이상~20인 미만",
    FROM_20_TO_49: "20인 이상~50인 미만",
    FROM_50: "50인 이상",
  };

export function CompanyDetailView({ company }: { company: CompanyDetail }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateFreeLimitAction,
    undefined,
  );
  const [freeLimit, setFreeLimit] = useState(String(company.free_limit));
  const [planState, planFormAction, planPending] = useActionState<
    ActionState,
    FormData
  >(updatePlanAction, undefined);
  const cap = seatCapFor(company.plan);

  return (
    <>
      <Link href="/admin" className="text-button admin-back">
        <ArrowLeft size={13} /> 회사 목록
      </Link>

      <header className="page-header">
        <div className="page-header-copy">
          <h1>{company.company_name}</h1>
          <p className="page-header-lead">
            회사코드 <code className="cell-mono">{company.company_code}</code> ·{" "}
            가입 {new Date(company.created_at).toLocaleDateString("ko-KR")}
          </p>
        </div>
      </header>

      <dl className="meta-strip">
        <div>
          <dt>활성 인원</dt>
          <dd>
            {company.active_count}
            {company.active_count > company.free_limit && (
              <span className="meta-strip-tag meta-strip-tag--warn">
                한도 초과
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt>승인 대기</dt>
          <dd>{company.pending_count}</dd>
        </div>
        <div>
          <dt>퇴사·거부 이력</dt>
          <dd>{company.resigned_count}</dd>
        </div>
        <div>
          <dt>요금제</dt>
          <dd>
            {planName(company.plan)}
            {cap !== null && (
              <span className="cell-dim">
                {" "}
                · 계약 {cap}명
                {company.active_count >= cap && (
                  <span className="meta-strip-tag meta-strip-tag--warn">
                    인원 소진
                  </span>
                )}
              </span>
            )}
          </dd>
        </div>
      </dl>

      <section className="admin-section">
        <h2>요금제 변경</h2>
        <p className="admin-section-note">
          입금 확인 후 구간을 올립니다. 계약 인원을 모두 사용한 회사는 여기서
          구간을 올려야 인원 등록이 다시 열립니다. 상향하면 결제 기준일이 오늘로
          갱신됩니다.
        </p>
        <form action={planFormAction} className="admin-inline-form">
          <input type="hidden" name="company_id" value={company.company_id} />
          <label>
            <span>구간</span>
            <select name="plan" defaultValue={company.plan ?? "FREE"}>
              <option value="FREE">무료</option>
              {PAID_PLANS.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} (~{plan.maxHeadcount}인)
                </option>
              ))}
              <option value="ENTERPRISE">개별 협의 (상한 없음)</option>
            </select>
          </label>
          <button type="submit" className="btn-primary" disabled={planPending}>
            <Save size={13} /> {planPending ? "변경 중…" : "변경"}
          </button>
        </form>
        <FormErrorDialog message={planState?.error} nonce={planState} />
        {planState?.message && (
          <p role="status" className="wo-muted">
            {planState.message}
          </p>
        )}
      </section>

      <section className="admin-section">
        <h2>회사 정보</h2>
        <dl className="detail-list">
          <div>
            <dt>업종</dt>
            <dd>{company.business_type ?? "—"}</dd>
          </div>
          <div>
            <dt>사업개시일</dt>
            <dd>
              {new Date(company.business_start_date).toLocaleDateString(
                "ko-KR",
              )}
            </dd>
          </div>
          <div>
            <dt>예상 연매출액</dt>
            <dd>
              {company.expected_annual_revenue_manwon.toLocaleString("ko-KR")}{" "}
              만원
            </dd>
          </div>
          <div>
            <dt>초기 인원 규모</dt>
            <dd>{SIZE_LABEL[company.initial_employee_size_band]}</dd>
          </div>
          <div>
            <dt>현재 인원 규모</dt>
            <dd>
              {company.current_employee_size_band
                ? SIZE_LABEL[company.current_employee_size_band]
                : "—"}
            </dd>
          </div>
          <div>
            <dt>생성자</dt>
            <dd>
              {company.creator_name ?? "—"}
              {company.creator_email && (
                <span className="cell-dim"> · {company.creator_email}</span>
              )}
            </dd>
          </div>
        </dl>
      </section>

      <section className="admin-section">
        <h2>운영자 조정</h2>
        <form action={formAction} className="admin-edit-form">
          <input type="hidden" name="company_id" value={company.company_id} />
          <div className="admin-edit-row">
            <label htmlFor="free_limit">무료 인원 한도</label>
            <input
              id="free_limit"
              name="free_limit"
              type="number"
              min={0}
              max={10000}
              value={freeLimit}
              onChange={(e) => setFreeLimit(e.target.value)}
              disabled={pending}
            />
            <span className="admin-edit-hint">
              기본 10명. 100인 이상 개별 협의 시 이 값으로 조정.
            </span>
            <button type="submit" className="primary-button" disabled={pending}>
              <Save size={13} />
              {pending ? "저장 중..." : "저장"}
            </button>
          </div>
          <FormErrorDialog message={state?.error} nonce={state} />
          {state?.message && <div className="form-ok">{state.message}</div>}
        </form>
      </section>
    </>
  );
}

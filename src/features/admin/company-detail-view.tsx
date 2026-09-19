"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Save } from "lucide-react";
import type { CompanyDetail } from "@/server/admin";
import { updateFreeLimitAction, type ActionState } from "./actions";

const SIZE_LABEL: Record<CompanyDetail["initial_employee_size_band"], string> = {
  UNDER_5: "5인 미만",
  FROM_5_TO_19: "5인 이상~20인 미만",
  FROM_20_TO_49: "20인 이상~50인 미만",
  FROM_50: "50인 이상",
};

const PRO_LABEL: Record<CompanyDetail["pro_state"], string> = {
  FREE: "무료티어",
  PRO_VOLUNTARY: "Pro (자발적 전환)",
  PRO_MANDATORY: "Pro (한도 초과 자동 전환)",
};

export function CompanyDetailView({ company }: { company: CompanyDetail }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateFreeLimitAction,
    undefined,
  );
  const [freeLimit, setFreeLimit] = useState(String(company.free_limit));

  return (
    <>
      <Link href="/admin" className="text-button admin-back">
        <ArrowLeft size={13} /> 회사 목록
      </Link>

      <header className="page-header">
        <div className="page-header-copy">
          <h1>{company.company_name}</h1>
          <p className="page-header-lead">
            회사코드 <code className="cell-mono">{company.company_code}</code> ·
            {" "}
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
          <dd>{PRO_LABEL[company.pro_state]}</dd>
        </div>
      </dl>

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
              {new Date(company.business_start_date).toLocaleDateString("ko-KR")}
            </dd>
          </div>
          <div>
            <dt>예상 연매출액</dt>
            <dd>
              {company.expected_annual_revenue_manwon.toLocaleString("ko-KR")} 만원
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
          {state?.error && <div className="form-error">{state.error}</div>}
          {state?.message && <div className="form-ok">{state.message}</div>}
        </form>
      </section>
    </>
  );
}

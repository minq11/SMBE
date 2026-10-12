"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import type { CompanyDetail } from "@/server/admin";
import { updatePlanAction, type ActionState } from "./actions";
import { PAID_PLANS, seatCapFor, planName } from "@/features/billing/plans";
import { FormErrorDialog } from "@/components/ui/form-error-dialog";
import { FloatSelect } from "@/components/ui/float-field";
import { useToast } from "@/components/ui/toast";

const SIZE_LABEL: Record<CompanyDetail["initial_employee_size_band"], string> =
  {
    UNDER_5: "5인 미만",
    FROM_5_TO_19: "5인 이상~20인 미만",
    FROM_20_TO_49: "20인 이상~50인 미만",
    FROM_50: "50인 이상",
  };

export function CompanyDetailView({ company }: { company: CompanyDetail }) {
  const [planState, planFormAction, planPending] = useActionState<
    ActionState,
    FormData
  >(updatePlanAction, undefined);
  const router = useRouter();
  const { show, toast } = useToast();
  // 바뀐 요금제는 이 화면의 숫자·태그에 바로 보여야 한다 — 저장 뒤 서버 데이터를 다시 받는다.
  const shown = useRef<ActionState>(undefined);
  useEffect(() => {
    if (!planState?.message || shown.current === planState) return;
    shown.current = planState;
    show(planState.message);
    router.refresh();
  }, [planState, router, show]);
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
          <dd>{company.active_count}</dd>
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
            {company.pro_state === "FREE"
              ? "무료"
              : `멤버십 · ${planName(company.plan)}`}
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
        {company.plan_started_at && (
          <div>
            <dt>결제 기준일</dt>
            <dd>
              {new Date(company.plan_started_at).toLocaleDateString("ko-KR")}
            </dd>
          </div>
        )}
      </dl>

      <section className="admin-section">
        <h2>요금제 변경</h2>
        <p className="admin-section-note">
          입금 확인 후 구간을 올립니다. 무료는 인원 제한이 없고 기능만 다릅니다.
          멤버십은 계약 구간의 인원을 다 쓰면 등록이 막히니 여기서 구간을
          올립니다. 상향하면 결제 기준일이 오늘로 갱신됩니다.
        </p>
        <form action={planFormAction} className="admin-field-row">
          <input type="hidden" name="company_id" value={company.company_id} />
          <FloatSelect
            key={company.plan ?? "FREE"}
            id="admin-plan"
            name="plan"
            label="구간"
            defaultValue={company.plan ?? "FREE"}
            className="float-field--flush"
          >
            <option value="FREE">무료</option>
            {PAID_PLANS.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} (~{plan.maxHeadcount}인)
              </option>
            ))}
            <option value="ENTERPRISE">개별 협의 (상한 없음)</option>
          </FloatSelect>
          <button type="submit" className="btn-primary" disabled={planPending}>
            <Save size={13} /> {planPending ? "변경 중…" : "변경"}
          </button>
        </form>
        <FormErrorDialog message={planState?.error} nonce={planState} />
        {toast}
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
    </>
  );
}

"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { createCompanyAction, type FormState } from "./actions";
import { ContactFields } from "./contact-fields";
import { FormErrorDialog } from "@/components/ui/form-error-dialog";
import { FloatField, FloatSelect } from "@/components/ui/float-field";

const bands = [
  { value: "UNDER_5", label: "5인 미만" },
  { value: "FROM_5_TO_19", label: "5인 이상 ~ 20인 미만" },
  { value: "FROM_20_TO_49", label: "20인 이상 ~ 50인 미만" },
  { value: "FROM_50", label: "50인 이상" },
];

export function CreateCompanyForm({
  defaultDisplayName,
  defaultEmail,
}: {
  defaultDisplayName: string;
  defaultEmail: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createCompanyAction,
    undefined,
  );

  return (
    <form action={formAction} className="form-shell">
      <h1>회사 만들기</h1>
      <p className="lead">
        회사 정보를 등록하면 바로 시작할 수 있어요. 만든 사람이 이 회사의
        관리감독자가 됩니다.
      </p>

      <FormErrorDialog message={state?.error} nonce={state} />

      {/* 회사와 등록자는 다른 것이라 구간을 나눈다. 한 줄로 쭉 늘어놓으면
          "회사 만들기" 를 눌렀는데 첫 칸이 내 이름이라 멈칫하게 된다. */}
      <section className="std-form-section">
        <h2>
          <span className="std-step-no">1</span>회사 정보
        </h2>

        <FloatField
          className="float-field--flush"
          id="name"
          name="name"
          label="회사명"
          type="text"
          required
          maxLength={80}
        />

        <FloatField
          className="float-field--flush"
          id="business_type"
          name="business_type"
          label="업종"
          type="text"
          hint="예: 금속가공, 물류, 건설"
          required
          maxLength={80}
          note="업종별 표준서·체크리스트 템플릿 제공에 사용됩니다."
        />

        <FloatSelect
          className="float-field--flush"
          id="initial_employee_size_band"
          name="initial_employee_size_band"
          label="초기 인원규모"
          required
          defaultValue=""
          note="법률 안내 개인화에 사용되며, 실제 등록 인원과 별도로 표시됩니다."
        >
          <option value="" disabled>
            선택하세요
          </option>
          {bands.map((band) => (
            <option key={band.value} value={band.value}>
              {band.label}
            </option>
          ))}
        </FloatSelect>

        <FloatField
          className="float-field--flush"
          id="business_start_date"
          name="business_start_date"
          label="사업개시일"
          type="date"
          required
          note="최초 위험성평가 기한 안내에 사용됩니다."
        />

        <FloatField
          className="float-field--flush"
          id="expected_annual_revenue_manwon"
          name="expected_annual_revenue_manwon"
          label="예상 연매출액 (만원)"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          required
          hint="예: 50000  (= 5억)"
          note="만원 단위로 입력하세요. 예: 1억 원 → 10000"
        />
      </section>

      <section className="std-form-section">
        <h2>
          <span className="std-step-no">2</span>내 정보
        </h2>
        <p className="std-form-note">
          회사를 만든 사람이 관리감독자로 등록됩니다. 이름은 작업지시·점검
          기록에 그대로 남습니다.
        </p>

        <FloatField
          className="float-field--flush"
          id="display_name"
          name="display_name"
          label="내 이름"
          type="text"
          defaultValue={defaultDisplayName}
          required
          maxLength={60}
          note="회사 내에서 표시될 이름입니다."
        />

        <ContactFields defaultEmail={defaultEmail} flush />
      </section>

      <div className="form-actions">
        <Link href="/onboarding" className="btn-secondary">
          <ArrowLeft size={14} /> 이전
        </Link>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "생성 중..." : "회사 만들기"}
          <ArrowRight size={16} />
        </button>
      </div>
    </form>
  );
}

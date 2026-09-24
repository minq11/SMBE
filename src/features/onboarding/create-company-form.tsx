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
        회사명·업종·인원규모만 입력하면 바로 시작할 수 있어요. 이 회사의
        관리감독자 권한이 부여됩니다.
      </p>

      <FormErrorDialog message={state?.error} nonce={state} />

      <FloatField
        id="display_name"
        name="display_name"
        label="내 이름"
        type="text"
        defaultValue={defaultDisplayName}
        required
        maxLength={60}
        note="회사 내에서 표시될 이름입니다."
      />

      <FloatField
        id="name"
        name="name"
        label="회사명"
        type="text"
        required
        maxLength={80}
      />

      <FloatField
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
        id="business_start_date"
        name="business_start_date"
        label="사업개시일"
        type="date"
        required
        note="최초 위험성평가 기한 안내에 사용됩니다."
      />

      <FloatField
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

      <ContactFields defaultEmail={defaultEmail} />

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

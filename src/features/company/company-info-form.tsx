"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowLeft, Save } from "lucide-react";
import { FloatField, FloatSelect } from "@/components/ui/float-field";
import { FormErrorDialog } from "@/components/ui/form-error-dialog";
import {
  updateCompanyInfoAction,
  type CompanyInfoState,
} from "./company-info-actions";
import { SIZE_BANDS, SIZE_BAND_LABEL } from "./company-info";
import type { CompanyInfo } from "@/server/company-settings";

export function CompanyInfoForm({ info }: { info: CompanyInfo }) {
  const [state, formAction, pending] = useActionState<
    CompanyInfoState,
    FormData
  >(updateCompanyInfoAction, undefined);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        // 저장이 막혀도 고친 값이 남아 있어야 한다. React 19 는 form action 이
        // 끝나면 비제어 칸을 초기화하므로 기본 제출을 막고 액션만 부른다.
        e.preventDefault();
        formAction(new FormData(e.currentTarget));
      }}
      className="std-form company-info-form"
    >
      <FormErrorDialog message={state?.error} nonce={state} />
      <input type="hidden" name="version" value={info.version} />

      <section className="std-form-section">
        <h2>기본 정보</h2>
        <FloatField
          className="float-field--flush"
          id="name"
          name="name"
          label="회사명"
          defaultValue={info.name}
          required
          maxLength={80}
        />
        <FloatField
          className="float-field--flush"
          id="business_type"
          name="business_type"
          label="업종"
          defaultValue={info.business_type}
          required
          maxLength={80}
          hint="예: 금속가공, 물류, 건설"
          note="업종별 표준서·체크리스트 템플릿 제공에 사용됩니다."
        />
        <FloatSelect
          className="float-field--flush"
          id="initial_employee_size_band"
          name="initial_employee_size_band"
          label="초기 인원규모"
          defaultValue={info.initial_employee_size_band}
          required
          note="법률 안내 개인화에 사용되며, 실제 등록 인원과 별도로 표시됩니다."
        >
          {SIZE_BANDS.map((band) => (
            <option key={band} value={band}>
              {SIZE_BAND_LABEL[band]}
            </option>
          ))}
        </FloatSelect>
        <FloatField
          className="float-field--flush"
          id="business_start_date"
          name="business_start_date"
          label="사업개시일"
          type="date"
          defaultValue={info.business_start_date}
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
          defaultValue={String(info.expected_annual_revenue_manwon)}
          required
          note="만원 단위로 입력하세요. 예: 1억 원 → 10000"
        />
      </section>

      <section className="std-form-section">
        <h2>회사코드</h2>
        <FloatField
          className="float-field--flush"
          id="company_code"
          name="company_code"
          label="회사코드"
          defaultValue={info.company_code}
          required
          minLength={6}
          maxLength={16}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          // 저장은 대문자로 된다(참여 화면도 대문자로 찾는다). 칠 때부터 그렇게 보인다.
          style={{
            fontFamily: "ui-monospace, monospace",
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
          note="구성원이 '회사코드로 참여' 에서 입력하는 코드입니다. 영문과 숫자 6~16자. 바꾸면 예전 코드로는 참여할 수 없고, 이미 소속된 사람에게는 영향이 없습니다."
        />
      </section>

      <div className="form-actions">
        <Link href="/company" className="btn-secondary">
          <ArrowLeft size={14} /> 취소
        </Link>
        <button type="submit" className="btn-primary" disabled={pending}>
          <Save size={14} /> {pending ? "저장 중…" : "저장"}
        </button>
      </div>
    </form>
  );
}

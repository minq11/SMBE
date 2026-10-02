"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { joinCompanyAction, type FormState } from "./actions";
import { ContactFields } from "./contact-fields";
import { FormErrorDialog } from "@/components/ui/form-error-dialog";
import { FloatField } from "@/components/ui/float-field";

export function JoinForm({
  defaultDisplayName,
  defaultEmail,
}: {
  defaultDisplayName: string;
  defaultEmail: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    joinCompanyAction,
    undefined,
  );

  return (
    <form action={formAction} className="form-shell">
      <h1>회사코드로 참여</h1>
      <p className="lead">
        회사 관리자가 알려준 회사코드를 입력하세요. 관리자가 승인하면 소속으로
        등록됩니다.
      </p>

      <FormErrorDialog message={state?.error} nonce={state} />

      {/* 회사 만들기와 같은 구간 나누기 — 들어갈 회사와 나는 다른 것이다.
          나란히 놓인 두 화면이라 모양이 달라지면 안 된다. */}
      <section className="std-form-section">
        <h2>
          <span className="std-step-no">1</span>들어갈 회사
        </h2>

        <FloatField
          className="float-field--flush"
          id="company_code"
          name="company_code"
          label="회사코드"
          type="text"
          required
          maxLength={32}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          hint="예: AB2CD3EF"
          style={{ fontFamily: "ui-monospace, monospace", letterSpacing: 2 }}
        />
      </section>

      <section className="std-form-section">
        <h2>
          <span className="std-step-no">2</span>내 정보
        </h2>
        <p className="std-form-note">
          이름은 작업지시·점검 기록에 그대로 남습니다.
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
          note="회사에 표시될 이름입니다."
        />

        <ContactFields defaultEmail={defaultEmail} flush />
      </section>

      <div className="form-actions">
        <Link href="/onboarding" className="btn-secondary">
          <ArrowLeft size={14} /> 이전
        </Link>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "요청 중..." : "가입 요청"}
          <ArrowRight size={16} />
        </button>
      </div>
    </form>
  );
}

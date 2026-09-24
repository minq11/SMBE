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

      <FloatField
        id="display_name"
        name="display_name"
        label="내 이름"
        type="text"
        defaultValue={defaultDisplayName}
        required
        maxLength={60}
        note="회사에 표시될 이름입니다."
      />

      <FloatField
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

      <ContactFields defaultEmail={defaultEmail} />

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

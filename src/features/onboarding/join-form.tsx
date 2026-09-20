"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { joinCompanyAction, type FormState } from "./actions";

export function JoinForm({ defaultDisplayName }: { defaultDisplayName: string }) {
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

      {state?.error && <div className="form-error">{state.error}</div>}

      <div className="form-field">
        <label htmlFor="display_name">내 이름</label>
        <input
          id="display_name"
          name="display_name"
          type="text"
          defaultValue={defaultDisplayName}
          required
          maxLength={60}
        />
        <span className="hint">회사에 표시될 이름입니다.</span>
      </div>

      <div className="form-field">
        <label htmlFor="company_code">회사코드</label>
        <input
          id="company_code"
          name="company_code"
          type="text"
          required
          maxLength={32}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder="예: AB2CD3EF"
          style={{ fontFamily: "ui-monospace, monospace", letterSpacing: 2 }}
        />
      </div>

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

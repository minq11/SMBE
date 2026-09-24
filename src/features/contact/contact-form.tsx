"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Mail, X } from "lucide-react";
import { submitContactAction, type ContactState } from "./actions";
import { FormErrorDialog } from "@/components/ui/form-error-dialog";
import { FloatField, FloatTextarea } from "@/components/ui/float-field";

export function ContactForm() {
  const [state, formAction, pending] = useActionState<ContactState, FormData>(
    submitContactAction,
    undefined,
  );

  if (state?.ok) {
    return (
      <div className="form-shell">
        <div className="contact-success">
          <span className="contact-success-icon" aria-hidden="true">
            <Check size={22} />
          </span>
          <h1>문의가 접수됐어요</h1>
          <p>
            메시지를 잘 받았습니다. 회신은 며칠 안에 남겨주신 이메일로 답장
            드릴게요.
          </p>
          <div className="contact-success-actions">
            <Link href="/" className="btn-primary">
              홈으로 <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const prev = state?.values;
  const initialTopic = prev?.topic || "PRE_REGISTER";

  return (
    <form action={formAction} className="form-shell">
      <h1>사전 예약 · 문의하기</h1>
      <p className="lead">
        도입 문의·기능 요청·하실 말씀을 남겨 주세요. 며칠 안에 답장 드립니다.
      </p>

      <FormErrorDialog message={state?.error} nonce={state} />

      <FloatField
        id="name"
        name="name"
        label="이름"
        type="text"
        required
        maxLength={60}
        autoComplete="name"
        defaultValue={prev?.name ?? ""}
      />

      <FloatField
        id="email"
        name="email"
        label="이메일"
        type="email"
        required
        maxLength={180}
        autoComplete="email"
        hint="you@example.com"
        note="답장을 받을 이메일 주소입니다."
        defaultValue={prev?.email ?? ""}
      />

      <FloatField
        id="company"
        name="company"
        label="회사 (선택)"
        type="text"
        maxLength={80}
        autoComplete="organization"
        defaultValue={prev?.company ?? ""}
      />

      <fieldset className="form-field">
        <legend>문의 유형</legend>
        <div className="topic-choices">
          <label className="topic-choice">
            <input
              type="radio"
              name="topic"
              value="PRE_REGISTER"
              defaultChecked={initialTopic === "PRE_REGISTER"}
            />
            <span>사전 예약</span>
          </label>
          <label className="topic-choice">
            <input
              type="radio"
              name="topic"
              value="QUESTION"
              defaultChecked={initialTopic === "QUESTION"}
            />
            <span>서비스 문의</span>
          </label>
          <label className="topic-choice">
            <input
              type="radio"
              name="topic"
              value="OTHER"
              defaultChecked={initialTopic === "OTHER"}
            />
            <span>기타</span>
          </label>
        </div>
      </fieldset>

      <FloatTextarea
        id="message"
        name="message"
        label="메시지"
        rows={6}
        required
        maxLength={2000}
        hint="회사 규모·업종·기대하는 기능 등을 자유롭게 적어 주세요."
        defaultValue={prev?.message ?? ""}
      />

      {/* honeypot: 봇 방지용, 사용자에게는 안 보이게 */}
      <div className="honeypot" aria-hidden="true">
        <label>
          Website
          {/* 헌법 3장 예외: 봇 함정 칸이라 사람 눈에 보이지 않는다 */}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="form-actions">
        <Link href="/" className="btn-secondary">
          <X size={14} /> 취소
        </Link>
        <button type="submit" className="btn-primary" disabled={pending}>
          <Mail size={14} />
          {pending ? "보내는 중..." : "문의 보내기"}
        </button>
      </div>

      <p className="contact-fallback">
        또는 직접 <a href="mailto:hi@smbe.net">hi@smbe.net</a> 으로 메일을 보내
        주셔도 됩니다.
      </p>
    </form>
  );
}

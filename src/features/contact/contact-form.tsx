"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Mail } from "lucide-react";
import { submitContactAction, type ContactState } from "./actions";

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
        SMBE 는 아직 개발 중입니다. 도입 관심·기능 문의·기타 하실 말씀을 남겨
        주시면 며칠 안에 답장 드릴게요.
      </p>

      {state?.error && <div className="form-error">{state.error}</div>}

      <div className="form-field">
        <label htmlFor="name">이름</label>
        <input
          id="name"
          name="name"
          type="text"
          required
          maxLength={60}
          autoComplete="name"
          defaultValue={prev?.name ?? ""}
        />
      </div>

      <div className="form-field">
        <label htmlFor="email">이메일</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          maxLength={180}
          autoComplete="email"
          placeholder="you@example.com"
          defaultValue={prev?.email ?? ""}
        />
        <span className="hint">답장을 받을 이메일 주소입니다.</span>
      </div>

      <div className="form-field">
        <label htmlFor="company">회사 (선택)</label>
        <input
          id="company"
          name="company"
          type="text"
          maxLength={80}
          autoComplete="organization"
          defaultValue={prev?.company ?? ""}
        />
      </div>

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

      <div className="form-field">
        <label htmlFor="message">메시지</label>
        <textarea
          id="message"
          name="message"
          rows={6}
          required
          maxLength={2000}
          placeholder="회사 규모·업종·기대하는 기능 등을 자유롭게 적어 주세요."
          defaultValue={prev?.message ?? ""}
        />
      </div>

      {/* honeypot: 봇 방지용, 사용자에게는 안 보이게 */}
      <div className="honeypot" aria-hidden="true">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="form-actions">
        <Link href="/" className="btn-secondary">
          취소
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

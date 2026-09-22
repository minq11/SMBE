"use client";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";

export const BANNER_DISMISSED_KEY = "smbe.preview-banner.dismissed";

/**
 * 개발 중 공지 띠. 닫으면 이 기기에서는 다시 안 뜬다.
 *
 * 좁은 화면에서는 상단바와 합쳐 112px 을 먹던 것이라, 닫을 수 있게 하고
 * 높이도 줄였다. 닫힘 상태는 html[data-banner-hidden] 으로 표현해
 * --banner-h 를 0 으로 만든다 (상단바·고정 머리의 top 이 이 값을 본다).
 * 첫 그리기 전에 적용하는 것은 layout.tsx 의 인라인 스크립트다.
 */
export function PreviewBanner() {
  const dismiss = () => {
    document.documentElement.dataset.bannerHidden = "1";
    try {
      localStorage.setItem(BANNER_DISMISSED_KEY, "1");
    } catch {
      /* 저장 못 해도 이번 화면에서는 닫힌다 */
    }
  };
  return (
    <div className="preview-banner" role="note">
      <span className="preview-banner-copy">
        <span className="preview-banner-dot" aria-hidden="true" />
        <span className="preview-banner-text">SMBE 는 아직 개발 중입니다.</span>
        <Link href="/contact" className="preview-banner-mail">
          사전 예약 · 문의하기
          <ArrowRight size={12} />
        </Link>
      </span>
      <button
        type="button"
        className="preview-banner-close"
        aria-label="공지 닫기"
        onClick={dismiss}
      >
        <X size={14} />
      </button>
    </div>
  );
}

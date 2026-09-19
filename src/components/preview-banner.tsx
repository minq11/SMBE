import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function PreviewBanner() {
  return (
    <div className="preview-banner" role="note">
      <span className="preview-banner-copy">
        <span className="preview-banner-dot" aria-hidden="true" />
        SMBE 는 아직 개발 중입니다.
        <Link href="/contact" className="preview-banner-mail">
          사전 예약 · 문의하기
          <ArrowRight size={12} />
        </Link>
      </span>
    </div>
  );
}

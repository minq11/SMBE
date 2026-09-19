import Link from "next/link";
import { AppIcon } from "@/components/brand/app-icon";

export function PublicHeader() {
  return (
    <header className="auth-header">
      <Link href="/" className="brand-text" aria-label="SMBE 홈">
        <AppIcon size={24} />
        <span>SMBE</span>
      </Link>
      <nav aria-label="공개 메뉴">
        <Link href="/guide">안전법 가이드</Link>
        <Link href="/recognition-check">인정 준비도 진단</Link>
        <Link href="/contact">문의</Link>
        <Link href="/login">로그인</Link>
      </nav>
    </header>
  );
}

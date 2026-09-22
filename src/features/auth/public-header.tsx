import Link from "next/link";
import { BrandWordmark } from "@/components/brand/wordmark";

/**
 * 로그인 전 공개 화면(로그인·가이드·진단·문의·온보딩)의 상단바.
 * 홈의 상단바와 같은 틀(.topbar)을 쓴다 — 화면마다 머리가 다르면 다른 서비스로
 * 보인다. 왼쪽은 워드마크(홈), 넓은 화면에서는 공개 메뉴, 오른쪽은 로그인·시작.
 */
export function PublicHeader() {
  return (
    <header className="topbar topbar--public">
      <div className="topbar-left">
        <Link href="/" className="topbar-brand" aria-label="심플안전 홈">
          <BrandWordmark className="topbar-wordmark" iconSize={22} />
        </Link>
        <nav className="public-nav" aria-label="공개 메뉴">
          <Link href="/guide">안전법 가이드</Link>
          <Link href="/recognition-check">인정 준비도 진단</Link>
          <Link href="/contact">문의</Link>
        </nav>
      </div>
      <div className="topbar-right">
        <Link href="/login" className="logout-button">
          로그인
        </Link>
        <Link href="/login" className="logout-button logout-button--primary">
          무료로 시작
        </Link>
      </div>
    </header>
  );
}

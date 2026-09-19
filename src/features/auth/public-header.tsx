import Link from "next/link";

export function PublicHeader() {
  return (
    <header className="auth-header">
      <Link href="/" className="brand-text">
        SMBE
      </Link>
      <nav aria-label="공개 메뉴">
        <Link href="/guide">안전법 가이드</Link>
        <Link href="/recognition-check">인정 준비도 진단</Link>
        <Link href="/login">로그인</Link>
      </nav>
    </header>
  );
}

import Link from "next/link";
export default function NotFound() {
  return (
    <main className="not-found">
      <p className="eyebrow">SMBE / 404</p>
      <h1>아직 준비되지 않은 페이지예요.</h1>
      <p>현재는 메인 화면 미리보기를 제공하고 있습니다.</p>
      <Link href="/">홈으로 돌아가기 →</Link>
    </main>
  );
}

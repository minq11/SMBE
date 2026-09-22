export const metadata = { title: "링크 확인 · 심플안전" };

export default function ExpiredLinkPage() {
  return (
    <main className="link-notice">
      <h1>링크를 열 수 없습니다</h1>
      <p>
        링크가 만료되었거나, 작업지시가 취소·재발급되었을 수 있습니다.
        <br />
        작업 관리자에게 새 링크를 요청해 주세요.
      </p>
    </main>
  );
}

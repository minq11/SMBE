/**
 * SMBE 워드마크. 사이드바와 좁은 화면 상단바가 같은 크롭을 쓴다.
 * viewBox 로 원본 PNG 의 여백을 잘라 낸다 (2073×758 중 로고 영역).
 */
export function BrandWordmark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="320 170 1430 400"
      role="img"
      aria-label="SMBE 로고"
    >
      <image href="/brand/smbe-original.png" width="2073" height="758" />
    </svg>
  );
}

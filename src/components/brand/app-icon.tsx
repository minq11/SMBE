/**
 * 심플안전 심볼 — 초록 둥근 사각형에 흰 체크, 오른쪽 위에 노란 점.
 * 화면에서는 이 SVG 를 쓰고, 매니페스트·홈 화면 아이콘 PNG 는 같은 그림을
 * scripts/generate-pwa-icons.mjs 가 만든다.
 */
export function AppIcon({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="심플안전"
      style={{ display: "block", flexShrink: 0 }}
    >
      <rect x="4" y="4" width="56" height="56" rx="16" fill="#0f5b3c" />
      <path
        d="M19 33.5l9 9 18-19"
        fill="none"
        stroke="#fff"
        strokeWidth="6.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="47.5" cy="16.5" r="5.5" fill="#f2b705" />
    </svg>
  );
}

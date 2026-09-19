// 인라인 SVG 로고 — 외부 이미지·이모지 사용 없이 브랜드 마크만 그린다.
// Google: 다색 G, Naver: 흰색 N (초록 배경 위), Kakao: 검정 말풍선 (노랑 배경 위)

export function GoogleLogo({ size = 18 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      width={size}
      height={size}
      role="img"
      aria-label="Google"
    >
      <path
        fill="#4285F4"
        d="M19.6 10.23c0-.68-.06-1.36-.18-2H10v3.79h5.4a4.6 4.6 0 0 1-2 3.03v2.5h3.24c1.9-1.75 2.96-4.34 2.96-7.32z"
      />
      <path
        fill="#34A853"
        d="M10 20c2.7 0 4.97-.9 6.62-2.44l-3.24-2.5c-.9.6-2.04.95-3.38.95-2.6 0-4.8-1.75-5.58-4.11H1.05v2.58A10 10 0 0 0 10 20z"
      />
      <path
        fill="#FBBC05"
        d="M4.42 11.9a6 6 0 0 1 0-3.8V5.52H1.05a10 10 0 0 0 0 8.96l3.37-2.58z"
      />
      <path
        fill="#EA4335"
        d="M10 3.96c1.47 0 2.8.51 3.83 1.5l2.87-2.87A10 10 0 0 0 10 0 10 10 0 0 0 1.05 5.52l3.37 2.58C5.2 5.7 7.4 3.96 10 3.96z"
      />
    </svg>
  );
}

export function NaverLogo({ size = 18 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      width={size}
      height={size}
      role="img"
      aria-label="Naver"
    >
      <path fill="currentColor" d="M11.72 10.29 8.28 5H4v10h4.28V9.7L11.72 15H16V5h-4.28z" />
    </svg>
  );
}

export function KakaoLogo({ size = 18 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      width={size}
      height={size}
      role="img"
      aria-label="Kakao"
    >
      <path
        fill="currentColor"
        d="M10 3.2c-4.42 0-8 2.83-8 6.32 0 2.24 1.48 4.2 3.7 5.32l-.83 3.05c-.08.3.25.55.52.37l3.66-2.42c.31.03.63.05.95.05 4.42 0 8-2.83 8-6.32S14.42 3.2 10 3.2z"
      />
    </svg>
  );
}

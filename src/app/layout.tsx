import type { Metadata, Viewport } from "next";
// 글꼴은 Pretendard 하나(가변). 글자 범위별로 잘라 둔 파일이라 쓰는 글자만 받는다.
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";
import { PreviewBanner } from "@/components/preview-banner";
import { ServiceWorkerRegistrar } from "@/components/service-worker-registrar";
import { ViewportHeight } from "@/components/shell/viewport-height";
export const metadata: Metadata = {
  title: "심플안전 · 안전관리, 쉽고 간편하게",
  description:
    "제조업 중소기업을 위한 안전관리. 위험성평가부터 작업지시·허가서·안전점검까지 인원 제한 없이 무료로 시작합니다.",
  robots: { index: false, follow: false },
  applicationName: "심플안전",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "심플안전",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};
export const viewport: Viewport = {
  // 상태 표시줄이 상단바·본문과 한 면이 되게 배경색과 맞춘다.
  themeColor: "#f3f3ee",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>
        {/* 닫아 둔 공지 띠는 첫 그리기 전에 치운다. 하이드레이션 뒤에 치우면
            한 번 보였다 사라진다. 키는 preview-banner.tsx 와 같아야 한다. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{if(localStorage.getItem("smbe.preview-banner.dismissed")==="1")document.documentElement.dataset.bannerHidden="1"}catch(e){}',
          }}
        />
        <ServiceWorkerRegistrar />
        <ViewportHeight />
        <PreviewBanner />
        {children}
      </body>
    </html>
  );
}

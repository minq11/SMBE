import type { Metadata, Viewport } from "next";
import "@fontsource/noto-sans-kr/400.css";
import "@fontsource/noto-sans-kr/500.css";
import "@fontsource/noto-sans-kr/600.css";
import "@fontsource/noto-sans-kr/700.css";
import "@fontsource/noto-sans-kr/800.css";
import "@fontsource/noto-sans-kr/900.css";
import "./globals.css";
import { PreviewBanner } from "@/components/preview-banner";
import { ServiceWorkerRegistrar } from "@/components/service-worker-registrar";
export const metadata: Metadata = {
  title: "SMBE · 안전관리, 쉽고 간편하게",
  description: "Safety must be easy. SMBE 관리자 홈 미리보기",
  robots: { index: false, follow: false },
  applicationName: "SMBE",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "SMBE",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    shortcut: "/brand/logo.png",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};
export const viewport: Viewport = {
  themeColor: "#e96935",
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
        <PreviewBanner />
        {children}
      </body>
    </html>
  );
}

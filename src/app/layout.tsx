import type { Metadata, Viewport } from "next";
import "@fontsource/noto-sans-kr/400.css";
import "@fontsource/noto-sans-kr/500.css";
import "@fontsource/noto-sans-kr/600.css";
import "@fontsource/noto-sans-kr/700.css";
import "@fontsource/noto-sans-kr/800.css";
import "@fontsource/noto-sans-kr/900.css";
import "./globals.css";
import { PreviewBanner } from "@/components/preview-banner";
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
    <html lang="ko">
      <body>
        <PreviewBanner />
        {children}
      </body>
    </html>
  );
}

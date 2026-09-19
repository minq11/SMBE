import type { Metadata } from "next";
import "@fontsource/noto-sans-kr/400.css";
import "@fontsource/noto-sans-kr/500.css";
import "@fontsource/noto-sans-kr/600.css";
import "@fontsource/noto-sans-kr/700.css";
import "@fontsource/noto-sans-kr/800.css";
import "@fontsource/noto-sans-kr/900.css";
import "./globals.css";
export const metadata: Metadata = {
  title: "SMBE · 안전관리, 쉽고 간편하게",
  description: "Safety must be easy. SMBE 관리자 홈 미리보기",
  robots: { index: false, follow: false },
  icons: {
    icon: [{ url: "/brand/logo.png", type: "image/png" }],
    shortcut: "/brand/logo.png",
    apple: "/brand/logo.png",
  },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

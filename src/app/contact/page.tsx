import { PublicHeader } from "@/features/auth/public-header";
import { SiteFooter } from "@/features/auth/site-footer";
import { ContactForm } from "@/features/contact/contact-form";

export const metadata = {
  title: "사전 예약 · 문의 · 심플안전",
  description:
    "심플안전 사전 예약과 문의 접수. 남겨주신 이메일로 답장 드립니다.",
};

export default function ContactPage() {
  return (
    <div className="auth-shell">
      <PublicHeader />
      <main className="auth-main">
        <ContactForm />
      </main>
      <SiteFooter />
    </div>
  );
}

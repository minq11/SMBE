import { PublicHeader } from "@/features/auth/public-header";
import { ContactForm } from "@/features/contact/contact-form";

export const metadata = {
  title: "사전 예약 · 문의 · SMBE",
  description:
    "SMBE 사전 예약과 문의 접수. 남겨주신 이메일로 답장 드립니다.",
};

export default function ContactPage() {
  return (
    <div className="auth-shell">
      <PublicHeader />
      <main className="auth-main">
        <ContactForm />
      </main>
    </div>
  );
}

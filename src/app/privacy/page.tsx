import { PublicHeader } from "@/features/auth/public-header";
import { SiteFooter } from "@/features/auth/site-footer";
import { PrivacyDoc } from "@/features/legal/privacy";

export const metadata = { title: "개인정보 처리방침 · 심플안전" };

export default function PrivacyDocPage() {
  return (
    <div className="public-shell">
      <PublicHeader />
      <main className="public-main">
        <div className="public-container public-container--narrow">
          <PrivacyDoc />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

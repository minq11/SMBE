import { PublicHeader } from "@/features/auth/public-header";
import { SiteFooter } from "@/features/auth/site-footer";
import { TermsDoc } from "@/features/legal/terms";

export const metadata = { title: "이용약관 · 심플안전" };

export default function TermsDocPage() {
  return (
    <div className="public-shell">
      <PublicHeader />
      <main className="public-main">
        <div className="public-container public-container--narrow">
          <TermsDoc />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

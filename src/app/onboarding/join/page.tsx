import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/session";
import { notifyEmailOf } from "@/server/profile";
import { PublicHeader } from "@/features/auth/public-header";
import { SiteFooter } from "@/features/auth/site-footer";
import { JoinForm } from "@/features/onboarding/join-form";

export const metadata = { title: "회사코드로 참여 · 심플안전" };

export default async function JoinPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (session.membership) redirect("/onboarding");
  const defaultEmail = await notifyEmailOf(session.user.id);

  return (
    <div className="auth-shell">
      <PublicHeader />
      <main className="auth-main">
        <JoinForm
          defaultDisplayName={session.user.displayName ?? ""}
          defaultEmail={defaultEmail}
        />
      </main>
      <SiteFooter />
    </div>
  );
}

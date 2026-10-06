import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/session";
import { notifyEmailState } from "@/server/profile";
import { PublicHeader } from "@/features/auth/public-header";
import { SiteFooter } from "@/features/auth/site-footer";
import { CreateCompanyForm } from "@/features/onboarding/create-company-form";

export const metadata = { title: "회사 만들기 · 심플안전" };

export default async function CreateCompanyPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (session.membership) redirect("/onboarding");
  const notify = await notifyEmailState(session.user.id);

  return (
    <div className="auth-shell">
      <PublicHeader />
      <main className="auth-main">
        <CreateCompanyForm
          defaultDisplayName={session.user.displayName ?? ""}
          defaultEmail={notify.defaultEmail}
      emailRequired={notify.required}
        />
      </main>
      <SiteFooter />
    </div>
  );
}

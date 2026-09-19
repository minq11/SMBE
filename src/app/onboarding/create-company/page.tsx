import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/session";
import { PublicHeader } from "@/features/auth/public-header";
import { CreateCompanyForm } from "@/features/onboarding/create-company-form";

export const metadata = { title: "회사 만들기 · SMBE" };

export default async function CreateCompanyPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (session.membership) redirect("/onboarding");

  return (
    <div className="auth-shell">
      <PublicHeader />
      <main className="auth-main">
        <CreateCompanyForm defaultDisplayName={session.user.displayName ?? ""} />
      </main>
    </div>
  );
}

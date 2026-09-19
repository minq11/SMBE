import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/session";
import { PublicHeader } from "@/features/auth/public-header";
import { JoinForm } from "@/features/onboarding/join-form";

export const metadata = { title: "회사코드로 참여 · SMBE" };

export default async function JoinPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (session.membership) redirect("/onboarding");

  return (
    <div className="auth-shell">
      <PublicHeader />
      <main className="auth-main">
        <JoinForm defaultDisplayName={session.user.displayName ?? ""} />
      </main>
    </div>
  );
}

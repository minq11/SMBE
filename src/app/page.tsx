import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Dashboard } from "@/features/dashboard/dashboard";
import { getCurrentSession } from "@/server/session";

export default async function Home() {
  await connection();

  const session = await getCurrentSession();
  // 로그인 상태여도 소속이 없거나 승인 대기이면 온보딩으로 유도
  if (session && (!session.membership || session.membership.status !== "ACTIVE")) {
    redirect("/onboarding");
  }

  return (
    <Dashboard
      companyName={session?.membership?.company_name}
      userName={session?.user.displayName ?? undefined}
      isAuthenticated={Boolean(session)}
    />
  );
}

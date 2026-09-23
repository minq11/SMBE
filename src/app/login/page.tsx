import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/session";
import { PublicHeader } from "@/features/auth/public-header";
import { ProviderButtons } from "@/features/auth/provider-buttons";

export const metadata = { title: "로그인 · 심플안전" };

function sanitizeNext(raw: string | undefined): string {
  // open-redirect 방지: 상대 경로만 허용
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const redirectTo = sanitizeNext(next);

  const session = await getCurrentSession();
  if (session) {
    // 이미 로그인 상태라면 next로 바로 이동 (초대 링크 등)
    if (next && next !== "/") redirect(redirectTo);
    redirect(session.membership ? "/" : "/onboarding");
  }

  return (
    <div className="auth-shell">
      <PublicHeader />
      <main className="auth-main">
        <div className="auth-card">
          <h1>
            Safety must be <span>easy.</span>
          </h1>
          <p className="lead">
            로그인하거나, 처음이시면 <strong>자동으로 무료 가입</strong>됩니다.
          </p>
          <ProviderButtons redirectTo={redirectTo} />
          <p className="auth-fine">
            계속하면 <Link href="/terms">이용약관</Link>과{" "}
            <Link href="/privacy">개인정보 처리방침</Link>에 동의한 것으로
            봅니다.
          </p>
        </div>
      </main>
    </div>
  );
}

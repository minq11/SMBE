import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Building2, KeyRound } from "lucide-react";
import { getCurrentSession } from "@/server/session";
import { PublicHeader } from "@/features/auth/public-header";
import { SiteFooter } from "@/features/auth/site-footer";
import { SignOutButton } from "@/features/auth/signout-button";

export const metadata = { title: "회사 연결 · 심플안전" };

export default async function OnboardingPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  if (session.membership) {
    if (session.membership.status === "ACTIVE") redirect("/");
    if (session.membership.status === "JOIN_PENDING") {
      return (
        <div className="auth-shell">
          <PublicHeader />
          <main className="auth-main">
            <div className="pending-notice">
              <h2>가입 승인 대기 중</h2>
              <p>
                <strong>{session.membership.company_name}</strong>의
                관리감독자가
                <br />
                가입을 승인하면 홈으로 이동합니다.
              </p>
              <p style={{ marginTop: 16 }}>
                <Link href="/my-page">내 정보 · 가입 신청 관리</Link>
                {" · "}
                <SignOutButton />
              </p>
            </div>
          </main>
          <SiteFooter />
        </div>
      );
    }
  }

  return (
    <div className="auth-shell">
      <PublicHeader />
      <main className="auth-main">
        <div style={{ width: "100%", maxWidth: 720 }}>
          <div style={{ marginBottom: 24 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>
              어떻게 시작할까요?
            </h1>
            <p style={{ color: "var(--muted)", fontSize: 13 }}>
              회사를 새로 만들거나, 이미 있는 회사에 회사코드로 참여하세요.
            </p>
          </div>
          <div className="onboarding-cards">
            <Link href="/onboarding/create-company" className="onboarding-card">
              <span className="badge">
                <Building2 size={14} /> 회사 만들기
              </span>
              <h3>우리 회사를 새로 등록</h3>
              <p>
                회사명·업종·인원규모를 입력하면 바로 사용할 수 있어요. 생성자는
                관리감독자 권한을 갖습니다.
              </p>
              <span className="arrow">
                시작하기 <ArrowRight size={14} />
              </span>
            </Link>
            <Link href="/onboarding/join" className="onboarding-card">
              <span className="badge">
                <KeyRound size={14} /> 회사코드로 참여
              </span>
              <h3>이미 있는 회사에 참여</h3>
              <p>
                회사 관리자가 알려준 회사코드를 입력하세요. 관리자가 승인한 뒤
                소속으로 등록됩니다.
              </p>
              <span className="arrow">
                코드 입력 <ArrowRight size={14} />
              </span>
            </Link>
          </div>
          <div className="form-note" style={{ textAlign: "center" }}>
            <Link href="/my-page">내 정보</Link>
            {" · "}
            <SignOutButton />
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

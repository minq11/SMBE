import Link from "next/link";
import { tierOf } from "@/components/shell/tier";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/session";
import { ownProfile } from "@/server/profile";
import { queryOne, query } from "@/server/db";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import {
  ProfileForm,
  LeaveCompanyForm,
} from "@/features/profile/profile-forms";
import { logoutAction } from "@/features/auth/logout-action";
import "@/features/profile/profile.css";

export const metadata = { title: "마이페이지 · SMBE" };
const roles: Record<string, string> = {
  WORKER: "작업자",
  MANAGER_SUPERVISOR: "관리감독자",
  MANAGER_SAFETY: "안전관리자",
};
const providers: Record<string, string> = {
  GOOGLE: "Google",
  KAKAO: "카카오",
  NAVER: "네이버",
};
const date = (v: string) =>
  new Date(v).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
export default async function MyPage({
  searchParams,
}: {
  searchParams: Promise<{ left?: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/login?next=/my-page");
  const data = await ownProfile(session.user.id);
  if (!data) redirect("/login");
  const { left } = await searchParams;
  const current = session.membership;
  const isManager = current?.status === "ACTIVE" && current.role !== "WORKER";
  const supervisorCount =
    current?.role === "MANAGER_SUPERVISOR" && current.status === "ACTIVE"
      ? await queryOne<{ n: number }>(
          "SELECT count(*)::int AS n FROM company_members WHERE company_id=$1 AND role='MANAGER_SUPERVISOR' AND status='ACTIVE' AND left_at IS NULL",
          [current.company_id],
        )
      : null;
  const blocked = supervisorCount?.n === 1;
  const notices = isManager
    ? await query<{ name: string; at: string }>(
        `SELECT m.snapshot_display_name AS name,l.at::text FROM audit_logs l JOIN company_members m ON m.id=l.target_id
    WHERE l.company_id=$1 AND l.action='SELF_RESIGN' AND l.at>now()-interval '7 days' ORDER BY l.at DESC LIMIT 20`,
        [current.company_id],
      )
    : [];
  return (
    <AppShell
      active="profile"
      breadcrumb={[{ label: "마이페이지" }]}
      companyName={current?.company_name ?? "소속 회사 없음"}
      tier={tierOf(session.membership)}
      userName={data.user.display_name}
      isAuthenticated
    >
      <PageHeader
        title="마이페이지"
        description="내 정보와 회사 소속을 확인하고 관리하세요."
      />
      {left === "1" && !current && (
        <p className="account-notice" role="status">
          회사 소속이 해제되었습니다. 새 회사에 가입할 수 있습니다.
        </p>
      )}
      <div className="account-grid">
        <section className="account-panel">
          <h2>로그인 계정</h2>
          <dl>
            <dt>로그인 연결</dt>
            <dd>
              {data.identities
                .map((i) => providers[i.provider] ?? i.provider)
                .join(" · ") || "연결 정보 없음"}
            </dd>
            <dt>이메일</dt>
            <dd>{data.user.email ?? "등록된 이메일 없음"}</dd>
            <dt>가입일</dt>
            <dd>{date(data.user.created_at)}</dd>
          </dl>
          <p className="account-muted">
            이 이메일은 로그인에 쓰는 계정 정보라 여기서 바꿀 수 없습니다.
            알림을 다른 주소로 받으려면 아래 [내 정보] 의 &apos;알림 받을
            메일&apos; 을 바꾸세요.
          </p>
        </section>
        {/* 소속·역할과 이름·연락처는 따로 볼 일이 없다. "나는 이 회사의 무엇이고
            연락은 이리로 온다" 는 한 덩어리라 한 칸에 둔다. */}
        <section className="account-panel">
          <h2>내 정보</h2>
          {current ? (
            <>
              <dl>
                <dt>회사</dt>
                <dd>{current.company_name}</dd>
                <dt>역할</dt>
                <dd>
                  {roles[current.role]}
                  {current.status === "JOIN_PENDING" && " · 가입 승인 대기"}
                </dd>
              </dl>
              <p className="account-links">
                {current.status === "ACTIVE" && (
                  <Link href="/work-orders">내 작업 확인</Link>
                )}
                {isManager && <Link href="/company/members">인원관리</Link>}
              </p>
            </>
          ) : (
            <p>
              현재 소속된 회사가 없습니다.{" "}
              <Link href="/onboarding">회사 가입·생성</Link>
            </p>
          )}
          <ProfileForm
            name={data.user.display_name}
            phone={data.user.phone}
            contactEmail={data.user.contact_email}
            loginEmail={data.user.email}
            version={data.user.version}
          />
        </section>
        <section className="account-panel account-panel--wide">
          <h2>소속 이력</h2>
          {!data.memberships.length ? (
            <p>소속 이력이 없습니다.</p>
          ) : (
            <ul className="account-history">
              {data.memberships.map((m) => (
                <li key={m.id}>
                  <strong>{m.company_name}</strong>
                  <span>
                    {roles[m.role]} ·{" "}
                    {m.left_at
                      ? "소속 종료"
                      : m.status === "JOIN_PENDING"
                        ? "승인 대기"
                        : "재직 중"}
                  </span>
                  <span>
                    {date(m.joined_at)} ~ {m.left_at ? date(m.left_at) : "현재"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {notices.length > 0 && (
        <section className="account-panel">
          <h2>소속 해제 알림</h2>
          <p className="account-muted">
            최근 7일간 구성원이 직접 해제한 소속입니다. 남은 작업의 배정을
            확인하세요.
          </p>
          <ul>
            {notices.map((n, i) => (
              <li key={i}>
                {n.name} · {date(n.at)}
              </li>
            ))}
          </ul>
          <Link href="/work-orders">작업 배정 확인</Link>
        </section>
      )}
      {current && (
        <section className="account-panel">
          <h2>
            {current.status === "JOIN_PENDING"
              ? "가입 신청 취소"
              : "회사 변경·본인 퇴사"}
          </h2>
          <p>
            다른 회사로 옮기려면 현재 소속을 먼저 해제해야 합니다. 계정은
            유지되며 과거 업무 기록은 이전 회사에 보존됩니다.
          </p>
          {blocked && (
            <p className="account-notice">
              마지막 관리감독자는 퇴사할 수 없습니다.{" "}
              <Link href="/company/members">
                인원관리에서 다른 관리감독자 지정
              </Link>
            </p>
          )}
          <LeaveCompanyForm
            memberId={current.member_id}
            pendingApproval={current.status === "JOIN_PENDING"}
            blocked={blocked}
          />
        </section>
      )}
      <form action={logoutAction}>
        <button className="secondary-button">로그아웃</button>
      </form>
    </AppShell>
  );
}

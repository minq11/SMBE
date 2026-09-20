import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, Home } from "lucide-react";
import { auth } from "@/auth";
import { queryOne, withTransaction } from "@/server/db";
import { acceptInvite } from "@/server/membership-mutations";
import { revalidatePath } from "next/cache";
import { PublicHeader } from "@/features/auth/public-header";

export const metadata = { title: "회사 초대 · SMBE" };

type InviteRow = {
  id: string;
  company_id: string;
  target_role: "MANAGER_SUPERVISOR" | "MANAGER_SAFETY" | "WORKER";
  accepted_at: string | null;
  expires_at: string | null;
  company_name: string;
};

async function loadInvite(token: string): Promise<InviteRow | null> {
  return queryOne<InviteRow>(
    `SELECT i.id,
            i.company_id,
            i.target_role,
            i.accepted_at,
            i.expires_at,
            c.name AS company_name
       FROM company_invitations i
       JOIN companies c ON c.id = i.company_id
      WHERE i.token = $1
        AND c.withdrawn_at IS NULL
      LIMIT 1`,
    [token],
  );
}

async function loadActiveMembership(userId: string) {
  return queryOne<{ id: string; status: string; company_name: string }>(
    `SELECT m.id, m.status, c.name AS company_name
       FROM company_members m
       JOIN companies c ON c.id = m.company_id
      WHERE m.user_id = $1 AND m.left_at IS NULL
      LIMIT 1`,
    [userId],
  );
}

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ failed?: string }>;
}) {
  const { token } = await params;
  const { failed } = await searchParams;
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  }

  const invite = await loadInvite(token);
  if (!invite) {
    return (
      <InviteErrorFrame
        title="유효하지 않은 초대"
        message="이 초대 링크를 찾을 수 없습니다. 관리자에게 새 링크를 요청하세요."
      />
    );
  }
  if (invite.accepted_at) {
    return (
      <InviteErrorFrame
        title="이미 사용된 초대"
        message="이 초대 링크는 이미 다른 사람이 사용했습니다. 관리자에게 새 링크를 요청하세요."
      />
    );
  }
  if (invite.expires_at && new Date(invite.expires_at) <= new Date()) {
    return (
      <InviteErrorFrame
        title="만료된 초대"
        message="이 초대 링크의 유효기간이 지났습니다. 관리자에게 새 링크를 요청하세요."
      />
    );
  }

  const existing = await loadActiveMembership(userId);
  if (existing) {
    return (
      <InviteErrorFrame
        title="이미 소속된 회사가 있습니다"
        message={`먼저 "${existing.company_name}"에서 퇴사한 뒤 이 링크를 다시 열어야 새 회사에 소속될 수 있습니다.`}
      />
    );
  }

  async function acceptAction() {
    "use server";
    const current = await auth();
    if (!current?.user?.id) redirect("/login");
    try {
      await withTransaction((client) =>
        acceptInvite(client, token, current.user.id),
      );
    } catch {
      // A fresh GET explains expired/used links without exposing DB errors.
      redirect(`/invite/${encodeURIComponent(token)}?failed=1`);
    }
    revalidatePath("/");
    revalidatePath("/company/members");
    redirect("/");
  }

  return (
    <div className="auth-shell">
      <PublicHeader />
      <main className="auth-main">
        <div className="pending-notice">
          <h2>{invite.company_name} 회사 초대</h2>
          <p>수락하면 이 회사의 구성원으로 가입합니다.</p>
          {failed && (
            <p role="alert">
              초대를 수락하지 못했습니다. 다시 시도하거나 관리자에게 문의하세요.
            </p>
          )}
          <form action={acceptAction}>
            <button type="submit" className="btn-primary">
              <Check size={14} /> 초대 수락하기
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

function InviteErrorFrame({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="auth-shell">
      <PublicHeader />
      <main className="auth-main">
        <div className="pending-notice">
          <h2>{title}</h2>
          <p>{message}</p>
          <p style={{ marginTop: 20 }}>
            <Link href="/" className="btn-primary">
              <Home size={14} /> 홈으로
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

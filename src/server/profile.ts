import "server-only";
import { query, queryOne } from "./db";

/**
 * 알림이 나갈 주소. 따로 정한 값이 있으면 그것, 없으면 로그인 계정의 메일이다.
 * 가입 화면의 기본값으로 쓴다 — 퇴사 후 다른 회사에 다시 들어올 때, 전에 정해
 * 둔 주소가 그대로 채워져 있어야 한다.
 */
export async function notifyEmailOf(userId: string): Promise<string> {
  const row = await queryOne<{ email: string | null }>(
    "SELECT COALESCE(contact_email, email) AS email FROM users WHERE id=$1",
    [userId],
  );
  return row?.email ?? "";
}

export async function ownProfile(userId: string) {
  const user = await queryOne<{
    display_name: string;
    email: string | null;
    contact_email: string | null;
    phone: string | null;
    created_at: string;
    version: string;
  }>(
    "SELECT display_name,email,contact_email,phone,created_at::text,updated_at::text AS version FROM users WHERE id=$1 AND status='ACTIVE'",
    [userId],
  );
  if (!user) return null;
  const identities = await query<{ provider: string }>(
    "SELECT provider FROM user_identities WHERE user_id=$1 ORDER BY created_at",
    [userId],
  );
  const memberships = await query<{
    id: string;
    company_id: string;
    company_name: string;
    role: string;
    status: string;
    joined_at: string;
    left_at: string | null;
  }>(
    `SELECT m.id,m.company_id,c.name AS company_name,m.role,m.status,m.joined_at::text,m.left_at::text
     FROM company_members m JOIN companies c ON c.id=m.company_id WHERE m.user_id=$1 ORDER BY m.joined_at DESC LIMIT 50`,
    [userId],
  );
  return { user, identities, memberships };
}

import "server-only";
import { query, queryOne } from "./db";

export async function ownProfile(userId: string) {
  const user = await queryOne<{
    display_name: string;
    email: string | null;
    phone: string | null;
    created_at: string;
    version: string;
  }>(
    "SELECT display_name,email,phone,created_at::text,updated_at::text AS version FROM users WHERE id=$1 AND status='ACTIVE'",
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

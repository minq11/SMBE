import "server-only";
import { auth } from "@/auth";
import { queryOne } from "@/server/db";

export type MembershipRole = "MANAGER_SUPERVISOR" | "MANAGER_SAFETY" | "WORKER";

export type MembershipStatus = "JOIN_PENDING" | "ACTIVE" | "RESIGNED";

export type ActiveMembership = {
  member_id: string;
  company_id: string;
  company_name: string;
  role: MembershipRole;
  status: MembershipStatus;
};

export type SessionUser = {
  id: string;
  displayName: string | null;
  email: string | null;
};

export type CurrentSession = {
  user: SessionUser;
  membership: ActiveMembership | null;
};

export async function getCurrentSession(): Promise<CurrentSession | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await queryOne<{ display_name: string; email: string | null }>(
    "SELECT display_name,email FROM users WHERE id=$1 AND status='ACTIVE'",
    [session.user.id],
  );
  if (!user) return null;

  const membership = await queryOne<ActiveMembership>(
    `SELECT m.id AS member_id,
            m.company_id,
            c.name AS company_name,
            m.role,
            m.status
       FROM company_members m
       JOIN companies c ON c.id = m.company_id
      WHERE m.user_id = $1
        AND m.left_at IS NULL
        AND c.withdrawn_at IS NULL
      LIMIT 1`,
    [session.user.id],
  );

  return {
    user: {
      id: session.user.id,
      displayName: user.display_name,
      email: user.email,
    },
    membership,
  };
}

import "server-only";

import { query, queryOne } from "@/server/db";
import type { MembershipRole } from "@/server/session";

export type MemberStatus = "ACTIVE" | "JOIN_PENDING" | "RESIGNED";

export type MemberRow = {
  member_id: string;
  user_id: string;
  display_name: string;
  snapshot_display_name: string;
  role: MembershipRole;
  status: MemberStatus;
  joined_via: "INVITE_LINK" | "DIRECT_JOIN" | "COMPANY_CREATE";
  joined_at: string;
  left_at: string | null;
  approved_at: string | null;
  email: string | null;
  phone: string | null;
};

export type OpenInviteRow = {
  invite_id: string;
  contact_email: string | null;
  contact_phone: string | null;
  target_role: MembershipRole;
  token: string;
  sent_at: string;
  expires_at: string | null;
  inviter_name: string;
};

export type CompanyOverview = {
  company_id: string;
  company_name: string;
  company_code: string;
  free_limit: number;
  active_count: number;
  pending_count: number;
  pro_state: "FREE" | "PRO_VOLUNTARY" | "PRO_MANDATORY";
};

export async function getCompanyOverview(
  companyId: string,
): Promise<CompanyOverview | null> {
  return queryOne<CompanyOverview>(
    `SELECT c.id AS company_id,
            c.name AS company_name,
            c.company_code,
            c.free_limit,
            c.pro_state,
            (
              SELECT COUNT(*)::int FROM company_members m
               WHERE m.company_id = c.id
                 AND m.status = 'ACTIVE'
                 AND m.left_at IS NULL
            ) AS active_count,
            (
              SELECT COUNT(*)::int FROM company_members m
               WHERE m.company_id = c.id
                 AND m.status = 'JOIN_PENDING'
                 AND m.left_at IS NULL
            ) AS pending_count
       FROM companies c
      WHERE c.id = $1
        AND c.withdrawn_at IS NULL`,
    [companyId],
  );
}

export async function listMembers(companyId: string): Promise<MemberRow[]> {
  return query<MemberRow>(
    `SELECT m.id AS member_id,
            m.user_id,
            u.display_name,
            m.snapshot_display_name,
            m.role,
            m.status,
            m.joined_via,
            m.joined_at,
            m.left_at,
            m.approved_at,
            u.email,
            u.phone
       FROM company_members m
       JOIN users u ON u.id = m.user_id
      WHERE m.company_id = $1
      ORDER BY
        CASE m.status
          WHEN 'JOIN_PENDING' THEN 0
          WHEN 'ACTIVE'       THEN 1
          WHEN 'RESIGNED'     THEN 2
        END,
        m.joined_at DESC`,
    [companyId],
  );
}

export async function listOpenInvites(
  companyId: string,
): Promise<OpenInviteRow[]> {
  return query<OpenInviteRow>(
    `SELECT i.id AS invite_id,
            i.contact_email,
            i.contact_phone,
            i.target_role,
            i.token,
            i.sent_at,
            i.expires_at,
            u.display_name AS inviter_name
       FROM company_invitations i
       JOIN users u ON u.id = i.inviter_id
      WHERE i.company_id = $1
        AND i.accepted_at IS NULL
        AND (i.expires_at IS NULL OR i.expires_at > now())
      ORDER BY i.sent_at DESC`,
    [companyId],
  );
}

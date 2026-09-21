import "server-only";

import { query, queryOne } from "@/server/db";

export type EmployeeSizeBand =
  "UNDER_5" | "FROM_5_TO_19" | "FROM_20_TO_49" | "FROM_50";

export type CompanyListRow = {
  company_id: string;
  company_name: string;
  company_code: string;
  business_type: string | null;
  initial_employee_size_band: EmployeeSizeBand;
  current_employee_size_band: EmployeeSizeBand | null;
  free_limit: number;
  pro_state: "FREE" | "PRO_VOLUNTARY" | "PRO_MANDATORY";
  plan: "BASIC" | "STANDARD" | "PRO" | "ENTERPRISE" | null;
  active_count: number;
  pending_count: number;
  created_at: string;
  creator_name: string | null;
  creator_email: string | null;
};

export type CompanyDetail = CompanyListRow & {
  business_start_date: string;
  expected_annual_revenue_manwon: number;
  withdrawn_at: string | null;
  resigned_count: number;
};

export type UserListRow = {
  user_id: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  status: "ACTIVE" | "WITHDRAWN";
  created_at: string;
  active_company_name: string | null;
  active_role: "MANAGER_SUPERVISOR" | "MANAGER_SAFETY" | "WORKER" | null;
};

export async function listCompanies(input: {
  search?: string;
  limit?: number;
}): Promise<CompanyListRow[]> {
  const search = input.search?.trim() ?? "";
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
  const like = `%${search}%`;

  return query<CompanyListRow>(
    `SELECT c.id AS company_id,
            c.name AS company_name,
            c.company_code,
            c.business_type,
            c.initial_employee_size_band,
            c.current_employee_size_band,
            c.free_limit,
            c.pro_state,
            c.plan,
            (SELECT COUNT(*)::int FROM company_members m
              WHERE m.company_id = c.id
                AND m.status = 'ACTIVE'
                AND m.left_at IS NULL) AS active_count,
            (SELECT COUNT(*)::int FROM company_members m
              WHERE m.company_id = c.id
                AND m.status = 'JOIN_PENDING'
                AND m.left_at IS NULL) AS pending_count,
            c.created_at,
            u.display_name AS creator_name,
            u.email AS creator_email
       FROM companies c
       LEFT JOIN users u ON u.id = c.created_by
      WHERE c.withdrawn_at IS NULL
        AND ($1 = ''
             OR c.name ILIKE $2
             OR c.company_code ILIKE $2
             OR COALESCE(c.business_type, '') ILIKE $2)
      ORDER BY c.created_at DESC
      LIMIT $3`,
    [search, like, limit],
  );
}

export async function getCompanyDetail(
  companyId: string,
): Promise<CompanyDetail | null> {
  return queryOne<CompanyDetail>(
    `SELECT c.id AS company_id,
            c.name AS company_name,
            c.company_code,
            c.business_type,
            c.business_start_date,
            c.expected_annual_revenue_manwon,
            c.initial_employee_size_band,
            c.current_employee_size_band,
            c.free_limit,
            c.pro_state,
            c.plan,
            c.withdrawn_at,
            c.created_at,
            u.display_name AS creator_name,
            u.email AS creator_email,
            (SELECT COUNT(*)::int FROM company_members m
              WHERE m.company_id = c.id
                AND m.status = 'ACTIVE'
                AND m.left_at IS NULL) AS active_count,
            (SELECT COUNT(*)::int FROM company_members m
              WHERE m.company_id = c.id
                AND m.status = 'JOIN_PENDING'
                AND m.left_at IS NULL) AS pending_count,
            (SELECT COUNT(*)::int FROM company_members m
              WHERE m.company_id = c.id
                AND (m.status = 'RESIGNED' OR m.left_at IS NOT NULL)) AS resigned_count
       FROM companies c
       LEFT JOIN users u ON u.id = c.created_by
      WHERE c.id = $1`,
    [companyId],
  );
}

export async function listUsers(input: {
  search?: string;
  limit?: number;
}): Promise<UserListRow[]> {
  const search = input.search?.trim() ?? "";
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
  const like = `%${search}%`;

  return query<UserListRow>(
    `SELECT u.id AS user_id,
            u.display_name,
            u.email,
            u.phone,
            u.status,
            u.created_at,
            c.name AS active_company_name,
            m.role AS active_role
       FROM users u
       LEFT JOIN company_members m
              ON m.user_id = u.id AND m.left_at IS NULL
       LEFT JOIN companies c ON c.id = m.company_id
      WHERE ($1 = ''
             OR u.display_name ILIKE $2
             OR COALESCE(u.email::text, '') ILIKE $2
             OR COALESCE(u.phone, '') ILIKE $2)
      ORDER BY u.created_at DESC
      LIMIT $3`,
    [search, like, limit],
  );
}

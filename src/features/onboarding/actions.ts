"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { queryOne, withTransaction } from "@/server/db";
import { lockCompany } from "@/server/membership-mutations";

const SIZE_BANDS = [
  "UNDER_5",
  "FROM_5_TO_19",
  "FROM_20_TO_49",
  "FROM_50",
] as const;

const createCompanySchema = z.object({
  name: z.string().trim().min(1, "회사명을 입력하세요").max(80),
  business_type: z.string().trim().min(1, "업종을 입력하세요").max(80),
  initial_employee_size_band: z.enum(SIZE_BANDS),
  business_start_date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "사업개시일을 선택하세요"),
  expected_annual_revenue_manwon: z.coerce
    .number({ error: "예상 연매출액을 입력하세요" })
    .int("정수로 입력하세요 (만원 단위)")
    .min(0, "0 이상이어야 합니다")
    .max(10_000_000_000, "값이 너무 큽니다"),
  display_name: z.string().trim().min(1, "이름을 입력하세요").max(60),
});

const joinSchema = z.object({
  company_code: z
    .string()
    .trim()
    .min(4, "회사코드를 확인하세요")
    .max(32)
    .transform((value) => value.toUpperCase()),
  display_name: z.string().trim().min(1).max(60),
});

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/1/I/O
function generateCompanyCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let out = "";
  for (const byte of bytes) out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return out;
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");
  return userId;
}

export type FormState = { error?: string } | undefined;

export async function createCompanyAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const userId = await requireUserId();

  const parsed = createCompanySchema.safeParse({
    name: formData.get("name"),
    business_type: formData.get("business_type"),
    initial_employee_size_band: formData.get("initial_employee_size_band"),
    business_start_date: formData.get("business_start_date") ?? "",
    expected_annual_revenue_manwon: formData.get(
      "expected_annual_revenue_manwon",
    ),
    display_name: formData.get("display_name"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "입력 값을 확인하세요" };
  }

  const existingActive = await queryOne<{ id: string }>(
    "SELECT id FROM company_members WHERE user_id = $1 AND left_at IS NULL LIMIT 1",
    [userId],
  );
  if (existingActive) {
    return {
      error:
        "이미 소속된 회사가 있습니다. 새 회사를 만들려면 먼저 현재 소속에서 나가야 합니다.",
    };
  }

  const membershipError = await withTransaction(async (client) => {
    await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [
      userId,
    ]);
    const { rows: memberships } = await client.query(
      "SELECT id FROM company_members WHERE user_id = $1 AND left_at IS NULL",
      [userId],
    );
    if (memberships.length)
      return { error: "이미 소속·승인대기 중인 회사가 있습니다." };
    // Ensure display_name reflects the user's input in users
    await client.query("UPDATE users SET display_name = $1 WHERE id = $2", [
      parsed.data.display_name,
      userId,
    ]);

    // Retry a few times to avoid company_code collision
    let companyId: string | null = null;
    for (let attempt = 0; attempt < 5 && !companyId; attempt++) {
      const code = generateCompanyCode();
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO companies
             (name, business_type, business_start_date, company_code,
              initial_employee_size_band, current_employee_size_band,
              active_headcount, expected_annual_revenue_manwon, created_by)
           VALUES ($1, $2, $3::date, $4, $5::employee_size_band,
                   'UNDER_5'::employee_size_band, 1, $6, $7)
           ON CONFLICT (company_code) DO NOTHING
           RETURNING id`,
        [
          parsed.data.name,
          parsed.data.business_type,
          parsed.data.business_start_date,
          code,
          parsed.data.initial_employee_size_band,
          parsed.data.expected_annual_revenue_manwon,
          userId,
        ],
      );
      companyId = rows[0]?.id ?? null;
    }
    if (!companyId)
      throw new Error("회사코드 생성 실패. 잠시 뒤 다시 시도하세요.");

    await client.query(
      `INSERT INTO company_members
         (user_id, company_id, role, status, joined_via, snapshot_display_name)
       VALUES ($1, $2, 'MANAGER_SUPERVISOR', 'ACTIVE', 'COMPANY_CREATE', $3)`,
      [userId, companyId, parsed.data.display_name],
    );
  });
  if (membershipError) return membershipError;

  redirect("/");
}

export async function joinCompanyAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const userId = await requireUserId();

  const parsed = joinSchema.safeParse({
    company_code: formData.get("company_code"),
    display_name: formData.get("display_name"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "입력 값을 확인하세요" };
  }

  const existingActive = await queryOne<{ id: string }>(
    "SELECT id FROM company_members WHERE user_id = $1 AND left_at IS NULL LIMIT 1",
    [userId],
  );
  if (existingActive) {
    return { error: "이미 소속·승인대기 중인 회사가 있습니다." };
  }

  const company = await queryOne<{ id: string }>(
    "SELECT id FROM companies WHERE company_code = $1 AND withdrawn_at IS NULL",
    [parsed.data.company_code],
  );
  if (!company) {
    return { error: "회사코드를 찾을 수 없습니다. 관리자에게 확인하세요." };
  }

  const membershipError = await withTransaction(async (client) => {
    await lockCompany(client, company.id);
    await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [
      userId,
    ]);
    const { rows: memberships } = await client.query(
      "SELECT id FROM company_members WHERE user_id = $1 AND left_at IS NULL",
      [userId],
    );
    if (memberships.length)
      return { error: "이미 소속·승인대기 중인 회사가 있습니다." };
    await client.query("UPDATE users SET display_name = $1 WHERE id = $2", [
      parsed.data.display_name,
      userId,
    ]);
    await client.query(
      `INSERT INTO company_members
         (user_id, company_id, role, status, joined_via, snapshot_display_name)
       VALUES ($1, $2, 'WORKER', 'JOIN_PENDING', 'DIRECT_JOIN', $3)`,
      [userId, company.id, parsed.data.display_name],
    );
  });
  if (membershipError) return membershipError;

  redirect("/onboarding");
}

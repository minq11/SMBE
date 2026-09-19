"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentSession, type MembershipRole } from "@/server/session";
import { query, queryOne, withTransaction } from "@/server/db";
import { isLastSupervisor } from "@/server/members";
import { inviteEmailTemplate, sendEmail } from "@/server/email";

export type EmailStatus = "sent" | "failed" | "skipped" | "none";

export type ActionState =
  | undefined
  | {
      error?: string;
      message?: string;
      inviteToken?: string;
      inviteEmail?: EmailStatus;
      inviteEmailError?: string;
    };

const ROLE_LABEL: Record<MembershipRole, string> = {
  MANAGER_SUPERVISOR: "관리감독자",
  MANAGER_SAFETY: "안전관리자",
  WORKER: "작업자",
};

async function resolveOrigin(): Promise<string> {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

const ROLE_VALUES = ["MANAGER_SUPERVISOR", "MANAGER_SAFETY", "WORKER"] as const;

async function requireManager(): Promise<{
  userId: string;
  memberId: string;
  companyId: string;
  role: MembershipRole;
}> {
  const session = await getCurrentSession();
  if (!session?.membership) throw new Error("소속된 회사가 없습니다.");
  const { user, membership } = session;
  if (
    membership.status !== "ACTIVE" ||
    membership.role === "WORKER"
  ) {
    throw new Error("이 기능은 관리자(관리감독자·안전관리자)만 사용할 수 있습니다.");
  }
  return {
    userId: user.id,
    memberId: membership.member_id,
    companyId: membership.company_id,
    role: membership.role,
  };
}

const TOKEN_ALPHABET =
  "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generateInviteToken(length = 22): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const b of bytes) out += TOKEN_ALPHABET[b % TOKEN_ALPHABET.length];
  return out;
}

// -----------------------------------------------------------------------------
// 초대 링크 생성
// -----------------------------------------------------------------------------

const createInviteSchema = z
  .object({
    target_role: z.enum(ROLE_VALUES),
    contact_email: z
      .string()
      .trim()
      .toLowerCase()
      .email("이메일 형식을 확인하세요")
      .max(180)
      .optional()
      .or(z.literal("")),
    contact_phone: z
      .string()
      .trim()
      .regex(/^[0-9+\-() ]{7,20}$/, "전화번호 형식을 확인하세요")
      .optional()
      .or(z.literal("")),
  })
  .refine(
    (v) =>
      (v.contact_email && v.contact_email !== "") ||
      (v.contact_phone && v.contact_phone !== ""),
    { message: "이메일 또는 전화번호 중 하나는 입력하세요" },
  );

export async function createInviteAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let ctx;
  try {
    ctx = await requireManager();
  } catch (error) {
    return { error: (error as Error).message };
  }

  const parsed = createInviteSchema.safeParse({
    target_role: formData.get("target_role"),
    contact_email: formData.get("contact_email") ?? "",
    contact_phone: formData.get("contact_phone") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "입력 값을 확인하세요" };
  }

  // 관리감독자만 관리감독자 초대 가능
  if (
    parsed.data.target_role === "MANAGER_SUPERVISOR" &&
    ctx.role !== "MANAGER_SUPERVISOR"
  ) {
    return { error: "관리감독자 초대는 관리감독자만 발송할 수 있습니다." };
  }

  const email = parsed.data.contact_email?.trim() || null;
  const phone = parsed.data.contact_phone?.trim() || null;

  // 토큰 충돌 재시도
  let insertedToken: string | null = null;
  let expiresAt: Date | null = null;
  for (let attempt = 0; attempt < 5 && !insertedToken; attempt++) {
    const token = generateInviteToken();
    try {
      const rows = await query<{ expires_at: string | null }>(
        `INSERT INTO company_invitations
           (company_id, inviter_id, contact_email, contact_phone,
            target_role, token, expires_at)
         VALUES ($1, $2, $3, $4, $5::company_member_role, $6,
                 now() + interval '14 days')
         RETURNING expires_at`,
        [ctx.companyId, ctx.userId, email, phone, parsed.data.target_role, token],
      );
      insertedToken = token;
      expiresAt = rows[0]?.expires_at ? new Date(rows[0].expires_at) : null;
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code !== "23505") throw error;
    }
  }
  if (!insertedToken) {
    return { error: "초대 토큰 생성에 실패했습니다. 다시 시도해 주세요." };
  }

  // 이메일 발송 (contact_email이 있을 때만)
  let inviteEmail: EmailStatus = "none";
  let inviteEmailError: string | undefined;
  if (email) {
    const origin = await resolveOrigin();
    const acceptUrl = `${origin}/invite/${insertedToken}`;
    const companyRow = await queryOne<{ name: string }>(
      "SELECT name FROM companies WHERE id = $1",
      [ctx.companyId],
    );
    const inviterRow = await queryOne<{ display_name: string }>(
      "SELECT display_name FROM users WHERE id = $1",
      [ctx.userId],
    );
    const template = inviteEmailTemplate({
      companyName: companyRow?.name ?? "회사",
      inviterName: inviterRow?.display_name ?? "관리자",
      roleLabel: ROLE_LABEL[parsed.data.target_role],
      acceptUrl,
      expiresAt,
    });
    const result = await sendEmail({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
    if (result.status === "sent") inviteEmail = "sent";
    else if (result.status === "skipped") {
      inviteEmail = "skipped";
      inviteEmailError = result.reason;
    } else {
      inviteEmail = "failed";
      inviteEmailError = result.error;
    }
  }

  revalidatePath("/company/members");
  return {
    inviteToken: insertedToken,
    inviteEmail,
    inviteEmailError,
  };
}

// -----------------------------------------------------------------------------
// 초대 링크 폐기
// -----------------------------------------------------------------------------

export async function revokeInviteAction(inviteId: string): Promise<ActionState> {
  let ctx;
  try {
    ctx = await requireManager();
  } catch (error) {
    return { error: (error as Error).message };
  }
  await query(
    `UPDATE company_invitations
        SET expires_at = now()
      WHERE id = $1 AND company_id = $2 AND accepted_at IS NULL`,
    [inviteId, ctx.companyId],
  );
  revalidatePath("/company/members");
  return { message: "초대 링크를 폐기했습니다." };
}

// -----------------------------------------------------------------------------
// 가입 승인 · 거부 (회사코드 직접 가입 대기 건)
// -----------------------------------------------------------------------------

export async function approvePendingAction(memberId: string): Promise<ActionState> {
  let ctx;
  try {
    ctx = await requireManager();
  } catch (error) {
    return { error: (error as Error).message };
  }

  const target = await queryOne<{ status: string }>(
    "SELECT status FROM company_members WHERE id = $1 AND company_id = $2",
    [memberId, ctx.companyId],
  );
  if (!target) return { error: "대상을 찾을 수 없습니다." };
  if (target.status !== "JOIN_PENDING") {
    return { error: "이미 처리된 요청입니다." };
  }

  await query(
    `UPDATE company_members
        SET status = 'ACTIVE',
            approved_by = $2,
            approved_at = now()
      WHERE id = $1`,
    [memberId, ctx.userId],
  );
  revalidatePath("/company/members");
  return { message: "가입을 승인했습니다." };
}

export async function rejectPendingAction(memberId: string): Promise<ActionState> {
  let ctx;
  try {
    ctx = await requireManager();
  } catch (error) {
    return { error: (error as Error).message };
  }

  const target = await queryOne<{ status: string }>(
    "SELECT status FROM company_members WHERE id = $1 AND company_id = $2",
    [memberId, ctx.companyId],
  );
  if (!target) return { error: "대상을 찾을 수 없습니다." };
  if (target.status !== "JOIN_PENDING") {
    return { error: "이미 처리된 요청입니다." };
  }

  // 거부 = 소속 해제. 감사 로그를 위해 RESIGNED로 마감.
  await query(
    `UPDATE company_members
        SET status = 'RESIGNED', left_at = now()
      WHERE id = $1`,
    [memberId],
  );
  revalidatePath("/company/members");
  return { message: "가입을 거부했습니다." };
}

// -----------------------------------------------------------------------------
// 역할 변경
// -----------------------------------------------------------------------------

const changeRoleSchema = z.object({
  member_id: z.string().uuid(),
  role: z.enum(ROLE_VALUES),
});

export async function changeRoleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let ctx;
  try {
    ctx = await requireManager();
  } catch (error) {
    return { error: (error as Error).message };
  }

  const parsed = changeRoleSchema.safeParse({
    member_id: formData.get("member_id"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "잘못된 요청" };
  }

  const target = await queryOne<{ role: MembershipRole; user_id: string }>(
    `SELECT role, user_id FROM company_members
      WHERE id = $1 AND company_id = $2 AND status = 'ACTIVE' AND left_at IS NULL`,
    [parsed.data.member_id, ctx.companyId],
  );
  if (!target) return { error: "대상을 찾을 수 없습니다." };
  if (target.role === parsed.data.role) return { message: "변경 사항이 없습니다." };

  const isSelf = target.user_id === ctx.userId;
  const nextRole = parsed.data.role;

  // 규칙 (SMBE 설계 §3, §4 역할 변경 규칙)
  //  - 안전관리자 → 관리감독자 승격: 관리감독자만 가능 (본인 승격 불가)
  //  - 관리감독자 → 안전관리자 강등: 본인만 가능
  //  - 마지막 관리감독자는 역할 변경 차단
  //  - WORKER ↔ MANAGER_SAFETY 변경은 관리자 그룹 누구나
  if (nextRole === "MANAGER_SUPERVISOR") {
    if (ctx.role !== "MANAGER_SUPERVISOR") {
      return { error: "관리감독자 승격은 관리감독자만 할 수 있습니다." };
    }
    if (isSelf) {
      return { error: "본인을 관리감독자로 승격할 수 없습니다." };
    }
  }
  if (target.role === "MANAGER_SUPERVISOR" && nextRole !== "MANAGER_SUPERVISOR") {
    if (!isSelf) {
      return { error: "관리감독자 역할 변경은 본인만 할 수 있습니다." };
    }
    if (await isLastSupervisor(ctx.companyId, parsed.data.member_id)) {
      return {
        error:
          "회사에 관리감독자가 1명뿐이라 역할을 변경할 수 없습니다. 먼저 다른 관리감독자를 지정하세요.",
      };
    }
  }

  await query(
    `UPDATE company_members SET role = $2::company_member_role WHERE id = $1`,
    [parsed.data.member_id, nextRole],
  );
  revalidatePath("/company/members");
  return { message: "역할을 변경했습니다." };
}

// -----------------------------------------------------------------------------
// 퇴사 처리
// -----------------------------------------------------------------------------

export async function resignMemberAction(memberId: string): Promise<ActionState> {
  let ctx;
  try {
    ctx = await requireManager();
  } catch (error) {
    return { error: (error as Error).message };
  }

  const target = await queryOne<{ role: MembershipRole; user_id: string }>(
    `SELECT role, user_id FROM company_members
      WHERE id = $1 AND company_id = $2 AND status = 'ACTIVE' AND left_at IS NULL`,
    [memberId, ctx.companyId],
  );
  if (!target) return { error: "대상을 찾을 수 없습니다." };

  if (
    target.role === "MANAGER_SUPERVISOR" &&
    (await isLastSupervisor(ctx.companyId, memberId))
  ) {
    return {
      error:
        "회사의 마지막 관리감독자는 퇴사시킬 수 없습니다. 먼저 다른 관리감독자를 지정하세요.",
    };
  }

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE company_members
          SET status = 'RESIGNED', left_at = now()
        WHERE id = $1`,
      [memberId],
    );
    // 활성 인원 카운트 조정
    await client.query(
      `UPDATE companies
          SET active_headcount = GREATEST(active_headcount - 1, 0)
        WHERE id = $1`,
      [ctx.companyId],
    );
  });

  revalidatePath("/company/members");
  return { message: "퇴사 처리했습니다." };
}

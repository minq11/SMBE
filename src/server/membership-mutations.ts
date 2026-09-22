import type { PoolClient } from "@neondatabase/serverless";

// Every membership writer locks the company before reading membership state.
import {
  seatsExhausted,
  seatCapFor,
  ENTERPRISE_FROM,
  planName,
  planAfter,
  type ContractedPlan,
  type PaidPlanId,
} from "../features/billing/plans";

export async function lockCompany(client: PoolClient, companyId: string) {
  const { rows } = await client.query(
    "SELECT id FROM companies WHERE id = $1 AND withdrawn_at IS NULL FOR UPDATE",
    [companyId],
  );
  if (!rows.length) throw new Error("회사를 찾을 수 없습니다.");
}

export async function refreshHeadcount(client: PoolClient, companyId: string) {
  await client.query(
    `UPDATE companies SET active_headcount = counts.n,
       current_employee_size_band = (CASE
         WHEN counts.n < 5 THEN 'UNDER_5'
         WHEN counts.n < 20 THEN 'FROM_5_TO_19'
         WHEN counts.n < 50 THEN 'FROM_20_TO_49'
         ELSE 'FROM_50' END)::employee_size_band
     FROM (SELECT COUNT(*)::int AS n FROM company_members
       WHERE company_id = $1 AND status = 'ACTIVE' AND left_at IS NULL) counts
     WHERE companies.id = $1`,
    [companyId],
  );
}

/**
 * 계약 인원을 다 쓴 유료 회사는 인원을 더 등록할 수 없다. 상향 결제가 등록의 조건이다.
 * 무료 회사는 상한이 없다 — 무료는 인원이 아니라 기능이 제한된다.
 *
 * 반드시 lockCompany() 안에서 호출해야 한다. 동시에 두 명을 승인하면
 * 두 트랜잭션이 같은 인원 수를 읽어 상한을 넘길 수 있다.
 */
export async function seatCapacityError(
  client: PoolClient,
  companyId: string,
): Promise<string | null> {
  const { rows } = await client.query<{
    pro_state: string;
    plan: ContractedPlan;
    active: number;
  }>(
    `SELECT c.pro_state, c.plan,
            (SELECT COUNT(*)::int FROM company_members m
              WHERE m.company_id = c.id AND m.status = 'ACTIVE' AND m.left_at IS NULL) AS active
       FROM companies c WHERE c.id = $1`,
    [companyId],
  );
  const row = rows[0];
  if (!row || row.pro_state === "FREE") return null;
  if (!seatsExhausted(row.plan, row.active)) return null;

  const cap = seatCapFor(row.plan);
  const next = planAfter(row.plan as PaidPlanId);
  return (
    `${planName(row.plan)} 요금제는 ${cap}명까지입니다 (현재 ${row.active}명). ` +
    (next
      ? `${next.name} 으로 변경하면 바로 등록할 수 있습니다.`
      : `${ENTERPRISE_FROM}인 이상은 가격을 협의해야 합니다. 문의 폼으로 연락 주세요.`)
  );
}

export async function acceptInvite(
  client: PoolClient,
  token: string,
  userId: string,
  /**
   * 초대 수락도 가입이라, 이 자리에서 연락처를 함께 받는다 (선택 입력).
   * 넘기지 않으면 지금 저장된 값을 그대로 둔다.
   */
  contact?: { contactEmail: string; phone: string },
) {
  const { rows: invites } = await client.query(
    "SELECT company_id FROM company_invitations WHERE token = $1",
    [token],
  );
  if (!invites[0]) throw new Error("유효하지 않은 초대입니다.");
  const companyId = invites[0].company_id as string;
  await lockCompany(client, companyId);
  const { rows: users } = await client.query(
    "SELECT display_name FROM users WHERE id = $1 FOR UPDATE",
    [userId],
  );
  if (!users[0]) throw new Error("사용자를 찾을 수 없습니다.");
  if (contact)
    await client.query(
      "UPDATE users SET contact_email = $2, phone = $3 WHERE id = $1",
      [userId, contact.contactEmail || null, contact.phone || null],
    );
  const { rows: existing } = await client.query(
    "SELECT id FROM company_members WHERE user_id = $1 AND left_at IS NULL",
    [userId],
  );
  if (existing.length)
    throw new Error("이미 소속·승인대기 중인 회사가 있습니다.");
  const { rows: claimed } = await client.query(
    `UPDATE company_invitations SET accepted_at = clock_timestamp(), accepted_by = $2
      WHERE token = $1 AND accepted_at IS NULL
        AND (expires_at IS NULL OR expires_at > clock_timestamp())
      RETURNING target_role`,
    [token, userId],
  );
  if (!claimed[0]) throw new Error("이미 사용되었거나 만료된 초대입니다.");
  const capacity = await seatCapacityError(client, companyId);
  if (capacity) throw new Error(capacity);
  await client.query(
    `INSERT INTO company_members
       (user_id, company_id, role, status, joined_via, snapshot_display_name, approved_at)
     VALUES ($1, $2, $3::company_member_role, 'ACTIVE', 'INVITE_LINK', $4, now())`,
    [userId, companyId, claimed[0].target_role, users[0].display_name],
  );
  await refreshHeadcount(client, companyId);
}

export async function mutateMember(
  client: PoolClient,
  actor: { userId: string; companyId: string },
  memberId: string,
  operation: "approve" | "reject" | "resign" | "role",
  nextRole?: string,
): Promise<{ error?: string; message?: string }> {
  await lockCompany(client, actor.companyId);
  const { rows: actors } = await client.query(
    `SELECT role FROM company_members WHERE user_id = $1 AND company_id = $2
      AND status = 'ACTIVE' AND left_at IS NULL`,
    [actor.userId, actor.companyId],
  );
  if (!actors[0] || actors[0].role === "WORKER") {
    return { error: "현재 관리자 권한이 없습니다." };
  }
  const { rows } = await client.query(
    "SELECT role, user_id, status FROM company_members WHERE id = $1 AND company_id = $2 AND left_at IS NULL",
    [memberId, actor.companyId],
  );
  const target = rows[0];
  const pending = operation === "approve" || operation === "reject";
  if (!target || target.status !== (pending ? "JOIN_PENDING" : "ACTIVE")) {
    return { error: "대상을 찾을 수 없거나 이미 처리된 요청입니다." };
  }
  if (operation === "role") {
    if (
      !["WORKER", "MANAGER_SAFETY", "MANAGER_SUPERVISOR"].includes(
        nextRole ?? "",
      )
    ) {
      return { error: "잘못된 역할입니다." };
    }
    if (target.role === nextRole) return { message: "변경 사항이 없습니다." };
    if (
      nextRole === "MANAGER_SUPERVISOR" &&
      (actors[0].role !== "MANAGER_SUPERVISOR" ||
        target.user_id === actor.userId)
    ) {
      return { error: "다른 관리감독자만 관리감독자 승격을 할 수 있습니다." };
    }
    if (
      target.role === "MANAGER_SUPERVISOR" &&
      target.user_id !== actor.userId
    ) {
      return { error: "관리감독자 역할 변경은 본인만 할 수 있습니다." };
    }
  }
  if (!pending && target.role === "MANAGER_SUPERVISOR") {
    const { rows: counts } = await client.query(
      `SELECT COUNT(*)::int AS n FROM company_members WHERE company_id = $1
        AND status = 'ACTIVE' AND left_at IS NULL AND role = 'MANAGER_SUPERVISOR'`,
      [actor.companyId],
    );
    if (counts[0].n <= 1)
      return {
        error:
          "마지막 관리감독자는 변경·퇴사할 수 없습니다. 먼저 다른 관리감독자를 지정하세요.",
      };
  }
  if (operation === "approve") {
    // 승인은 인원을 늘리므로 계약 인원을 확인한다. 반려는 확인하지 않는다.
    const capacity = await seatCapacityError(client, actor.companyId);
    if (capacity) return { error: capacity };
    await client.query(
      "UPDATE company_members SET status = 'ACTIVE', approved_by = $2, approved_at = now() WHERE id = $1",
      [memberId, actor.userId],
    );
  } else if (operation === "role") {
    await client.query(
      "UPDATE company_members SET role = $2::company_member_role WHERE id = $1",
      [memberId, nextRole],
    );
  } else {
    await client.query(
      "UPDATE company_members SET status = 'RESIGNED', left_at = now() WHERE id = $1",
      [memberId],
    );
  }
  await refreshHeadcount(client, actor.companyId);
  return {
    message: {
      approve: "가입을 승인했습니다.",
      reject: "가입을 거부했습니다.",
      resign: "퇴사 처리했습니다.",
      role: "역할을 변경했습니다.",
    }[operation],
  };
}

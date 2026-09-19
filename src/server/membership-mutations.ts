import type { PoolClient } from "@neondatabase/serverless";

// Every membership writer locks the company before reading membership state.
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

export async function acceptInvite(
  client: PoolClient,
  token: string,
  userId: string,
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

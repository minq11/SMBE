import type { PoolClient } from "@neondatabase/serverless";
import { z } from "zod";
import { lockCompany, refreshHeadcount } from "./membership-mutations";

export class ProfileError extends Error {}
const profileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "이름을 입력하세요.")
    .max(60, "이름은 60자 이내로 입력하세요.")
    .refine(
      (v) => !/[\u0000-\u001f\u007f]/.test(v),
      "이름에 제어문자를 사용할 수 없습니다.",
    ),
  phone: z
    .string()
    .trim()
    .max(30)
    .transform((v) => v.replace(/[\s()-]/g, ""))
    .refine(
      (v) => v === "" || /^\+?[0-9]{7,15}$/.test(v),
      "전화번호는 7~15자리 숫자로 입력하세요.",
    ),
  version: z.string().min(1).max(60),
});
export async function updateOwnProfile(
  client: PoolClient,
  userId: string,
  input: unknown,
) {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success)
    throw new ProfileError(
      parsed.error.issues[0]?.message ?? "입력값을 확인하세요.",
    );
  const d = parsed.data;
  const { rows } = await client.query(
    "SELECT updated_at::text AS version FROM users WHERE id=$1 AND status='ACTIVE' FOR UPDATE",
    [userId],
  );
  if (!rows.length) throw new ProfileError("사용 가능한 계정이 아닙니다.");
  if (rows[0].version !== d.version)
    throw new ProfileError(
      "다른 화면에서 정보가 변경됐습니다. 새로고침 후 다시 입력하세요.",
    );
  const updated = await client.query(
    `UPDATE users SET display_name=$2,phone=$3 WHERE id=$1 RETURNING updated_at::text AS version`,
    [userId, d.displayName, d.phone || null],
  );
  await client.query(
    `INSERT INTO audit_logs(actor_id,action,target_type,target_id,after_json) VALUES($1,'UPDATE_PROFILE','users',$1,'{"fields":["display_name","phone"]}'::jsonb)`,
    [userId],
  );
  return updated.rows[0].version as string;
}

export async function leaveOwnCompany(
  client: PoolClient,
  userId: string,
  memberId: string,
) {
  const { rows: targets } = await client.query(
    "SELECT company_id FROM company_members WHERE id=$1 AND user_id=$2",
    [memberId, userId],
  );
  if (!targets.length)
    throw new ProfileError("본인의 소속만 해제할 수 있습니다.");
  const companyId = targets[0].company_id as string;
  await lockCompany(client, companyId);
  const { rows: users } = await client.query(
    "SELECT display_name FROM users WHERE id=$1 AND status='ACTIVE' FOR UPDATE",
    [userId],
  );
  if (!users.length) throw new ProfileError("사용 가능한 계정이 아닙니다.");
  const { rows } = await client.query(
    "SELECT role,status,left_at FROM company_members WHERE id=$1 AND user_id=$2 FOR UPDATE",
    [memberId, userId],
  );
  const m = rows[0];
  if (m.left_at || m.status === "RESIGNED") return { companyId, unassigned: 0 };
  if (m.status === "ACTIVE" && m.role === "MANAGER_SUPERVISOR") {
    const count = await client.query(
      "SELECT count(*)::int AS n FROM company_members WHERE company_id=$1 AND status='ACTIVE' AND left_at IS NULL AND role='MANAGER_SUPERVISOR'",
      [companyId],
    );
    if (count.rows[0].n <= 1)
      throw new ProfileError(
        "마지막 관리감독자는 퇴사할 수 없습니다. 인원관리에서 다른 관리감독자를 먼저 지정하세요.",
      );
  }
  const pending = await client.query(
    `SELECT 1 FROM inspection_findings f JOIN inspection_results r ON r.id=f.result_id
    JOIN inspections i ON i.id=r.inspection_id JOIN work_sessions s ON s.id=i.session_id
    WHERE s.company_id=$1 AND f.assigned_manager_id=$2 AND f.status='OPEN' LIMIT 1`,
    [companyId, userId],
  );
  if (pending.rows.length)
    throw new ProfileError(
      "담당 중인 미조치 부적합이 있습니다. 안전점검에서 조치를 완료한 뒤 퇴사하세요.",
    );
  const { rows: time } = await client.query(
    "SELECT clock_timestamp()::text AS at",
  );
  const at = time[0].at;
  const unassigned = await client.query(
    `UPDATE work_order_assignments a SET status='UNASSIGNED',unassigned_at=$3
    FROM work_orders w WHERE a.work_order_id=w.id AND w.company_id=$1 AND a.user_id=$2 AND a.status<>'UNASSIGNED'
    AND w.status IN ('ISSUED','IN_PROGRESS') AND EXISTS(SELECT 1 FROM work_sessions s WHERE s.work_order_id=w.id AND s.ends_at+interval '2 hours'>=$3::timestamptz)
    RETURNING a.work_order_id`,
    [companyId, userId, at],
  );
  await client.query(
    "UPDATE company_members SET status='RESIGNED',left_at=$3,snapshot_display_name=$4 WHERE id=$1 AND user_id=$2",
    [memberId, userId, at, users[0].display_name],
  );
  await refreshHeadcount(client, companyId);
  await client.query(
    `INSERT INTO audit_logs(company_id,actor_id,action,target_type,target_id,after_json)
    VALUES($1,$2,'SELF_RESIGN','company_members',$3,$4::jsonb)`,
    [
      companyId,
      userId,
      memberId,
      JSON.stringify({
        previousStatus: m.status,
        unassignedOrderIds: unassigned.rows.map((r) => r.work_order_id),
      }),
    ],
  );
  return { companyId, unassigned: unassigned.rows.length };
}

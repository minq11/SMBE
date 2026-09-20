import type { PoolClient } from "@neondatabase/serverless";
import { z } from "zod";
import { lockCompany } from "./membership-mutations";
import {
  memberAccess,
  membersForOrder,
  readOrder,
  requestAssessment,
  approveAssessment,
  issueOrder,
  auditOrder,
  type Actor,
} from "./work-order-service";
import { WorkOrderError, validateIssue } from "../features/work-orders/model";

export const permitInput = z.object({
  approverId: z.string().uuid(),
  locationId: z.string().uuid(),
  responsibleId: z.string().uuid(),
  equipment: z.string().trim().min(1).max(2000),
  notes: z.string().max(4000),
  hotWork: z.boolean(),
  fireWatcherId: z.string().uuid().or(z.literal("")),
  contacts: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100),
        phone: z.string().regex(/^\+?[0-9 ()-]{7,30}$/),
      }),
    )
    .min(1)
    .max(10),
});
export type PermitInput = z.infer<typeof permitInput>;
export type PermitRow = {
  notification_status: string;
  id: string;
  work_order_id: string;
  applicant_id: string;
  approver_id: string;
  status: string;
  revision: number;
  details: PermitInput & { locationName: string };
  self_approval: boolean;
  rejection_reason: string | null;
  approved_at: string | null;
};
async function lock(client: PoolClient, actor: Actor, orderId: string) {
  await lockCompany(client, actor.companyId);
  await memberAccess(client, actor, true);
  await client.query(
    "SELECT id FROM work_orders WHERE id=$1 AND company_id=$2 FOR UPDATE",
    [orderId, actor.companyId],
  );
  return readOrder(client, actor, orderId);
}
async function event(
  client: PoolClient,
  actor: Actor,
  permit: PermitRow,
  action: string,
  payload: Record<string, unknown> = {},
) {
  await client.query(
    "INSERT INTO work_permit_events(permit_id,actor_id,action,payload) VALUES($1,$2,$3,$4::jsonb)",
    [permit.id, actor.userId, action, JSON.stringify(payload)],
  );
  await auditOrder(
    client,
    actor,
    permit.work_order_id,
    "PTW_" + action,
    { permitId: permit.id, revision: permit.revision },
    permit.applicant_id === permit.approver_id,
  );
}
export async function readPermit(
  client: PoolClient,
  actor: Actor,
  orderId: string,
) {
  await readOrder(client, actor, orderId);
  return (
    (
      await client.query<PermitRow>(
        "SELECT * FROM work_permits WHERE work_order_id=$1 AND company_id=$2",
        [orderId, actor.companyId],
      )
    ).rows[0] ?? null
  );
}
async function verifyPeople(client: PoolClient, actor: Actor, d: PermitInput) {
  const members = await membersForOrder(client, actor.companyId);
  const managers = members
    .filter((m) => m.role !== "WORKER")
    .map((m) => m.user_id);
  if (!managers.includes(d.approverId) || !managers.includes(d.responsibleId))
    throw new WorkOrderError("승인자·책임자는 재직 중인 관리자를 선택하세요.");
  if (d.hotWork && !members.some((m) => m.user_id === d.fireWatcherId))
    throw new WorkOrderError("화기작업은 재직 중인 화재감시자를 지정하세요.");
}
export async function requestPermit(
  client: PoolClient,
  actor: Actor,
  orderId: string,
  revision: number,
  input: unknown,
  confirmSelf: boolean,
) {
  const parsed = permitInput.safeParse(input);
  if (!parsed.success)
    throw new WorkOrderError("허가 항목과 비상연락처를 확인하세요.");
  const d = parsed.data;
  const order = await lock(client, actor, orderId);
  if (order.created_by !== actor.userId)
    throw new WorkOrderError("지시서 작성자만 허가를 신청할 수 있습니다.");
  if (
    order.revision !== revision ||
    !["DRAFT", "ISSUED", "IN_PROGRESS"].includes(order.status)
  )
    throw new WorkOrderError("지시서 상태가 변경됐습니다. 새로고침하세요.");
  const previous = await readPermit(client, actor, orderId);
  if (previous && ["PENDING", "APPROVED"].includes(previous.status))
    throw new WorkOrderError("이미 신청 또는 승인된 허가입니다.");
  await verifyPeople(client, actor, d);
  if (d.approverId === actor.userId && !confirmSelf)
    throw new WorkOrderError("자가 승인을 명시적으로 확인하세요.");
  const location = (
    await client.query(
      "SELECT name,path_cache FROM work_locations WHERE id=$1 AND company_id=$2 AND disabled_at IS NULL",
      [d.locationId, actor.companyId],
    )
  ).rows[0];
  if (!location) throw new WorkOrderError("등록된 작업 장소를 선택하세요.");
  const locationName = location.path_cache || location.name;
  if (order.status !== "DRAFT" && order.draft_data.location !== locationName)
    throw new WorkOrderError(
      "발급된 지시서와 같은 장소를 선택하세요. 장소 변경은 취소 후 재발급이 필요합니다.",
    );
  const draft = {
    ...order.draft_data,
    location: locationName,
    ptwRequired: true,
  };
  validateIssue({ ...draft, ptwRequired: false });
  const today = (
    await client.query(
      "SELECT (clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date::text AS day",
    )
  ).rows[0].day;
  if (draft.startDate < today)
    throw new WorkOrderError(
      "작업 시작일이 지난 허가는 신청·승인할 수 없습니다.",
    );
  await client.query(
    "UPDATE work_orders SET ptw_required=true,draft_data=$2::jsonb WHERE id=$1",
    [orderId, JSON.stringify(draft)],
  );
  let next = revision;
  if (order.status === "DRAFT") {
    if (!order.risk_assessment_id)
      await requestAssessment(client, actor, orderId, next++);
    if (order.assessment_status !== "APPROVED")
      await approveAssessment(client, actor, orderId, next++, true);
  }
  const permit = (
    await client.query<PermitRow>(
      `INSERT INTO work_permits(company_id,work_order_id,applicant_id,approver_id,status,details)
    VALUES($1,$2,$3,$4,'PENDING',$5::jsonb) ON CONFLICT(work_order_id) DO UPDATE SET approver_id=EXCLUDED.approver_id,status='PENDING',details=EXCLUDED.details,revision=work_permits.revision+1,requested_at=now(),approved_at=NULL,self_approval=false,rejection_reason=NULL,notification_status='PENDING',updated_at=now() RETURNING *`,
      [
        actor.companyId,
        orderId,
        actor.userId,
        d.approverId,
        JSON.stringify({ ...d, locationName }),
      ],
    )
  ).rows[0];
  await client.query(
    "UPDATE work_orders SET status=CASE WHEN status='DRAFT' THEN 'ISSUE_PENDING' ELSE status END,revision=revision+1 WHERE id=$1",
    [orderId],
  );
  await event(client, actor, permit, "REQUEST", { details: permit.details });
  if (d.approverId === actor.userId)
    await decidePermit(client, actor, orderId, permit.revision, "approve");
  return permit.id;
}
export async function decidePermit(
  client: PoolClient,
  actor: Actor,
  orderId: string,
  revision: number,
  command: "approve" | "reject" | "withdraw" | "reassign",
  value = "",
) {
  const order = await lock(client, actor, orderId);
  const p = await readPermit(client, actor, orderId);
  if (
    !p ||
    p.status !== "PENDING" ||
    p.revision !== revision ||
    order.status === "CANCELED"
  )
    throw new WorkOrderError("이미 처리됐거나 변경된 허가입니다.");
  if (
    ["approve", "reject"].includes(command)
      ? p.approver_id !== actor.userId
      : p.applicant_id !== actor.userId
  )
    throw new WorkOrderError("지정된 담당자만 처리할 수 있습니다.");
  if (command === "reassign") {
    if (value === p.applicant_id)
      throw new WorkOrderError(
        "본인 승인으로 바꾸려면 철회 후 신청&승인을 사용하세요.",
      );
    await verifyPeople(client, actor, { ...p.details, approverId: value });
    await client.query(
      "UPDATE work_permits SET approver_id=$2::uuid,details=jsonb_set(details,'{approverId}',to_jsonb(($2::uuid)::text)),revision=revision+1,notification_status='PENDING',updated_at=now() WHERE id=$1",
      [p.id, value],
    );
  } else {
    if (command === "reject" && (!value.trim() || value.length > 1000))
      throw new WorkOrderError("반려 사유를 1~1,000자로 입력하세요.");
    if (command === "approve") {
      await verifyPeople(client, actor, p.details);
      const today = (
        await client.query(
          "SELECT (clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date::text AS day",
        )
      ).rows[0].day;
      if (order.draft_data.startDate < today)
        throw new WorkOrderError(
          "작업 시작일이 지나 승인할 수 없습니다. 반려 또는 철회하세요.",
        );
    }
    const status =
      command === "approve"
        ? "APPROVED"
        : command === "reject"
          ? "REJECTED"
          : "WITHDRAWN";
    await client.query(
      "UPDATE work_permits SET status=$2,approved_at=CASE WHEN $2='APPROVED' THEN now() ELSE NULL END,self_approval=$3,rejection_reason=$4,revision=revision+1,updated_at=now() WHERE id=$1",
      [
        p.id,
        status,
        command === "approve" && p.applicant_id === p.approver_id,
        command === "reject" ? value.trim() : null,
      ],
    );
    if (order.status === "ISSUE_PENDING") {
      if (command === "approve")
        await issueOrder(client, actor, orderId, order.revision);
      else
        await client.query(
          "UPDATE work_orders SET status='DRAFT',revision=revision+1 WHERE id=$1",
          [orderId],
        );
    }
  }
  await event(
    client,
    actor,
    p,
    command.toUpperCase(),
    command === "reject"
      ? { reason: value.trim() }
      : command === "reassign"
        ? { previousApproverId: p.approver_id, approverId: value }
        : {},
  );
}

export async function addLocation(
  client: PoolClient,
  actor: Actor,
  name: string,
) {
  await lockCompany(client, actor.companyId);
  await memberAccess(client, actor, true);
  if (!name.trim() || name.length > 200)
    throw new WorkOrderError("장소명을 1~200자로 입력하세요.");
  const existing = (
    await client.query(
      "SELECT id FROM work_locations WHERE company_id=$1 AND name=$2 AND disabled_at IS NULL",
      [actor.companyId, name.trim()],
    )
  ).rows[0];
  if (existing) return existing.id as string;
  return (
    await client.query(
      "INSERT INTO work_locations(company_id,name,depth,path_cache) VALUES($1,$2,1,$2) RETURNING id",
      [actor.companyId, name.trim()],
    )
  ).rows[0].id as string;
}

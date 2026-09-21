import type { PoolClient } from "@neondatabase/serverless";
import { lockCompany } from "./membership-mutations";
import {
  memberAccess,
  readOrder,
  membersForOrder,
  type Actor,
} from "./work-order-service";
import { WorkOrderError, seoulToday } from "../features/work-orders/model";
import {
  inspectionSchema,
  sessionState,
  type SessionRow,
} from "../features/inspections/model";

// clock_timestamp is intentionally read after acquiring the company lock. A
// request waiting for a lock must not submit using a stale transaction start.
async function databaseNow(client: PoolClient) {
  const { rows } = await client.query("SELECT clock_timestamp()::text AS at");
  return new Date(rows[0].at);
}
export async function inspectionSessions(
  client: PoolClient,
  orderId: string,
): Promise<SessionRow[]> {
  return (
    await client.query<SessionRow>(
      `SELECT s.id,s.work_date::text,s.starts_at::text,s.ends_at::text,
    coalesce((SELECT jsonb_agg(person ORDER BY ord) FROM jsonb_array_elements(s.expected_assignees) WITH ORDINALITY AS p(person,ord)
      WHERE NOT EXISTS (SELECT 1 FROM work_order_assignments a WHERE a.work_order_id=s.work_order_id
        AND a.user_id=(person->>'userId')::uuid AND a.status='UNASSIGNED' AND a.unassigned_at<=s.ends_at+interval '2 hours'
        AND NOT EXISTS(SELECT 1 FROM inspections i WHERE i.session_id=s.id AND i.inspector_id=a.user_id AND i.category='TBM'))),'[]'::jsonb) AS expected_assignees,
    coalesce((SELECT array_agg(i.inspector_id::text) FROM inspections i WHERE i.session_id=s.id AND i.category='TBM'),ARRAY[]::text[]) AS tbm_users,
    (SELECT count(*)::int FROM inspections i WHERE i.session_id=s.id AND i.category='DURING_WORK') AS during_count
    FROM work_sessions s WHERE s.work_order_id=$1 ORDER BY s.work_date DESC`,
      [orderId],
    )
  ).rows;
}
async function inspectionAudit(
  client: PoolClient,
  actor: Actor,
  orderId: string,
  action: string,
  refs: Record<string, unknown>,
  path = "WEB",
) {
  await client.query(
    `INSERT INTO audit_logs(company_id,actor_id,action,target_type,target_id,path,after_json)
    VALUES ($1,$2,$3,'work_orders',$4,$5,$6::jsonb)`,
    [
      actor.companyId,
      actor.userId,
      action,
      orderId,
      path,
      JSON.stringify(refs),
    ],
  );
}

export async function submitInspection(
  client: PoolClient,
  actor: Actor,
  input: unknown,
) {
  const parsed = inspectionSchema.safeParse(input);
  if (!parsed.success)
    throw new WorkOrderError("점검 항목과 입력값을 확인하세요.");
  const data = parsed.data;
  await lockCompany(client, actor.companyId);
  const access = await memberAccess(client, actor);
  const order = await readOrder(client, actor, data.orderId);
  const { rows: existing } = await client.query(
    "SELECT i.session_id,i.inspector_id,i.category,s.work_order_id FROM inspections i JOIN work_sessions s ON s.id=i.session_id WHERE i.id=$1",
    [data.id],
  );
  if (existing.length) {
    if (
      existing[0].session_id !== data.sessionId ||
      existing[0].work_order_id !== data.orderId ||
      existing[0].inspector_id !== actor.userId ||
      existing[0].category !== data.category
    )
      throw new WorkOrderError("이미 사용된 요청입니다.");
    // Retry after a successful commit returns the original receipt, never writes again.
    return { id: data.id, items: await savedItems(client, data.id) };
  }
  if (!order.issued_at || order.status === "CANCELED")
    throw new WorkOrderError("발급된 유효한 작업지시만 점검할 수 있습니다.");
  const now = await databaseNow(client);
  const sessions = await inspectionSessions(client, data.orderId);
  const session = sessions.find((s) => s.id === data.sessionId);
  if (!session)
    throw new WorkOrderError("존재하지 않는 회차입니다.");
  if (!sessionState(session, now).canInput)
    throw new WorkOrderError(
      "아직 시작하지 않은 회차입니다. 작업일이 되면 입력할 수 있습니다.",
    );
  if (
    access.role === "WORKER" &&
    !session.expected_assignees.some((a) => a.userId === actor.userId)
  )
    throw new WorkOrderError("이 회차에 배정된 작업자만 입력할 수 있습니다.");
  if (
    data.category === "TBM" &&
    (!data.confirmed || session.tbm_users.includes(actor.userId))
  )
    throw new WorkOrderError(
      session.tbm_users.includes(actor.userId)
        ? "이미 이 회차의 TBM을 확인했습니다."
        : "위험요인·대책과 점검 내용을 확인하고 확인 체크를 선택하세요.",
    );
  const { rows: checklist } = await client.query<{ id: string; text: string }>(
    "SELECT id,text FROM work_order_checklist_items WHERE work_order_id=$1 AND category=$2 ORDER BY order_no",
    [data.orderId, data.category],
  );
  const ids = new Set(data.results.map((r) => r.itemId));
  if (
    checklist.length !== data.results.length ||
    ids.size !== checklist.length ||
    checklist.some((c) => !ids.has(c.id))
  )
    throw new WorkOrderError(
      "발급된 체크리스트의 모든 항목을 한 번씩 점검하세요.",
    );
  const members = await membersForOrder(client, actor.companyId);
  const inspector = members.find((m) => m.user_id === actor.userId)!;
  for (const r of data.results) {
    if (
      r.result === "FAIL" &&
      !members.some((m) => m.user_id === r.managerId && m.role !== "WORKER")
    )
      throw new WorkOrderError(
        "부적합마다 현재 회사의 활성 관리자를 선택하세요.",
      );
  }
  // 현장 입력은 본인이 본인 것을 넣는다 — recorded_by 가 inspector 와 같고 backfilled 는 false.
  // 관리자 사후 입력이 생기면 이 두 값이 갈라진다 (0014).
  await client.query(
    `INSERT INTO inspections(id,session_id,inspector_id,inspector_name,inspector_role,category,entry_path,confirmed,submitted_at,recorded_by,recorded_by_name)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$3,$4)`,
    [
      data.id,
      session.id,
      actor.userId,
      inspector.display_name,
      access.role,
      data.category,
      data.entryPath,
      data.confirmed,
      now.toISOString(),
    ],
  );
  for (const r of data.results) {
    const { rows } = await client.query(
      `INSERT INTO inspection_results(inspection_id,checklist_item_id,item_text,result,comment)
      VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [
        data.id,
        r.itemId,
        checklist.find((c) => c.id === r.itemId)!.text,
        r.result,
        r.comment,
      ],
    );
    if (r.result === "FAIL")
      await client.query(
        `INSERT INTO inspection_findings(result_id,assigned_manager_id,assigned_manager_name)
      VALUES ($1,$2,$3)`,
        [
          rows[0].id,
          r.managerId,
          members.find((m) => m.user_id === r.managerId)!.display_name,
        ],
      );
  }
  await inspectionAudit(
    client,
    actor,
    data.orderId,
    "SUBMIT_INSPECTION",
    {
      inspectionId: data.id,
      sessionId: session.id,
      category: data.category,
      failures: data.results.filter((r) => r.result === "FAIL").length,
    },
    data.entryPath,
  );
  // 사진은 저장이 끝나야 붙일 자리가 생긴다. 항목별 결과 행 id 를 돌려주면
  // 화면이 들고 있던 파일을 그 자리에 올린다 (0015).
  return { id: data.id, items: await savedItems(client, data.id) };
}

export type SavedInspectionItem = { itemId: string; resultId: string };

async function savedItems(
  client: PoolClient,
  inspectionId: string,
): Promise<SavedInspectionItem[]> {
  return (
    await client.query<SavedInspectionItem>(
      `SELECT checklist_item_id AS "itemId", id AS "resultId"
       FROM inspection_results WHERE inspection_id=$1`,
      [inspectionId],
    )
  ).rows;
}

export async function resolveFinding(
  client: PoolClient,
  actor: Actor,
  id: string,
  resolution: string,
) {
  if (!resolution.trim() || resolution.length > 4000)
    throw new WorkOrderError("조치 내용을 1~4,000자로 입력하세요.");
  await lockCompany(client, actor.companyId);
  await memberAccess(client, actor, true);
  const { rows } = await client.query(
    `SELECT f.id,f.status,f.assigned_manager_id,s.work_order_id
    FROM inspection_findings f JOIN inspection_results r ON r.id=f.result_id JOIN inspections i ON i.id=r.inspection_id
    JOIN work_sessions s ON s.id=i.session_id WHERE f.id=$1 AND s.company_id=$2 FOR UPDATE OF f`,
    [id, actor.companyId],
  );
  const f = rows[0];
  if (!f || f.assigned_manager_id !== actor.userId)
    throw new WorkOrderError("지정된 관리자만 조치완료 처리할 수 있습니다.");
  if (f.status !== "OPEN")
    throw new WorkOrderError("이미 조치완료된 항목입니다.");
  // Open safety actions stay actionable even if the order is canceled or archived.
  await client.query(
    "UPDATE inspection_findings SET status='RESOLVED',resolution=$2,resolved_by=$3,resolved_at=clock_timestamp() WHERE id=$1",
    [id, resolution.trim(), actor.userId],
  );
  await inspectionAudit(client, actor, f.work_order_id, "RESOLVE_FINDING", {
    findingId: id,
  });
  return f.work_order_id as string;
}

export type Finding = {
  id: string;
  order_id: string;
  order_name: string;
  work_date: string;
  item_text: string;
  comment: string;
  assigned_manager_id: string;
  assigned_manager_name: string;
  status: string;
  resolution: string | null;
  resolved_at: string | null;
};
const findingSelect = `SELECT f.id,s.work_order_id AS order_id,w.name AS order_name,s.work_date::text,r.item_text,r.comment,
  f.assigned_manager_id,f.assigned_manager_name,f.status,f.resolution,f.resolved_at::text
  FROM inspection_findings f JOIN inspection_results r ON r.id=f.result_id JOIN inspections i ON i.id=r.inspection_id
  JOIN work_sessions s ON s.id=i.session_id JOIN work_orders w ON w.id=s.work_order_id`;

export async function pendingFindings(client: PoolClient, actor: Actor) {
  await memberAccess(client, actor, true);
  return (
    await client.query<Finding>(
      findingSelect +
        " WHERE s.company_id=$1 AND f.assigned_manager_id=$2 AND f.status='OPEN' ORDER BY f.created_at LIMIT 101",
      [actor.companyId, actor.userId],
    )
  ).rows;
}

export async function pendingFindingCount(client: PoolClient, actor: Actor) {
  await memberAccess(client, actor, true);
  const { rows } = await client.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM inspection_findings f
     JOIN inspection_results r ON r.id=f.result_id JOIN inspections i ON i.id=r.inspection_id
     JOIN work_sessions s ON s.id=i.session_id
     WHERE s.company_id=$1 AND f.assigned_manager_id=$2 AND f.status='OPEN'`,
    [actor.companyId, actor.userId],
  );
  return rows[0].count;
}

export async function inspectionOverview(
  client: PoolClient,
  actor: Actor,
  orderId: string,
) {
  const order = await readOrder(client, actor, orderId);
  const access = await memberAccess(client, actor);
  const now = await databaseNow(client);
  const sessions = await inspectionSessions(client, orderId);
  const current =
    sessions.find((s) => sessionState(s, now).state === "TODAY") ?? null;
  const cutoff = seoulToday(new Date(now.getTime() - 7 * 86400000));
  const visible = sessions.filter(
    (s) =>
      access.pro_state !== "FREE" ||
      s.work_date >= cutoff ||
      s.id === current?.id,
  );
  const previous = current
    ? sessions.find((s) => s.work_date < current.work_date)
    : null;
  const { rows: checklist } = await client.query<{
    id: string;
    category: "TBM" | "DURING_WORK";
    text: string;
  }>(
    "SELECT id,category,text FROM work_order_checklist_items WHERE work_order_id=$1 ORDER BY category,order_no",
    [orderId],
  );
  // 발급 시 굳은 평가 사본. 판단 기준도 이 안에 들어 있으므로, 회사가 기준을
  // 바꿔도 현장에서 보이는 것은 이 지시서가 발급될 때의 기준이다 (0013).
  const { rows: risks } = await client.query<{
    payload: {
      criteria_snapshot?: string;
      items: Array<{
        hazard: string;
        reduction_measure: string;
        initial_risk_level: "HIGH" | "MID" | "LOW";
        initial_allowable: boolean;
      }>;
    };
  }>(
    "SELECT payload FROM work_order_snapshots WHERE work_order_id=$1 AND snapshot_kind='RISK_ASSESSMENT'",
    [orderId],
  );
  const { rows: permits } = await client.query<{
    status: string;
    self_approval: boolean;
  }>(
    "SELECT status,self_approval FROM work_permits WHERE work_order_id=$1 AND company_id=$2",
    [orderId, actor.companyId],
  );
  const { rows: records } = await client.query<{
    id: string;
    session_id: string;
    inspector_id: string;
    inspector_name: string;
    inspector_role: string;
    category: string;
    entry_path: string;
    submitted_at: string;
    results: Array<{
      item_text: string;
      result: "PASS" | "FAIL" | "NA";
      comment: string;
      photos: Array<{
        id: string;
        filename: string;
        mimeType: string;
        sizeBytes: number | null;
        width: number | null;
        height: number | null;
      }>;
    }>;
  }>(
    `SELECT i.id,i.session_id,i.inspector_id,i.inspector_name,i.inspector_role,i.category,i.entry_path,i.submitted_at::text,
    (SELECT jsonb_agg(jsonb_build_object('item_text',r.item_text,'result',r.result,'comment',r.comment,
      'photos',coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'filename',a.original_filename,'mimeType',a.mime_type,
          'sizeBytes',a.size_bytes,'width',a.width,'height',a.height) ORDER BY a.created_at)
        FROM attachments a WHERE a.target_type='inspection_result' AND a.target_id=r.id AND a.status='READY'),'[]'::jsonb)) ORDER BY c.order_no)
    FROM inspection_results r JOIN work_order_checklist_items c ON c.id=r.checklist_item_id WHERE r.inspection_id=i.id) AS results
    FROM inspections i JOIN work_sessions s ON s.id=i.session_id
    WHERE s.work_order_id=$1 AND s.id=ANY($2::uuid[]) ORDER BY i.submitted_at DESC LIMIT 101`,
    [orderId, visible.map((s) => s.id)],
  );
  const findings = (
    await client.query<Finding>(
      findingSelect +
        " WHERE s.work_order_id=$1 AND s.id=ANY($2::uuid[]) ORDER BY f.created_at DESC LIMIT 101",
      [orderId, visible.map((s) => s.id)],
    )
  ).rows;
  const previousActions = previous
    ? (
        await client.query<Finding>(
          findingSelect +
            " WHERE s.id=$1 AND f.status='RESOLVED' ORDER BY f.resolved_at",
          [previous.id],
        )
      ).rows
    : [];
  const { rows: counts } = await client.query(
    `SELECT count(*)::int AS count FROM inspection_findings f JOIN inspection_results r ON r.id=f.result_id
    JOIN inspections i ON i.id=r.inspection_id JOIN work_sessions s ON s.id=i.session_id WHERE s.work_order_id=$1 AND f.status='OPEN'`,
    [orderId],
  );
  const managers = (await membersForOrder(client, actor.companyId)).filter(
    (m) => m.role !== "WORKER",
  );
  return {
    order,
    isManager: access.role !== "WORKER",
    // 사진 첨부는 요금제만 가른다 — 역할은 보지 않는다.
    canAttach: access.pro_state !== "FREE",
    current,
    sessions: visible,
    lockedSessions: sessions.length - visible.length,
    checklist,
    risks: risks[0]?.payload.items ?? [],
    criteria: risks[0]?.payload.criteria_snapshot ?? "",
    permit: permits[0] ?? null,
    records,
    findings,
    previousActions,
    managers,
    openCount: counts[0].count as number,
    now: now.toISOString(),
  };
}

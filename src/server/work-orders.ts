import "server-only";
import { redirect } from "next/navigation";
import { getCurrentSession } from "./session";
import { query, withTransaction } from "./db";
import {
  memberAccess,
  membersForOrder,
  readOrder,
  type Actor,
} from "./work-order-service";
import type { OrderStatus } from "../features/work-orders/model";
import { inspectionSessions } from "./inspection-service";
import { sessionState } from "../features/inspections/model";

/**
 * 회사에 등록된 작업 장소를 자동완성용으로 반환.
 * 지금은 회사 장소관리 화면(C-02)이 아직 없어서 대체로 빈 배열.
 * 있을 경우 지시서 폼의 <datalist> 로 노출되어 사용자가 선택·수정할 수 있다.
 */
export type LocationSuggestion = { id: string; label: string };
export async function listLocationSuggestions(
  companyId: string,
): Promise<LocationSuggestion[]> {
  const rows = await query<{ id: string; name: string; path_cache: string | null }>(
    `SELECT id, name, path_cache
       FROM work_locations
      WHERE company_id = $1 AND disabled_at IS NULL
      ORDER BY sort_no, name
      LIMIT 500`,
    [companyId],
  );
  return rows.map((r) => ({ id: r.id, label: r.path_cache || r.name }));
}

export async function workSession(path = "/work-orders", manager = false) {
  const session = await getCurrentSession();
  if (!session) redirect("/login?next=" + encodeURIComponent(path));
  if (!session.membership || session.membership.status !== "ACTIVE")
    redirect("/onboarding");
  if (manager && session.membership.role === "WORKER") redirect("/work-orders");
  return {
    session,
    actor: {
      companyId: session.membership.company_id,
      userId: session.user.id,
    },
  };
}
export async function orderMembers(actor: Actor) {
  return withTransaction(async (client) => {
    await memberAccess(client, actor, true);
    return membersForOrder(client, actor.companyId);
  });
}
export type OrderSummary = {
  id: string;
  name: string;
  status: OrderStatus;
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string;
  assignee_count: number;
  assessment_status: string | null;
  revision: number;
};
export async function listOrders(
  actor: Actor,
  tab = "all",
  search = "",
  page = 1,
) {
  return withTransaction(async (client) => {
    const access = await memberAccess(client, actor);
    const base = `WITH scoped AS (
      SELECT w.*, a.status AS assessment_status,
        CASE WHEN w.status IN ('ISSUED','IN_PROGRESS','COMPLETED') THEN
          CASE WHEN now() > ((w.work_period_end + w.work_end_time +
            CASE WHEN w.work_end_time <= w.work_start_time THEN interval '1 day' ELSE interval '0 day' END +
            interval '2 hours') AT TIME ZONE 'Asia/Seoul') THEN 'COMPLETED'
          WHEN now() >= ((w.work_period_start + w.work_start_time - interval '2 hours') AT TIME ZONE 'Asia/Seoul')
            THEN 'IN_PROGRESS' ELSE 'ISSUED' END ELSE w.status END AS display_status
      FROM work_orders w LEFT JOIN risk_assessments a ON a.id=w.risk_assessment_id
      WHERE w.company_id=$1 AND w.deleted_at IS NULL
        AND ($2::boolean OR (w.status <> 'DRAFT' AND EXISTS (
        SELECT 1 FROM work_order_assignments wa WHERE wa.work_order_id=w.id
        AND wa.user_id=$3 AND wa.status <> 'UNASSIGNED')))
    ), visible AS (
      SELECT *, ($4::boolean OR NOT (
        (display_status='COMPLETED' AND work_period_end < (now() AT TIME ZONE 'Asia/Seoul')::date-7)
        OR (display_status='CANCELED' AND canceled_at < now()-interval '7 days')
      )) AS can_read FROM scoped
    )`;
    const params = [
      actor.companyId,
      access.role !== "WORKER",
      actor.userId,
      access.pro_state !== "FREE",
    ];
    const { rows: counts } = await client.query<{ locked: number }>(
      base + " SELECT count(*)::int AS locked FROM visible WHERE NOT can_read",
      params,
    );
    const { rows } = await client.query<OrderSummary>(
      base +
        ` SELECT id,name,display_status AS status,work_period_start::text AS start_date,
       work_period_end::text AS end_date,to_char(work_start_time,'HH24:MI') AS start_time,
       to_char(work_end_time,'HH24:MI') AS end_time,
       coalesce(location_free_text,draft_data->>'location','') AS location,
       jsonb_array_length(draft_data->'assigneeIds') AS assignee_count, assessment_status, revision
       FROM visible WHERE can_read
         AND ($5='all' OR ($5='draft' AND display_status='DRAFT')
           OR ($5='active' AND display_status IN ('ISSUED','IN_PROGRESS')))
         AND name ILIKE $6 ORDER BY created_at DESC LIMIT 21 OFFSET $7`,
      [
        ...params,
        tab,
        "%" + search.replace(/[\\%_]/g, "\\$&") + "%",
        (page - 1) * 20,
      ],
    );
    return {
      rows: rows.slice(0, 20),
      hasMore: rows.length > 20,
      locked: counts[0].locked,
      isManager: access.role !== "WORKER",
      pro: access.pro_state !== "FREE",
    };
  });
}
export async function orderDetail(actor: Actor, id: string) {
  return withTransaction(async (client) => {
    const order = await readOrder(client, actor, id);
    const access = await memberAccess(client, actor);
    const { rows: assignments } = await client.query<{
      user_id: string;
      snapshot_display_name: string;
      status: string;
    }>(
      "SELECT user_id,snapshot_display_name,status FROM work_order_assignments WHERE work_order_id=$1 ORDER BY assigned_at",
      [id],
    );
    const { rows: outputs } = await client.query<{
      user_id: string;
      status: string;
    }>(
      "SELECT user_id,status FROM work_order_outputs WHERE work_order_id=$1 ORDER BY id",
      [id],
    );
    const { rows: history } = await client.query<{
      action: string;
      at: string;
      is_self_approval: boolean;
    }>(
      "SELECT action,at::text,is_self_approval FROM audit_logs WHERE company_id=$1 AND target_id=$2 ORDER BY at DESC LIMIT 50",
      [actor.companyId, id],
    );
    const { rows: snapshots } = await client.query<{
      snapshot_kind: string;
      payload: Record<string, unknown>;
    }>(
      "SELECT snapshot_kind,payload FROM work_order_snapshots WHERE work_order_id=$1",
      [id],
    );
    const { rows: checklist } = await client.query<{
      category: string;
      text: string;
    }>(
      "SELECT category,text FROM work_order_checklist_items WHERE work_order_id=$1 ORDER BY category,order_no",
      [id],
    );
    // 연결된 표준서와 그 판. 발급 전에도 보인다 — 고른 순간부터 판이 붙어 있다.
    const { rows: standardRows } = order.standard_id
      ? await client.query<{
          standard_id: string;
          name: string;
          revision_no: number | null;
          is_current: boolean;
          current_revision_no: number | null;
        }>(
          `SELECT s.id AS standard_id, s.name, r.revision_no,
                  (r.id IS NOT DISTINCT FROM s.current_revision_id) AS is_current,
                  c.revision_no AS current_revision_no
             FROM standards s
             LEFT JOIN standard_revisions r ON r.id = COALESCE($2::uuid, s.current_revision_id)
             LEFT JOIN standard_revisions c ON c.id = s.current_revision_id
            WHERE s.id = $1`,
          [order.standard_id, order.standard_revision_id],
        )
      : { rows: [] };
    const now = new Date();
    const sessions = order.issued_at
      ? await inspectionSessions(client, id)
      : [];
    const { rows: findingCounts } = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count
      FROM inspection_findings f JOIN inspection_results r ON r.id=f.result_id JOIN inspections i ON i.id=r.inspection_id
      JOIN work_sessions s ON s.id=i.session_id WHERE s.work_order_id=$1 AND f.status='OPEN'`,
      [id],
    );
    return {
      order,
      standard: standardRows[0] ?? null,
      assignments,
      outputs,
      history,
      snapshots,
      checklist,
      currentSession:
        sessions.find((s) => sessionState(s, now).state === "TODAY") ?? null,
      inspectionNow: now.toISOString(),
      openFindings: findingCounts[0].count,
      isManager: access.role !== "WORKER",
    };
  });
}

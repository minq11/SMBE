import type { PoolClient } from "@neondatabase/serverless";
import type {
  IncidentGrade,
  IncidentKind,
  IncidentStatus,
  OccurrenceType,
} from "@/features/incidents/model";

/**
 * 위험성평가에서 위험요인을 찾을 때 참고하는 우리 회사 기록 둘:
 * 과거 사고·아차사고, 그리고 작업자 의견(TBM·점검의 불량 건과 코멘트, 종합의견).
 * 폼이 열릴 때 한 번 읽어 창으로 보여 준다 — 폼 밖으로 나가지 않게.
 */
export type RefIncident = {
  id: string;
  kind: IncidentKind;
  occurrence_type: OccurrenceType;
  grade: IncidentGrade;
  status: IncidentStatus;
  occurred_at: string;
  location: string;
  description: string;
  standard_id: string | null;
};

export type RefOpinion = {
  id: string;
  kind: "ITEM" | "OVERALL";
  at: string;
  who: string;
  order_id: string;
  order_name: string;
  standard_id: string | null;
  category: "TBM" | "DURING_WORK";
  text: string;
  result: "PASS" | "FAIL" | "NA" | null;
};

export type AssessmentReferences = {
  incidents: RefIncident[];
  opinions: RefOpinion[];
};

export async function assessmentReferences(
  client: PoolClient,
  companyId: string,
): Promise<AssessmentReferences> {
  const incidents = await client.query<RefIncident>(
    `SELECT i.id, i.kind, i.occurrence_type, i.grade, i.status, i.occurred_at::text,
            i.location, left(i.description, 120) AS description, wo.standard_id
       FROM incidents i LEFT JOIN work_orders wo ON wo.id = i.work_order_id
      WHERE i.company_id = $1
      ORDER BY i.occurred_at DESC LIMIT 50`,
    [companyId],
  );
  const opinions = await client.query<RefOpinion>(
    `SELECT * FROM (
       SELECT r.id, 'ITEM'::text AS kind, i.submitted_at::text AS at, i.inspector_name AS who,
              w.id AS order_id, w.name AS order_name, w.standard_id, i.category,
              r.item_text || CASE WHEN r.comment <> '' THEN ' — ' || r.comment ELSE '' END AS text,
              r.result
         FROM inspection_results r
         JOIN inspections i ON i.id = r.inspection_id
         JOIN work_sessions s ON s.id = i.session_id
         JOIN work_orders w ON w.id = s.work_order_id
        WHERE s.company_id = $1 AND (r.result = 'FAIL' OR r.comment <> '')
       UNION ALL
       SELECT i.id, 'OVERALL', i.submitted_at::text, i.inspector_name,
              w.id, w.name, w.standard_id, i.category, i.overall_comment, NULL
         FROM inspections i
         JOIN work_sessions s ON s.id = i.session_id
         JOIN work_orders w ON w.id = s.work_order_id
        WHERE s.company_id = $1 AND i.overall_comment <> ''
     ) o ORDER BY o.at DESC LIMIT 100`,
    [companyId],
  );
  return { incidents: incidents.rows, opinions: opinions.rows };
}

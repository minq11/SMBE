// 서버·클라이언트 공용 라벨·상수·타입.
// server-only 파일에서 분리해 클라이언트 컴포넌트가 import 해도 안전하도록 유지.
import type { RiskCriteria } from "@/features/company/risk-criteria";

export type AssessmentKind = "FIRST" | "PERIODIC" | "AD_HOC" | "CONTINUOUS";
export type AssessmentStatus = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED";
export type StandardStatus = "DRAFT" | "APPROVED" | "ARCHIVED";

export const ASSESSMENT_KIND_LABEL: Record<AssessmentKind, string> = {
  FIRST: "최초평가",
  PERIODIC: "정기평가",
  AD_HOC: "수시평가",
  CONTINUOUS: "상시평가",
};

// 산안법 시행규칙: 최초 3년, 정기 1년, 수시는 이후 정기 사이클 유지. 상시는 만료 개념 없음.
export const VALIDITY_MONTHS: Record<AssessmentKind, number | null> = {
  FIRST: 36,
  PERIODIC: 12,
  AD_HOC: 12,
  CONTINUOUS: null,
};

// -----------------------------------------------------------------------------
// 클라이언트 컴포넌트에서 사용하는 공용 데이터 shape 타입
// (서버 SQL 결과와 매칭. server/standards-service.ts 에서 재 export 함.)
// -----------------------------------------------------------------------------

export type StandardListRow = {
  standard_id: string;
  name: string;
  status: StandardStatus;
  ptw_required: boolean;
  updated_at: string;
  latest_approved_performed_on: string | null;
  latest_approved_kind: AssessmentKind | null;
  approved_assessment_count: number;
  usable: boolean;
  valid_until: string | null;
};

// id 는 첨부 사진의 target_id 로 사용. 표준서 수정 시 서버가 id 를 보존.
export type StandardStep = { id: string; order_no: number; step_text: string };

export type StandardChecklistItem = {
  category: "TBM" | "DURING_WORK";
  order_no: number;
  text: string;
};

export type RiskAssessmentSummary = {
  assessment_id: string;
  kind: AssessmentKind;
  performed_on: string;
  status: AssessmentStatus;
  approved_at: string | null;
  approved_by_name: string | null;
  is_current: boolean;
  valid_until: string | null;
  expired: boolean;
};

export type RiskItem = {
  id: string;
  order_no: number;
  hazard: string;
  initial_risk_level: "HIGH" | "MID" | "LOW";
  initial_allowable: boolean;
  reduction_measure: string;
  responsible_user_id: string | null;
  planned_completion_date: string | null;
  /** 조치 이행 (관리자가 적기 전엔 null) */
  actual_action: string | null;
  actual_completion_date: string | null;
  post_risk_level: "HIGH" | "MID" | "LOW" | null;
  post_allowable: boolean | null;
};

/**
 * 다음 회차 폼에 미리 채울 값. 조치가 끝난 항목은 처음 판정이 아니라 조치 후
 * 판정으로 채운다 — 덮개를 단 끼임을 올해 또 "허용 불가" 로 띄우면 매번 바꿔
 * 눌러야 한다. 담당·예정일은 끝난 조치의 것이라 비운다. 감소대책은 지금 서
 * 있는 통제이므로 그대로 둔다.
 */
export function riskSeedFromItem(r: RiskItem): {
  hazard: string;
  level: "HIGH" | "MID" | "LOW";
  allowable: "yes" | "no";
  measure: string;
  responsibleId: string;
  dueDate: string;
} {
  const done = r.actual_completion_date !== null;
  const level = (done && r.post_risk_level) || r.initial_risk_level;
  const allowable =
    done && r.post_allowable !== null ? r.post_allowable : r.initial_allowable;
  return {
    hazard: r.hazard,
    level,
    allowable: allowable ? "yes" : "no",
    measure: r.reduction_measure,
    responsibleId: done ? "" : (r.responsible_user_id ?? ""),
    dueDate: done ? "" : (r.planned_completion_date ?? ""),
  };
}

export type SafetyInfo = {
  equipment: string;
  materials: string;
  environment: string;
  history: string;
};

export type StandardDetail = {
  standard_id: string;
  name: string;
  status: StandardStatus;
  ptw_required: boolean;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  steps: StandardStep[];
  checklist_tbm: string[];
  checklist_during: string[];
  assessments: RiskAssessmentSummary[];
  current_assessment: {
    assessment_id: string;
    kind: AssessmentKind;
    performed_on: string;
    criteria: RiskCriteria;
    work_method: string;
    safety_info: SafetyInfo;
    risks: RiskItem[];
    participant_names: string[];
    valid_until: string | null;
    expired: boolean;
  } | null;
};

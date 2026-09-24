import { z } from "zod";

/**
 * 회사의 위험성 수준 판단 기준 — 상·중·하 세 행 (db/0020).
 *
 * 원본은 `company_risk_levels`, 평가에는 같은 모양의 배열이
 * `risk_assessments.criteria_snapshot` 으로 복사된다. 화면·서버가 같은 타입을 쓰도록
 * server-only 가 아닌 이 파일에 둔다.
 */

export const RISK_LEVELS = ["HIGH", "MID", "LOW"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const RISK_ACCEPTANCES = [
  "ACCEPTABLE",
  "AFTER_REDUCTION",
  "NOT_ACCEPTABLE",
] as const;
export type RiskAcceptance = (typeof RISK_ACCEPTANCES)[number];

export const ACCEPTANCE_LABEL: Record<RiskAcceptance, string> = {
  ACCEPTABLE: "허용 가능",
  AFTER_REDUCTION: "감소대책 후 허용",
  NOT_ACCEPTABLE: "허용 불가",
};

export type RiskCriterion = {
  level: RiskLevel;
  description: string;
  acceptance: RiskAcceptance;
};
/** 늘 상·중·하 순서의 세 행. */
export type RiskCriteria = RiskCriterion[];

export const MAX_DESCRIPTION_LENGTH = 500;

export const riskCriteriaSchema = z
  .array(
    z.object({
      level: z.enum(RISK_LEVELS),
      description: z
        .string()
        .trim()
        .min(1, "등급마다 정의를 입력하세요.")
        .max(MAX_DESCRIPTION_LENGTH, "정의가 너무 깁니다."),
      acceptance: z.enum(RISK_ACCEPTANCES, {
        message: "등급마다 허용 여부를 고르세요.",
      }),
    }),
  )
  .refine(
    (rows) =>
      rows.length === RISK_LEVELS.length &&
      RISK_LEVELS.every((l) => rows.some((r) => r.level === l)),
    "상·중·하 기준을 모두 입력하세요.",
  );

/** 그 수준에 대해 회사가 정한 허용 경계. 기준이 깨져 있으면 null. */
export function acceptanceFor(
  criteria: RiskCriteria,
  level: RiskLevel,
): RiskAcceptance | null {
  return criteria.find((c) => c.level === level)?.acceptance ?? null;
}

/**
 * 처음 평가할 때의 허용 여부 = 수준 + 회사 기준. 사람이 따로 고르지 않는다 (고시의
 * "위험성 결정" 은 추정한 수준이 회사 허용 기준 안인지 판단하는 일이다). "허용 가능"
 * 만 참. "감소대책 후 허용" 과 "허용 불가" 는 조치가 필요하니 거짓.
 */
export function initialAllowable(
  criteria: RiskCriteria,
  level: RiskLevel,
): boolean {
  return acceptanceFor(criteria, level) === "ACCEPTABLE";
}

/**
 * 조치를 실행한 뒤의 허용 여부. 감소대책을 했으니 "감소대책 후 허용" 도 허용이고,
 * "허용 불가" 수준에 남아 있으면 추가 대책이 필요하다 (고시 제13조).
 */
export function postAllowable(
  criteria: RiskCriteria,
  level: RiskLevel,
): boolean {
  return acceptanceFor(criteria, level) !== "NOT_ACCEPTABLE";
}

/** 화면에 보이는 판정 글. 처음 평가와 조치 뒤가 다르다. */
export const INITIAL_VERDICT_LABEL: Record<RiskAcceptance, string> = {
  ACCEPTABLE: "허용 가능",
  AFTER_REDUCTION: "감소대책 후 허용 · 조치 필요",
  NOT_ACCEPTABLE: "허용 불가 · 조치 필요",
};
export const POST_VERDICT_LABEL: Record<RiskAcceptance, string> = {
  ACCEPTABLE: "허용 가능",
  AFTER_REDUCTION: "허용 가능 (감소대책 후 허용)",
  NOT_ACCEPTABLE: "허용 불가 · 추가 대책 필요",
};

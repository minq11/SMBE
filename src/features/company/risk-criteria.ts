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

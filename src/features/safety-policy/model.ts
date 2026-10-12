import { z } from "zod";

export const DEFAULT_POLICY = `우리는 모든 구성원의 안전과 건강을 최우선으로 합니다.
1. 작업 전 위험요인을 확인하고 안전한 작업방법을 지킵니다.
2. 위험한 상태를 발견하면 작업을 멈추고 알리며, 개선한 뒤 작업합니다.
3. 구성원의 의견을 듣고 필요한 안전조치와 교육을 실시합니다.
4. 안전보건 목표의 실행 상황을 확인하고 지속적으로 개선합니다.`;

// 안전보건 예산 (중대재해처벌법 시행령 4조 3호). 금액은 만원 — 회사 정보의 매출과 같은 단위.
// 항목은 회사가 고치고, 집행은 분기마다 한 줄. 비워도 저장된다 (처음 쓰는 해).
export const BUDGET_ITEM_DEFAULTS = [
  "보호구",
  "점검·정비",
  "안전보건교육",
  "건강진단",
];
const manwon = z.number().int().min(0).max(100_000_000);
export const budgetSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1, "예산 항목 이름을 입력하세요.").max(60),
        planned: manwon,
      }),
    )
    .max(12, "예산 항목은 12개까지입니다."),
  spent: z
    .array(
      z.object({
        quarter: z.number().int().min(1).max(4),
        amount: manwon,
        note: z.string().trim().max(200),
      }),
    )
    .max(4),
});
export type Budget = z.infer<typeof budgetSchema>;
export const EMPTY_BUDGET: Budget = { items: [], spent: [] };

export function budgetTotals(budget: Budget) {
  const planned = budget.items.reduce((sum, i) => sum + i.planned, 0);
  const spent = budget.spent.reduce((sum, s) => sum + s.amount, 0);
  return {
    planned,
    spent,
    rate: planned > 0 ? Math.round((spent / planned) * 100) : null,
  };
}

export const yearSchema = z.number().int().min(2000).max(2100);
export const policyInputSchema = z.object({
  year: yearSchema,
  revision: z.number().int().nonnegative(),
  policy: z.string().trim().min(1, "안전보건 방침을 입력하세요.").max(4000),
  goals: z.string().trim().min(1, "연간 목표를 입력하세요.").max(2000),
  representative: z.string().trim().min(1, "대표자명을 입력하세요.").max(100),
  establishedOn: z.iso.date("작성일을 확인하세요."),
  budget: budgetSchema.optional().default(EMPTY_BUDGET),
});
export type PolicyInput = z.input<typeof policyInputSchema> & {
  budget: Budget;
};
/** 기기 보관본 검사용 — 적다 만 빈칸도 통과하되 모양은 맞아야 한다. */
export const policyDraftSchema = policyInputSchema.extend({
  policy: z.string().max(4000),
  goals: z.string().max(2000),
  representative: z.string().max(100),
  establishedOn: z.string().max(10),
  budget: budgetSchema.extend({
    items: z
      .array(z.object({ name: z.string().max(60), planned: manwon }))
      .max(12),
  }),
});
export type SafetyPolicy = PolicyInput & {
  updatedAt: string;
  updatedBy: string;
};

export function selectedYear(raw: string | undefined, current: number) {
  if (!raw) return current;
  const parsed = yearSchema.safeParse(Number(raw));
  return parsed.success ? parsed.data : null;
}

import { z } from "zod";

export const DEFAULT_POLICY = `우리는 모든 구성원의 안전과 건강을 최우선으로 합니다.
1. 작업 전 위험요인을 확인하고 안전한 작업방법을 지킵니다.
2. 위험한 상태를 발견하면 작업을 멈추고 알리며, 개선한 뒤 작업합니다.
3. 구성원의 의견을 듣고 필요한 안전조치와 교육을 실시합니다.
4. 안전보건 목표의 실행 상황을 확인하고 지속적으로 개선합니다.`;

export const yearSchema = z.number().int().min(2000).max(2100);
export const policyInputSchema = z.object({
  year: yearSchema,
  revision: z.number().int().nonnegative(),
  policy: z.string().trim().min(1, "안전보건 방침을 입력하세요.").max(4000),
  goals: z.string().trim().min(1, "연간 목표를 입력하세요.").max(2000),
  representative: z.string().trim().min(1, "대표자명을 입력하세요.").max(100),
  establishedOn: z.iso.date("작성일을 확인하세요."),
});
export type PolicyInput = z.infer<typeof policyInputSchema>;
export type SafetyPolicy = PolicyInput & {
  updatedAt: string;
  updatedBy: string;
};

export function selectedYear(raw: string | undefined, current: number) {
  if (!raw) return current;
  const parsed = yearSchema.safeParse(Number(raw));
  return parsed.success ? parsed.data : null;
}

import { z } from "zod";

/**
 * 회사 정보 화면(`/company`)에서 고치는 값들의 규칙.
 *
 * 회사 만들기(`features/onboarding/actions.ts`)와 같은 규칙이어야 한다 — 만들 때는
 * 통과한 값이 고칠 때 막히면(또는 그 반대면) 사장님은 왜 안 되는지 알 수 없다.
 * 화면과 서버가 같이 읽도록 이 파일은 server-only 가 아니다.
 */

export const SIZE_BANDS = [
  "UNDER_5",
  "FROM_5_TO_19",
  "FROM_20_TO_49",
  "FROM_50",
] as const;
export type SizeBand = (typeof SIZE_BANDS)[number];

export const SIZE_BAND_LABEL: Record<SizeBand, string> = {
  UNDER_5: "5인 미만",
  FROM_5_TO_19: "5인 이상 ~ 20인 미만",
  FROM_20_TO_49: "20인 이상 ~ 50인 미만",
  FROM_50: "50인 이상",
};

/**
 * 회사코드. 구성원이 "회사코드로 참여" 할 때 치는 값이라 헷갈리지 않게 영문 대문자와
 * 숫자만 받는다. 소문자로 쳐도 대문자로 바꿔 저장한다(참여 화면도 대문자로 바꿔 찾는다).
 * 너무 짧으면 남이 맞혀서 가입 요청을 넣을 수 있다 — 가입은 관리자 승인이 있어야
 * 되지만, 모르는 요청이 쌓이는 것도 일이다.
 */
export const companyCodeField = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .refine(
    (v) => /^[A-Z0-9]{6,16}$/.test(v),
    "회사코드는 영문과 숫자 6~16자로 입력하세요.",
  );

export const companyInfoSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "회사명을 입력하세요.")
    .max(80, "회사명은 80자 이내로 입력하세요."),
  business_type: z
    .string()
    .trim()
    .min(1, "업종을 입력하세요.")
    .max(80, "업종은 80자 이내로 입력하세요."),
  initial_employee_size_band: z.enum(SIZE_BANDS, {
    error: "인원규모를 선택하세요.",
  }),
  business_start_date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "사업개시일을 선택하세요."),
  expected_annual_revenue_manwon: z.coerce
    .number({ error: "예상 연매출액을 입력하세요." })
    .int("정수로 입력하세요 (만원 단위).")
    .min(0, "0 이상이어야 합니다.")
    .max(10_000_000_000, "값이 너무 큽니다."),
  company_code: companyCodeField,
  // 두 관리자가 같은 화면을 열어 두고 각자 저장하면 나중 사람이 앞사람 것을 덮는다.
  // 열 때의 값을 들고 와서 그사이 바뀌었으면 막는다 (프로필과 같은 방식).
  version: z.string().min(1).max(60),
});
export type CompanyInfoInput = z.input<typeof companyInfoSchema>;

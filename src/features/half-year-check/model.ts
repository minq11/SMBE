import { z } from "zod";

/** 반기: 1 = 1~6월, 2 = 7~12월. */
export type Half = 1 | 2;

export const halfOf = (isoDate: string): { year: number; half: Half } => ({
  year: Number(isoDate.slice(0, 4)),
  half: Number(isoDate.slice(5, 7)) <= 6 ? 1 : 2,
});
export const halfRange = (year: number, half: Half): [string, string] =>
  half === 1
    ? [`${year}-01-01`, `${year}-06-30`]
    : [`${year}-07-01`, `${year}-12-31`];
export const halfLabel = (half: Half) => (half === 1 ? "상반기" : "하반기");
export const periodLabel = (year: number, half: Half) =>
  `${year}년 ${halfLabel(half)}`;

/**
 * 지금 챙겨야 할 반기. 반기 마지막 달(6·12월)과 그다음 달(7·1월)에 그 반기를 가리킨다.
 * 그 밖의 달에는 없다 — 홈과 메일이 이 값으로 알린다.
 */
export function dueHalf(isoDate: string): { year: number; half: Half } | null {
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  if (month === 6 || month === 7) return { year, half: 1 };
  if (month === 12) return { year, half: 2 };
  if (month === 1) return { year: year - 1, half: 2 };
  return null;
}

export function parsePeriod(
  rawYear: string | undefined,
  rawHalf: string | undefined,
  today: string,
): { year: number; half: Half } | null {
  const current = halfOf(today);
  const year = rawYear ? Number(rawYear) : current.year;
  const half = rawHalf ? Number(rawHalf) : rawYear ? 1 : current.half;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
  if (half !== 1 && half !== 2) return null;
  return { year, half };
}

// ---------------------------------------------------------------------------
// 자동으로 채우는 숫자 (확정하면 그대로 박힌다)
// ---------------------------------------------------------------------------
export type HalfYearFacts = {
  period: { from: string; to: string };
  /** 2호 유해·위험요인 확인·개선 */
  hazard: {
    assessments: number;
    actions_done: number;
    actions_open: number;
    standards_expired: number;
    pending: number;
    findings_open: number;
    findings_resolved: number;
  };
  /** 4호 관리감독자 업무 수행 */
  supervisors: Array<{
    user_id: string;
    name: string;
    orders_issued: number;
    tbm_confirmed: number;
    inspections: number;
    findings_resolved: number;
  }>;
  /** 7호 종사자 의견 청취 */
  opinions: {
    near_misses: number;
    worker_reports: number;
    participants: number;
    meetings: number;
    quotes: Array<{ date: string; text: string }>;
  };
  /** 8호 대응 매뉴얼 */
  manual: { length: number; has_contact: boolean };
  /** 5조 법령 이행 — 방침·예산·선임 */
  legal: {
    policy_exists: boolean;
    budget: { planned: number; spent: number; rate: number | null } | null;
    duties: Array<{ name: string; note: string }>;
  };
};

// ---------------------------------------------------------------------------
// 대표자가 적는 것
// ---------------------------------------------------------------------------
export const SUPERVISOR_RATINGS = {
  GOOD: "충실",
  IMPROVE: "보완 필요",
} as const;
export type SupervisorRating = keyof typeof SUPERVISOR_RATINGS;

export const notesSchema = z.object({
  hazard: z.string().trim().max(1000, "조치 계획이 너무 깁니다.").default(""),
  supervisors: z
    .record(
      z.string().uuid(),
      z.object({
        rating: z.enum(["GOOD", "IMPROVE"]).nullable().default(null),
        note: z.string().trim().max(200).default(""),
      }),
    )
    .default({}),
  opinions: z.string().trim().max(1000, "조치 내용이 너무 깁니다.").default(""),
  manual_checked: z.boolean().default(false),
  manual: z.string().trim().max(500).default(""),
  legal: z.string().trim().max(1000, "조치 계획이 너무 깁니다.").default(""),
});
export type HalfYearNotes = z.infer<typeof notesSchema>;
export const EMPTY_NOTES: HalfYearNotes = {
  hazard: "",
  supervisors: {},
  opinions: "",
  manual_checked: false,
  manual: "",
  legal: "",
};

export const checkInputSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  half: z.union([z.literal(1), z.literal(2)]),
  notes: notesSchema,
  representative: z.string().trim().max(100),
});
export type HalfYearCheckInput = z.infer<typeof checkInputSchema>;

export type HalfYearCheck = {
  year: number;
  half: Half;
  status: "DRAFT" | "CONFIRMED";
  facts: HalfYearFacts;
  notes: HalfYearNotes;
  representative: string;
  confirmedOn: string | null;
  confirmedByName: string | null;
  updatedAt: string | null;
};

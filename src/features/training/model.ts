import { z } from "zod";

export const TRAINING_KINDS = ["HIRE", "REGULAR", "CHANGE", "SPECIAL"] as const;
export type TrainingKind = (typeof TRAINING_KINDS)[number];
export const KIND_LABEL: Record<TrainingKind, string> = {
  HIRE: "채용 시",
  REGULAR: "정기",
  CHANGE: "작업내용 변경 시",
  SPECIAL: "특별",
};
/** 종류별 한 줄 — 무엇을 언제, 몇 시간. 시행규칙 별표 4 기준 (일용·사무직 예외는 도움말에). */
export const KIND_HINT: Record<TrainingKind, string> = {
  HIRE: "새로 들어온 사람에게 첫 작업 전. 8시간 이상.",
  REGULAR: "모든 근로자 반기 12시간 이상, 관리감독자 연 16시간 이상.",
  CHANGE: "맡은 일이 바뀐 사람에게 바뀐 작업 전. 2시간 이상.",
  SPECIAL: "위험작업(PTW 대상 등)을 맡기기 전. 16시간 이상.",
};
/** 법정 시간 (시행규칙 별표 4). 정기는 반기로 나눠 센다 — 관리감독자 연 16 → 반기 8. */
export const REQUIRED_HOURS = {
  HIRE: 8,
  REGULAR_WORKER_HALF: 12,
  REGULAR_MANAGER_HALF: 8,
  CHANGE: 2,
  SPECIAL: 16,
} as const;
export const TBM_MINUTE_OPTIONS = [0, 10, 15, 20, 30] as const;

export const sessionInputSchema = z.object({
  kind: z.enum(TRAINING_KINDS, "교육 종류를 고르세요."),
  heldOn: z.iso.date("교육일을 확인하세요."),
  hours: z
    .number()
    .min(0.5, "교육 시간을 입력하세요.")
    .max(24, "교육 시간은 24시간까지입니다.")
    .refine((v) => Math.round(v * 2) === v * 2, "시간은 0.5 단위로 적습니다."),
  topic: z.string().trim().min(1, "교육 내용을 입력하세요.").max(200),
  instructor: z.string().trim().max(100).default(""),
  note: z.string().trim().max(1000).default(""),
  attendeeIds: z
    .array(z.string().uuid())
    .min(1, "참석자를 한 명 이상 고르세요.")
    .max(200),
});
export type SessionInput = z.infer<typeof sessionInputSchema>;

export type TrainingSessionRow = {
  id: string;
  kind: TrainingKind;
  held_on: string;
  hours: number;
  topic: string;
  instructor: string;
  attendee_count: number;
};
export type TrainingSessionDetail = TrainingSessionRow & {
  note: string;
  created_by_name: string;
  created_at: string;
  attendees: Array<{ user_id: string; name: string }>;
};

export type PersonTraining = {
  user_id: string;
  name: string;
  role: string;
  joined_on: string;
  /** 채용 시 교육: 기록 있음 / 필요(1년 안에 들어왔는데 기록 없음) / 해당 없음(오래된 인원) */
  hire: "DONE" | "MISSING" | "OLD";
  regular_hours: number;
  tbm_count: number;
  tbm_hours: number;
  regular_required: number;
  /** 모자라는 시간 (0 이면 채움) */
  regular_short: number;
  /** 최근 1년 PTW 작업에 배정됐는데 특별교육 기록이 없다 */
  special_check: boolean;
  special_done: boolean;
};

export type TrainingOverview = {
  year: number;
  half: 1 | 2;
  period: { from: string; to: string };
  tbmMinutes: number;
  people: PersonTraining[];
  sessionsThisHalf: number;
  regularShortCount: number;
  hireMissingCount: number;
  specialCheckCount: number;
};

export const halfLabelOf = (half: 1 | 2) => (half === 1 ? "상반기" : "하반기");
export const fmtHours = (h: number) =>
  Number.isInteger(h) ? `${h}시간` : `${h.toFixed(1)}시간`;

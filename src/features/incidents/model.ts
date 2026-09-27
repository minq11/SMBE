import { z } from "zod";

/**
 * 안전사고 — 사고 뒤 기한 안에 해야 할 일 목록 (docs/incident-plan.md).
 *
 * 등급과 할 일은 여기의 순수 함수가 정한다. 서버(server/incidents.ts)가 저장할 때
 * 부르고, 화면은 그 결과를 보여 줄 뿐이다.
 */

export type IncidentKind = "NEAR_MISS" | "INJURY";
export const KIND_LABEL: Record<IncidentKind, string> = {
  NEAR_MISS: "아차사고",
  INJURY: "재해",
};

/** 발생형태 — KOSHA 12종 + 기타 (사장님 결정: 조사표에 그대로 쓴다). */
export const OCCURRENCE_TYPES = [
  "FALL",
  "SLIP",
  "CRUSH",
  "STRIKE",
  "HIT_BY",
  "CAUGHT",
  "CUT",
  "ELECTRIC",
  "FIRE_EXPLOSION",
  "TEMPERATURE",
  "CHEMICAL",
  "ASPHYXIA",
  "OTHER",
] as const;
export type OccurrenceType = (typeof OCCURRENCE_TYPES)[number];
export const OCCURRENCE_LABEL: Record<OccurrenceType, string> = {
  FALL: "떨어짐",
  SLIP: "넘어짐",
  CRUSH: "깔림·뒤집힘",
  STRIKE: "부딪힘",
  HIT_BY: "물체에 맞음",
  CAUGHT: "끼임",
  CUT: "절단·베임·찔림",
  ELECTRIC: "감전",
  FIRE_EXPLOSION: "화재·폭발",
  TEMPERATURE: "이상온도 접촉",
  CHEMICAL: "유해물질 접촉",
  ASPHYXIA: "질식·산소결핍",
  OTHER: "기타",
};

export type IncidentGrade = "NEAR_MISS" | "MINOR" | "REPORTABLE" | "SERIOUS";
export const GRADE_LABEL: Record<IncidentGrade, string> = {
  NEAR_MISS: "아차사고",
  MINOR: "경미",
  REPORTABLE: "보고 대상",
  SERIOUS: "중대재해",
};
export const GRADE_TONE: Record<
  IncidentGrade,
  "ok" | "danger" | "info" | "plain"
> = {
  NEAR_MISS: "info",
  MINOR: "plain",
  REPORTABLE: "danger",
  SERIOUS: "danger",
};

export type IncidentStatus = "OPEN" | "CLOSED";
export const STATUS_LABEL: Record<IncidentStatus, string> = {
  OPEN: "처리 중",
  CLOSED: "종결",
};

export type DutyKind =
  | "STOP_WORK"
  | "REPORT_MINISTRY"
  | "SURVEY_FORM"
  | "RISK_ASSESSMENT"
  | "PREVENTION"
  | "SHARE"
  | "CEO_CONFIRM";

export const DUTY_LABEL: Record<
  DutyKind,
  { title: string; basis: string; hint: string }
> = {
  STOP_WORK: {
    title: "작업 중지 · 대피 · 위험요인 제거",
    basis: "산안법 54조 1항",
    hint: "무엇을 멈추고 무엇을 치웠는지, 언제.",
  },
  REPORT_MINISTRY: {
    title: "노동부 즉시 보고",
    basis: "산안법 54조 2항",
    hint: "관할 지방고용노동관서에 전화·팩스. 보고한 시각과 받은 사람.",
  },
  SURVEY_FORM: {
    title: "산업재해조사표 제출",
    basis: "산안법 57조 3항 · 발생일부터 1개월",
    hint: "제출일과 방법(전자·우편·방문). 근로자대표 확인 포함.",
  },
  RISK_ASSESSMENT: {
    title: "수시 위험성평가",
    basis: "위험성평가 고시 15조",
    hint: "이 작업의 표준서 회차를 새로 열어 위험요인과 감소대책을 다시 본다.",
  },
  PREVENTION: {
    title: "재발방지대책 이행",
    basis: "산안법 57조 2항",
    hint: "아래 재발방지대책이 모두 완료되면 저절로 끝난다.",
  },
  SHARE: {
    title: "근로자 공유",
    basis: "위험성평가 고시 15조",
    hint: "공지사항에 올리거나 TBM 에서 알린 날.",
  },
  CEO_CONFIRM: {
    title: "경영책임자 확인",
    basis: "중처법 시행령 4조 3호",
    hint: "경영책임자가 사고 내용과 대책을 확인한 날.",
  },
};

export class IncidentError extends Error {}

/* ------------------------------------------------------------------ */
/* 입력                                                                 */
/* ------------------------------------------------------------------ */

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식이 아닙니다.");

export const victimSchema = z.object({
  userId: z.string().uuid("다친 사람을 구성원에서 고르세요."),
  bodyPart: z.string().trim().max(100).default(""),
  injury: z.string().trim().max(200).default(""),
  expectedLeaveDays: z.coerce.number().int().min(0).max(3650).default(0),
  fatal: z.boolean().default(false),
  treatmentMonths: z.coerce.number().int().min(0).max(120).default(0),
  hospital: z.string().trim().max(200).default(""),
});

export const actionSchema = z.object({
  id: z.string().uuid().optional(),
  measure: z.string().trim().min(1, "재발방지대책 내용을 적으세요.").max(1000),
  responsibleId: z.string().uuid().nullable().default(null),
  dueOn: day.nullable().default(null),
});

export const incidentInputSchema = z.object({
  kind: z.enum(["NEAR_MISS", "INJURY"]),
  occurredOn: day,
  occurredTime: z.string().regex(/^\d{2}:\d{2}$/, "시간을 고르세요."),
  locationId: z.string().uuid().nullable().default(null),
  location: z.string().trim().min(1, "장소를 고르거나 적으세요.").max(200),
  locationDetail: z.string().trim().max(200).default(""),
  workOrderId: z.string().uuid().nullable().default(null),
  occurrenceType: z.enum(OCCURRENCE_TYPES),
  description: z
    .string()
    .trim()
    .min(1, "무슨 일이 있었는지 적으세요.")
    .max(4000),
  immediateAction: z.string().trim().max(2000).default(""),
  workStopped: z.boolean().default(false),
  evacuated: z.boolean().default(false),
  cause: z.string().trim().max(2000).default(""),
  victims: z.array(victimSchema).max(50).default([]),
  actions: z.array(actionSchema).max(30).default([]),
});
export type IncidentInput = z.infer<typeof incidentInputSchema>;

/** 작업자 신고 — 세 칸(무슨 일·어디·사진). 나머지는 관리자가 채운다. */
export const workerReportSchema = z.object({
  kind: z.enum(["NEAR_MISS", "INJURY"]),
  description: z
    .string()
    .trim()
    .min(1, "무슨 일이 있었는지 적으세요.")
    .max(2000),
  location: z.string().trim().min(1, "어디서 일어났는지 적으세요.").max(200),
});
export type WorkerReportInput = z.infer<typeof workerReportSchema>;

export type MyReport = {
  id: string;
  kind: IncidentKind;
  status: IncidentStatus;
  occurred_at: string;
  location: string;
  description: string;
};
export type VictimInput = z.infer<typeof victimSchema>;
export type ActionInput = z.infer<typeof actionSchema>;

/* ------------------------------------------------------------------ */
/* 등급                                                                 */
/* ------------------------------------------------------------------ */

type VictimFacts = Pick<
  VictimInput,
  "fatal" | "expectedLeaveDays" | "treatmentMonths"
>;

/**
 * 등급. 산안법 시행규칙 3조(중대재해)와 73조(조사표 제출 대상: 사망 또는 휴업 3일↑).
 * - 중대재해: 사망 1명↑ / 3개월↑ 요양 부상자 동시 2명↑ / 부상자 동시 10명↑
 * - 보고 대상: 사망 또는 휴업 3일↑
 * - 경미: 그 밖의 재해
 */
export function gradeOf(
  kind: IncidentKind,
  victims: VictimFacts[],
): IncidentGrade {
  if (kind === "NEAR_MISS") return "NEAR_MISS";
  const fatal = victims.some((v) => v.fatal);
  const longTreatment = victims.filter((v) => v.treatmentMonths >= 3).length;
  if (fatal || longTreatment >= 2 || victims.length >= 10) return "SERIOUS";
  if (victims.some((v) => v.expectedLeaveDays >= 3)) return "REPORTABLE";
  return "MINOR";
}

/**
 * 중처법 중대산업재해 (2조 2호): 사망 1명↑ / 동일 사고로 6개월↑ 치료 부상자 2명↑.
 * 직업성 질병 1년 내 3명은 사고 한 건으로는 알 수 없어 여기서 다루지 않는다.
 * 5인 미만 사업장은 적용 제외.
 */
export function seriousUnderScpa(
  kind: IncidentKind,
  victims: VictimFacts[],
  scpaApplies: boolean,
): boolean {
  if (!scpaApplies || kind === "NEAR_MISS") return false;
  return (
    victims.some((v) => v.fatal) ||
    victims.filter((v) => v.treatmentMonths >= 6).length >= 2
  );
}

/* ------------------------------------------------------------------ */
/* 할 일                                                                */
/* ------------------------------------------------------------------ */

const addDays = (iso: string, days: number) => {
  const d = new Date(iso + "T00:00:00+09:00");
  d.setUTCDate(d.getUTCDate() + days);
  // 한국 날짜로 되돌린다.
  return new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
};

/**
 * 등급에 맞는 할 일과 기한. 순서가 곧 화면 순서다 — 급한 것부터.
 * "즉시" 인 것은 발생일을 기한으로 둔다.
 */
export function dutiesFor(
  grade: IncidentGrade,
  occurredOn: string,
  scpaApplies: boolean,
): Array<{ kind: DutyKind; dueOn: string | null }> {
  const list: Array<{ kind: DutyKind; dueOn: string | null }> = [
    { kind: "STOP_WORK", dueOn: occurredOn },
  ];
  if (grade === "SERIOUS")
    list.push({ kind: "REPORT_MINISTRY", dueOn: occurredOn });
  if (grade === "SERIOUS" || grade === "REPORTABLE")
    list.push({ kind: "SURVEY_FORM", dueOn: addDays(occurredOn, 30) });
  list.push({ kind: "RISK_ASSESSMENT", dueOn: addDays(occurredOn, 7) });
  list.push({ kind: "PREVENTION", dueOn: null });
  list.push({ kind: "SHARE", dueOn: addDays(occurredOn, 7) });
  if (scpaApplies && grade !== "NEAR_MISS")
    list.push({ kind: "CEO_CONFIRM", dueOn: addDays(occurredOn, 14) });
  return list;
}

/** 중처법 적용 여부 — 5인 미만만 제외 (2024-01-27 전면 적용). */
export const scpaAppliesTo = (sizeBand: string | null | undefined) =>
  Boolean(sizeBand) && sizeBand !== "UNDER_5";

/* ------------------------------------------------------------------ */
/* 표시                                                                 */
/* ------------------------------------------------------------------ */

export type IncidentSummary = {
  id: string;
  kind: IncidentKind;
  grade: IncidentGrade;
  serious_under_scpa: boolean;
  status: IncidentStatus;
  occurred_at: string;
  location: string;
  occurrence_type: OccurrenceType;
  description: string;
  open_duty_count: number;
  next_due_on: string | null;
};

export type Victim = {
  id: string;
  user_id: string;
  name: string;
  body_part: string;
  injury: string;
  expected_leave_days: number;
  fatal: boolean;
  treatment_months: number;
  hospital: string;
};

export type IncidentAction = {
  id: string;
  measure: string;
  responsible_user_id: string | null;
  responsible_name: string | null;
  due_on: string | null;
  done_at: string | null;
  done_by_name: string | null;
  note: string;
};

export type Duty = {
  id: string;
  kind: DutyKind;
  due_on: string | null;
  done_at: string | null;
  done_by_name: string | null;
  note: string;
};

export type IncidentDetail = {
  id: string;
  kind: IncidentKind;
  grade: IncidentGrade;
  serious_under_scpa: boolean;
  status: IncidentStatus;
  occurred_at: string;
  location_id: string | null;
  location: string;
  location_detail: string;
  work_order_id: string | null;
  work_order_name: string | null;
  /** 연결한 지시서의 표준서 — 수시 위험성평가로 가는 길. */
  standard_id: string | null;
  occurrence_type: OccurrenceType;
  description: string;
  immediate_action: string;
  work_stopped: boolean;
  evacuated: boolean;
  cause: string;
  reported_by_name: string;
  reported_via: "MANAGER" | "WORKER";
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  closed_by_name: string | null;
  victims: Victim[];
  actions: IncidentAction[];
  duties: Duty[];
};

/** 목록·제목에 쓰는 한 줄 이름: "끼임 재해", "넘어짐 아차사고". */
export const incidentTitle = (i: {
  kind: IncidentKind;
  occurrence_type: OccurrenceType;
}) => `${OCCURRENCE_LABEL[i.occurrence_type]} ${KIND_LABEL[i.kind]}`;

export const occurredDate = (iso: string) =>
  new Date(iso).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
export const occurredClock = (iso: string) =>
  new Date(iso).toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
export const shortDay = (iso: string | null) =>
  iso
    ? new Date(
        iso.length === 10 ? iso + "T00:00:00+09:00" : iso,
      ).toLocaleDateString("ko-KR", {
        timeZone: "Asia/Seoul",
        month: "numeric",
        day: "numeric",
      })
    : "";

/** 한국 날짜(YYYY-MM-DD)와 시각(HH:MM) → 저장용 ISO. */
export const toOccurredAt = (day: string, time: string) =>
  new Date(`${day}T${time}:00+09:00`).toISOString();
/** 저장된 ISO → 폼의 날짜·시각. */
export function fromOccurredAt(iso: string): { day: string; time: string } {
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
  return {
    day: d.toISOString().slice(0, 10),
    time: d.toISOString().slice(11, 16),
  };
}

import { z } from "zod";
import {
  initialAllowable,
  type RiskCriteria,
} from "@/features/company/risk-criteria";

const text = z.string().max(4000);
const ids = z
  .array(z.string().uuid())
  .max(500)
  .transform((values) => [...new Set(values)]);
export const riskSchema = z.object({
  hazard: text,
  // 옛 초안에는 없던 칸. 없으면 빈 글로 읽는다.
  currentControl: text.optional().default(""),
  level: z.enum(["", "HIGH", "MID", "LOW"]),
  allowable: z.enum(["", "yes", "no"]),
  measure: text,
  responsibleId: z.string().max(36),
  dueDate: z.string().max(10),
});
/**
 * 지시서 안의 위험작업허가 항목. 초안은 비워 둘 수 있으니 전부 느슨하고, 발급 때
 * `permitProblem` 과 서버(`permitInput`)가 채웠는지 본다.
 */
export const permitDraftSchema = z.object({
  approverId: z.string().max(36).default(""),
  responsibleId: z.string().max(36).default(""),
  locationId: z.string().max(36).default(""),
  equipment: z.string().max(2000).default(""),
  notes: z.string().max(4000).default(""),
  hotWork: z.boolean().default(false),
  fireWatcherId: z.string().max(36).default(""),
  contacts: z
    .array(z.object({ name: z.string().max(100), phone: z.string().max(30) }))
    .max(10)
    .default([]),
});
export type PermitDraft = z.infer<typeof permitDraftSchema>;
export const blankPermit = (): PermitDraft => ({
  approverId: "",
  responsibleId: "",
  locationId: "",
  equipment: "",
  notes: "",
  hotWork: false,
  fireWatcherId: "",
  contacts: [{ name: "", phone: "" }],
});
const PHONE = /^\+?[0-9 ()-]{7,30}$/;
/** 발급 전 허가 항목 검사. 문제가 없으면 null. 서버가 다시 검사한다. */
export function permitProblem(p: PermitDraft): string | null {
  const uuid = (v: string) => z.string().uuid().safeParse(v).success;
  if (!uuid(p.approverId)) return "허가 승인자를 고르세요.";
  if (!uuid(p.responsibleId)) return "작업책임자를 고르세요.";
  if (!uuid(p.locationId)) return "등록된 허가 장소를 고르세요.";
  if (!p.equipment.trim()) return "대상 설비를 적으세요.";
  if (p.hotWork && !uuid(p.fireWatcherId)) return "화기작업은 화재감시자가 필요합니다.";
  const contacts = p.contacts.filter((c) => c.name.trim() || c.phone.trim());
  if (contacts.length === 0) return "비상연락처를 하나 이상 적으세요.";
  for (const c of contacts) {
    if (!c.name.trim()) return "비상연락처 이름을 적으세요.";
    if (!PHONE.test(c.phone.trim())) return "비상연락처 전화번호를 확인하세요.";
  }
  return null;
}
export const draftSchema = z.object({
  standardId: z.string().uuid().nullable().optional().default(null),
  // 표준서를 고를 때 그 내용이 어느 판이었나. 발급 때 지시서에 박힌다 — 초안을 쓰는
  // 사이 표준서가 개정돼도 지시서는 자기가 복사한 판을 가리킨다.
  standardRevisionId: z.string().uuid().nullable().optional().default(null),
  name: z.string().trim().min(1, "작업명을 입력하세요.").max(120),
  groupLabel: z.string().max(40),
  method: text,
  location: z.string().max(200),
  startDate: z.string().max(10),
  endDate: z.string().max(10),
  startTime: z.string().max(5),
  endTime: z.string().max(5),
  ptwRequired: z.boolean(),
  assessmentKind: z.enum(["FIRST", "PERIODIC", "AD_HOC", "CONTINUOUS"]),
  performedOn: z.string().max(10),
  safetyInfo: z.object({
    equipment: text,
    materials: text,
    environment: text,
    history: text,
  }),
  workerOpinion: text.optional().default(""),
  // PTW 필요일 때 지시서 안에서 적는 허가 항목. 옛 초안에는 없다.
  permit: permitDraftSchema.optional().default(blankPermit),
  risks: z.array(riskSchema).min(1).max(50),
  participantIds: ids,
  assigneeIds: ids,
  tbm: z.array(z.string().max(500)).max(50),
  during: z.array(z.string().max(500)).max(50),
});
export type WorkDraft = z.infer<typeof draftSchema>;
export type MemberOption = {
  user_id: string;
  display_name: string;
  role: string;
};
export class WorkOrderError extends Error {}
export function seoulToday(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}
export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function shiftMinutes(start: string, end: string) {
  if (![start, end].every((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t))) return 0;
  const minutes = (t: string) =>
    Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  return (minutes(end) - minutes(start) + 1440) % 1440;
}
/**
 * 평가 입력 검사. `criteria` 가 있으면 허용 여부를 수준 + 회사 기준으로 정해 담당·예정일
 * 필수 여부를 판단한다 (서버). 없으면 화면이 같은 규칙으로 채워 둔 값을 쓴다 (클라이언트).
 */
export function validateAssessment(d: WorkDraft, criteria?: RiskCriteria) {
  if (!d.method.trim() || !validDate(d.performedOn))
    throw new WorkOrderError("작업방법과 평가일을 입력하세요.");
  if (d.performedOn > seoulToday())
    throw new WorkOrderError("평가일은 미래일 수 없습니다.");
  if (!d.participantIds.length)
    throw new WorkOrderError("평가에 실제 참여한 근로자를 선택하세요.");
  if (Object.values(d.safetyInfo).some((v) => !v.trim()))
    throw new WorkOrderError(
      "사전조사 정보를 모두 입력하세요. 해당사항이 없으면 그 사실을 적어 주세요.",
    );
  for (const r of d.risks) {
    if (!r.hazard.trim() || !r.level || !r.measure.trim())
      throw new WorkOrderError("모든 위험요인의 수준·감소대책을 확인하세요.");
    const needsAction = criteria
      ? !initialAllowable(criteria, r.level)
      : r.allowable === "no";
    if (
      needsAction &&
      (!z.string().uuid().safeParse(r.responsibleId).success ||
        !validDate(r.dueDate))
    )
      throw new WorkOrderError(
        "허용 불가 위험에는 조치 담당자와 예정일이 필요합니다.",
      );
    if (
      r.responsibleId &&
      !z.string().uuid().safeParse(r.responsibleId).success
    )
      throw new WorkOrderError("조치 담당자를 확인하세요.");
    if (r.dueDate && !validDate(r.dueDate))
      throw new WorkOrderError("조치 예정일을 확인하세요.");
  }
}
export function validateSchedule(d: WorkDraft) {
  if (
    !validDate(d.startDate) ||
    !validDate(d.endDate) ||
    d.endDate < d.startDate
  )
    throw new WorkOrderError("작업기간을 확인하세요.");
  if ((Date.parse(d.endDate) - Date.parse(d.startDate)) / 86400_000 > 365)
    throw new WorkOrderError("한 지시서의 작업기간은 최대 366일입니다.");
  const minutes = shiftMinutes(d.startTime, d.endTime);
  if (!minutes || minutes > 960)
    throw new WorkOrderError(
      "작업시간은 0시간 초과, 16시간 이하여야 합니다. 야간작업은 다음 날 종료로 계산합니다.",
    );
  if (!d.assigneeIds.length)
    throw new WorkOrderError("작업자를 한 명 이상 배정하세요.");
  if (!d.location.trim()) throw new WorkOrderError("작업 장소를 입력하세요.");
}
export function validateIssue(d: WorkDraft) {
  validateAssessment(d);
  validateSchedule(d);
  if (d.ptwRequired)
    throw new WorkOrderError(
      "PTW가 필요한 작업은 허가가 승인돼야 발급됩니다.",
    );
  if (
    ![d.tbm, d.during].every(
      (items) => items.length > 0 && items.every((v) => v.trim()),
    )
  )
    throw new WorkOrderError(
      "TBM·작업 중 체크리스트를 각각 한 항목 이상 입력하세요.",
    );
}
export function blankDraft(): WorkDraft {
  const today = seoulToday();
  return {
    standardId: null,
    standardRevisionId: null,
    permit: blankPermit(),
    name: "",
    groupLabel: "",
    method: "",
    location: "",
    startDate: today,
    endDate: today,
    startTime: "09:00",
    endTime: "17:00",
    ptwRequired: false,
    assessmentKind: "AD_HOC",
    performedOn: seoulToday(),
    safetyInfo: { equipment: "", materials: "", environment: "", history: "" },
    workerOpinion: "",
    risks: [
      {
        hazard: "",
        currentControl: "",
        level: "",
        allowable: "",
        measure: "",
        responsibleId: "",
        dueDate: "",
      },
    ],
    participantIds: [],
    assigneeIds: [],
    tbm: [""],
    during: [""],
  };
}
export type OrderStatus =
  | "DRAFT"
  | "ISSUE_PENDING"
  | "ISSUED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELED";
export const STATUS_LABEL: Record<OrderStatus, string> = {
  DRAFT: "작성 중",
  ISSUE_PENDING: "발급 대기",
  ISSUED: "발급",
  IN_PROGRESS: "진행",
  COMPLETED: "작업기간 종료",
  CANCELED: "취소",
};
export function effectiveStatus(
  status: OrderStatus,
  d: Pick<WorkDraft, "startDate" | "endDate" | "startTime" | "endTime">,
  now = new Date(),
): OrderStatus {
  if (!["ISSUED", "IN_PROGRESS", "COMPLETED"].includes(status)) return status;
  const start =
    Date.parse(d.startDate + "T" + d.startTime + ":00+09:00") - 2 * 3600_000;
  let end =
    Date.parse(d.endDate + "T" + d.endTime + ":00+09:00") + 2 * 3600_000;
  if (d.endTime <= d.startTime) end += 86400_000;
  return now.getTime() > end
    ? "COMPLETED"
    : now.getTime() >= start
      ? "IN_PROGRESS"
      : "ISSUED";
}
export function archiveLocked(
  status: OrderStatus,
  endDate: string,
  canceledAt: string | null,
  pro: boolean,
  now = new Date(),
) {
  if (pro || !["COMPLETED", "CANCELED"].includes(status)) return false;
  const cutoff = new Date(now.getTime() - 7 * 86400_000).toISOString();
  return status === "CANCELED"
    ? Boolean(canceledAt && new Date(canceledAt).toISOString() < cutoff)
    : endDate < seoulToday(new Date(now.getTime() - 7 * 86400_000));
}

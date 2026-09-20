import { z } from "zod";

const text = z.string().max(4000);
const ids = z
  .array(z.string().uuid())
  .max(500)
  .transform((values) => [...new Set(values)]);
export const riskSchema = z.object({
  hazard: text,
  level: z.enum(["", "HIGH", "MID", "LOW"]),
  allowable: z.enum(["", "yes", "no"]),
  measure: text,
  responsibleId: z.string().max(36),
  dueDate: z.string().max(10),
});
export const draftSchema = z.object({
  standardId: z.string().uuid().nullable().optional().default(null),
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
  criteria: text,
  safetyInfo: z.object({
    equipment: text,
    materials: text,
    environment: text,
    history: text,
  }),
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
export function validateAssessment(d: WorkDraft) {
  if (!d.method.trim() || !d.criteria.trim() || !validDate(d.performedOn))
    throw new WorkOrderError("작업방법·평가일·위험성 판단 기준을 입력하세요.");
  if (d.performedOn > seoulToday())
    throw new WorkOrderError("평가일은 미래일 수 없습니다.");
  if (!d.participantIds.length)
    throw new WorkOrderError("평가에 실제 참여한 근로자를 선택하세요.");
  if (Object.values(d.safetyInfo).some((v) => !v.trim()))
    throw new WorkOrderError(
      "사전조사 정보를 모두 입력하세요. 해당사항이 없으면 그 사실을 적어 주세요.",
    );
  for (const r of d.risks) {
    if (!r.hazard.trim() || !r.level || !r.allowable || !r.measure.trim())
      throw new WorkOrderError(
        "모든 위험요인의 수준·허용 여부·감소대책을 확인하세요.",
      );
    if (
      r.allowable === "no" &&
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
      "PTW가 필요한 작업은 아직 발급할 수 없습니다. 허가 기능 구현 후 진행하세요.",
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
  return {
    standardId: null,
    name: "",
    groupLabel: "",
    method: "",
    location: "",
    startDate: "",
    endDate: "",
    startTime: "09:00",
    endTime: "17:00",
    ptwRequired: false,
    assessmentKind: "AD_HOC",
    performedOn: seoulToday(),
    criteria: "",
    safetyInfo: { equipment: "", materials: "", environment: "", history: "" },
    risks: [
      {
        hazard: "",
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

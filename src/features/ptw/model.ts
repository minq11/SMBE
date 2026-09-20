import type { WorkDraft } from "../work-orders/model";
export const PERMIT_LABEL: Record<string, string> = {
  PENDING: "승인 대기",
  APPROVED: "승인",
  REJECTED: "반려",
  WITHDRAWN: "철회",
  INVALID: "무효",
  EXPIRED: "만료",
};
export function permitStatus(
  status: string,
  orderStatus: string,
  d: WorkDraft,
  now = new Date(),
) {
  if (orderStatus === "CANCELED") return "INVALID";
  const end =
    new Date(d.endDate + "T" + d.endTime + ":00+09:00").getTime() +
    (d.endTime <= d.startTime ? 86400000 : 0);
  return status === "APPROVED" && now.getTime() > end ? "EXPIRED" : status;
}

import type {
  AssessmentKind,
  AssessmentStatus,
} from "@/features/standards/constants";

export const KIND_SHORT: Record<AssessmentKind, string> = {
  FIRST: "최초",
  PERIODIC: "정기",
  AD_HOC: "수시",
  CONTINUOUS: "상시",
};

export const STATUS_LABEL: Record<AssessmentStatus, string> = {
  DRAFT: "작성 중",
  PENDING: "승인 대기",
  APPROVED: "승인",
  REJECTED: "반려",
};

export const LEVEL_LABEL = { HIGH: "상", MID: "중", LOW: "하" } as const;

export const koDate = (v: string | null | undefined) =>
  v
    ? new Date(
        v + (v.length === 10 ? "T00:00:00+09:00" : ""),
      ).toLocaleDateString("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";

export const shortDate = (v: string | null | undefined) =>
  v
    ? new Date(
        v + (v.length === 10 ? "T00:00:00+09:00" : ""),
      ).toLocaleDateString("ko-KR", {
        timeZone: "Asia/Seoul",
        month: "numeric",
        day: "numeric",
      })
    : "";

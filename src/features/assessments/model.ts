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

/**
 * 사전조사 안전보건정보 칸의 예시 문구. "해당없음이라고 적으라" 는 안내 대신 현장의
 * 예를 보여 준다 — 무엇을 적는 칸인지는 예시가 가장 빨리 말한다 (사장님 2026-09-30).
 */
export const SAFETY_INFO_HINTS = {
  equipment: "예: 150톤 프레스 2대, 안전블록 4개, 광전자식 방호장치",
  materials: "예: 절삭유(MSDS 있음), 세척용 알코올 소량",
  environment: "예: 야간 조명 부족, 바닥에 기름기, 지게차 통행로와 겹침",
  history: "예: 2025년 금형 교체 중 손가락 끼임 아차사고 1건",
} as const;

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

import { z } from "zod";
import { seoulToday } from "../work-orders/model";

export const inspectionSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  sessionId: z.string().uuid(),
  category: z.enum(["TBM", "DURING_WORK"]),
  entryPath: z.enum(["WEB", "QR", "LINK"]),
  confirmed: z.boolean(),
  results: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        result: z.enum(["PASS", "FAIL", "NA"]),
        comment: z.string().trim().max(2000),
        managerId: z.union([z.literal(""), z.string().uuid()]),
      }),
    )
    .min(1)
    .max(100),
});
export type InspectionInput = z.infer<typeof inspectionSchema>;
export type SessionRow = {
  id: string;
  work_date: string;
  starts_at: string;
  ends_at: string;
  expected_assignees: Array<{ userId: string; name: string }>;
  tbm_users: string[];
  during_count: number;
};
// 회차는 작업일자(KST) 기준으로만 나눈다. 회차 상태는 게이트가 아니라 라벨이며,
// 입력 가능 여부는 canInput 하나로 결정된다 — 미래 회차만 막고 오늘·과거는 허용한다.
// 도입기 사용자가 회차 시간대를 놓쳐도 TBM을 이어서 찍을 수 있게 하기 위함이다.
export function sessionState(
  s: SessionRow,
  now = new Date(),
): {
  missing: SessionRow["expected_assignees"];
  state: "FUTURE" | "TODAY" | "PAST";
  canInput: boolean;
  done: boolean;
} {
  const missing = s.expected_assignees.filter(
    (a) => !s.tbm_users.includes(a.userId),
  );
  const today = seoulToday(now);
  const state: "FUTURE" | "TODAY" | "PAST" =
    s.work_date > today ? "FUTURE" : s.work_date < today ? "PAST" : "TODAY";
  const canInput = state !== "FUTURE";
  const done =
    s.expected_assignees.length > 0 && !missing.length && s.during_count > 0;
  return { missing, state, canInput, done };
}
export const SESSION_LABEL: Record<"FUTURE" | "TODAY" | "PAST", string> = {
  FUTURE: "예정",
  TODAY: "오늘",
  PAST: "지난 회차",
};
/** 회차 배지 색: 오늘 파랑, 예정·지난은 회색. */
export const SESSION_TONE: Record<"FUTURE" | "TODAY" | "PAST", string> = {
  FUTURE: "plain",
  TODAY: "info",
  PAST: "plain",
};

// SQL 은 work_date DESC 로 돌려주지만 화면에서는 오늘을 상단 강조, 지난은 최근순,
// 미래는 하단(가장 가까운 날짜부터) 순서가 더 자연스럽다. UI 두 곳에서 같은 규칙을 쓴다.
export function orderSessionsForDisplay<T extends SessionRow>(
  sessions: readonly T[],
  now = new Date(),
): T[] {
  const groups: Record<"TODAY" | "PAST" | "FUTURE", T[]> = {
    TODAY: [],
    PAST: [],
    FUTURE: [],
  };
  for (const s of sessions) groups[sessionState(s, now).state].push(s);
  return [...groups.TODAY, ...groups.PAST, ...groups.FUTURE.slice().reverse()];
}
export const RESULT_LABEL = { PASS: "양호", FAIL: "불량", NA: "해당없음" };
export function entryPath(value?: string) {
  return value === "qr" ? "QR" : value === "link" ? "LINK" : "WEB";
}

/**
 * 관리자 대리 입력(사후 입력). 현장 입력과 같은 내용을 넣되 "누구의 점검인가"
 * (inspectorId)와 "누가 입력했는가"(서버가 actor 로 채움)가 갈라진다.
 * 경로는 항상 WEB 이다 — QR·링크로 들어온 현장 기록으로 위장할 수 없다 (0014).
 */
export const backfillSchema = inspectionSchema.extend({
  inspectorId: z.string().uuid(),
  entryPath: z.literal("WEB"),
});
export type BackfillInput = z.infer<typeof backfillSchema>;

/** 저장된 점검 결과 수정. 원본은 지우지 않고 수정 전·후를 통째로 남긴다. */
export const reviseSchema = z.object({
  inspectionId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
  results: z
    .array(
      z.object({
        resultId: z.string().uuid(),
        result: z.enum(["PASS", "FAIL", "NA"]),
        comment: z.string().trim().max(2000),
        managerId: z.union([z.literal(""), z.string().uuid()]),
      }),
    )
    .min(1)
    .max(100),
});
export type ReviseInput = z.infer<typeof reviseSchema>;

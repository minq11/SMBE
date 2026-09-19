import { z } from "zod";

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
export function sessionState(
  s: SessionRow,
  now = new Date(),
): {
  missing: SessionRow["expected_assignees"];
  open: boolean;
  state: "DONE" | "OPEN" | "SCHEDULED" | "MISSED";
} {
  const missing = s.expected_assignees.filter(
    (a) => !s.tbm_users.includes(a.userId),
  );
  const open =
    now.getTime() >= Date.parse(s.starts_at) - 7200000 &&
    now.getTime() <= Date.parse(s.ends_at) + 7200000;
  const done =
    s.expected_assignees.length > 0 && !missing.length && s.during_count > 0;
  const state =
    now.getTime() < Date.parse(s.starts_at) - 7200000
      ? "SCHEDULED"
      : open
        ? "OPEN"
        : done
          ? "DONE"
          : "MISSED";
  return { missing, open, state };
}
export const SESSION_LABEL = {
  DONE: "점검 완료",
  OPEN: "점검 가능",
  SCHEDULED: "예정",
  MISSED: "점검 누락",
};
export const RESULT_LABEL = { PASS: "적합", FAIL: "부적합", NA: "해당없음" };
export function entryPath(value?: string) {
  return value === "qr" ? "QR" : value === "link" ? "LINK" : "WEB";
}

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_POLICY,
  policyInputSchema,
  selectedYear,
} from "../src/features/safety-policy/model";

const input = {
  year: 2026,
  revision: 0,
  policy: DEFAULT_POLICY,
  goals: " 매일 TBM ",
  representative: " 대표 ",
  establishedOn: "2026-10-07",
};
test("annual policy accepts trimmed text and validates dates, limits, required fields and revision", () => {
  const parsed = policyInputSchema.parse(input);
  assert.equal(parsed.goals, "매일 TBM");
  assert.equal(parsed.representative, "대표");
  for (const patch of [
    { year: 1999 },
    { year: 2101 },
    { year: 2026.5 },
    { revision: -1 },
    { policy: " " },
    { goals: " " },
    { representative: " " },
    { policy: "가".repeat(4001) },
    { goals: "가".repeat(2001) },
    { representative: "가".repeat(101) },
    { establishedOn: "2026-02-30" },
  ])
    assert.equal(
      policyInputSchema.safeParse({ ...input, ...patch }).success,
      false,
    );
});
test("year selection uses current year only when omitted; invalid years do not select another document", () => {
  assert.equal(selectedYear(undefined, 2026), 2026);
  assert.equal(selectedYear("2025", 2026), 2025);
  assert.equal(selectedYear("2027", 2026), 2027);
  assert.equal(selectedYear("wrong", 2026), null);
  assert.equal(selectedYear("2101", 2026), null);
});

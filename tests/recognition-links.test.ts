import assert from "node:assert/strict";
import { test } from "node:test";
import { QUESTIONS } from "../src/features/recognition-check/questions";
import { computeResult, smbeCoverage } from "../src/features/recognition-check/scoring";

test("participation links to assessments; sharing has two destinations without double-counting gain", () => {
  assert.deepEqual(QUESTIONS.find(q => q.id === "III-3-2")?.smbeHint,
    { href: "/assessments", label: "평가 참여·의견 기록" });
  const sharing = QUESTIONS.find(q => q.id === "III-2-3")!;
  assert.equal(sharing.smbeHint?.href, "/inspections");
  assert.equal(sharing.secondaryHint?.href, "/meetings");
  const answers = Object.fromEntries(QUESTIONS.map(q => [q.id, q.choices.at(-1)!.key]));
  answers[sharing.id] = "MI";
  const result = computeResult({ industry: "manufacturing", sizeBand: "UNDER_5" }, answers);
  assert.deepEqual(smbeCoverage(result), { needs: 1, covered: 1, gain: 2.2 });
});

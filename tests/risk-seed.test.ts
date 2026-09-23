import assert from "node:assert/strict";
import { test } from "node:test";
import {
  riskSeedFromItem,
  type RiskItem,
} from "../src/features/standards/constants";

const base: RiskItem = {
  id: "i1",
  order_no: 1,
  hazard: "끼임",
  initial_risk_level: "HIGH",
  initial_allowable: false,
  current_control: "작업자 주의",
  reduction_measure: "방호덮개 설치",
  responsible_user_id: "u1",
  planned_completion_date: "2026-01-31",
  actual_action: null,
  actual_completion_date: null,
  post_risk_level: null,
  post_allowable: null,
};

test("risk seed: open action keeps initial verdict, owner and due date", () => {
  assert.deepEqual(riskSeedFromItem(base), {
    hazard: "끼임",
    currentControl: "작업자 주의",
    level: "HIGH",
    allowable: "no",
    measure: "방호덮개 설치",
    responsibleId: "u1",
    dueDate: "2026-01-31",
  });
});

test("risk seed: completed action seeds the post-action verdict and clears owner/due", () => {
  assert.deepEqual(
    riskSeedFromItem({
      ...base,
      actual_action: "덮개 설치 완료",
      actual_completion_date: "2026-01-20",
      post_risk_level: "LOW",
      post_allowable: true,
    }),
    {
      hazard: "끼임",
      // 끝난 조치가 지금 서 있는 안전조치가 된다.
      currentControl: "작업자 주의 / 덮개 설치 완료",
      level: "LOW",
      allowable: "yes",
      measure: "방호덮개 설치",
      responsibleId: "",
      dueDate: "",
    },
  );
});

test("risk seed: completed action without a post verdict falls back to initial", () => {
  const seed = riskSeedFromItem({
    ...base,
    actual_action: "덮개 설치",
    actual_completion_date: "2026-01-20",
  });
  assert.equal(seed.level, "HIGH");
  assert.equal(seed.allowable, "no");
  assert.equal(seed.responsibleId, "");
});

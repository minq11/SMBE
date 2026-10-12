-- 안전보건 예산 (중대재해처벌법 시행령 제4조 제3호).
--
-- 방침·목표 연도 문서에 붙인다. 항목별 편성(만원)과 분기별 집행 한 줄 — 회계 연동이
-- 아니라 "편성했고 집행했다" 는 기록이 목적이다. 반기 점검이 편성 대비 집행률을 읽는다.
--   budget = { "items": [{ "name": "보호구", "planned": 120 }, …],
--              "spent": [{ "quarter": 1, "amount": 40, "note": "안전화 6켤레" }, …] }
ALTER TABLE company_safety_policies
  ADD COLUMN budget jsonb NOT NULL DEFAULT '{"items":[],"spent":[]}'::jsonb
  CHECK (jsonb_typeof(budget->'items') = 'array'
     AND jsonb_typeof(budget->'spent') = 'array');

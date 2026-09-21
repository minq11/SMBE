-- 계약한 요금 구간과 결제 기준일.
--
-- 지금까지 구간은 현재 인원에서 계산했는데, 그러면 인원이 늘 때 구간도 따라 올라가
-- "구간을 넘으면 등록을 막는다"는 규칙이 성립하지 않는다. 계약한 구간과 실제 인원을
-- 분리해야 초과 여부를 판정할 수 있다.
--
--   plan              계약한 구간 (유료 회사만)
--   plan_started_at   현재 구간의 결제 기준일
--   active_headcount  실제 인원 (refreshHeadcount 가 갱신)
--
-- 상향 시 잔여 기간을 정산해 즉시 결제하고 그날이 새 기준일이 되므로, 기준일을
-- 보관해야 정산 금액을 계산할 수 있다. 하향은 다음 주기부터 적용하고 환불하지 않는다.
--
-- 무료 회사는 둘 다 NULL 이며 인원 제한이 없다 — 무료는 인원이 아니라 기능이 제한된다.
-- ENTERPRISE 는 100인 이상 개별 협의 계약으로 인원 상한을 두지 않는다.
-- 구간 정의와 정산 계산: src/features/billing/plans.ts

ALTER TABLE companies
  ADD COLUMN plan text
    CHECK (plan IS NULL OR plan IN ('BASIC', 'STANDARD', 'PRO', 'ENTERPRISE')),
  ADD COLUMN plan_started_at timestamptz;

-- 기존 유료 회사는 현재 인원이 속하는 구간으로 맞추고 기준일을 오늘로 둔다.
UPDATE companies
   SET plan = CASE
         WHEN active_headcount <= 19 THEN 'BASIC'
         WHEN active_headcount <= 49 THEN 'STANDARD'
         WHEN active_headcount <= 99 THEN 'PRO'
         ELSE 'ENTERPRISE' END,
       plan_started_at = now()
 WHERE pro_state <> 'FREE';

-- 유료면 구간과 기준일이 있어야 하고, 무료면 둘 다 없어야 한다.
ALTER TABLE companies
  ADD CONSTRAINT companies_plan_matches_pro_state CHECK (
    (pro_state = 'FREE' AND plan IS NULL AND plan_started_at IS NULL)
    OR (pro_state <> 'FREE' AND plan IS NOT NULL AND plan_started_at IS NOT NULL)
  );

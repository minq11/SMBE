-- 회사 등록 필수값 확장
-- 1) 예상 연매출액(만원 단위) 신설, 필수
-- 2) 사업개시일도 필수로 승격

-- 기존 테스트 데이터에 사업개시일이 없으면 created_at으로 백필한 뒤 NOT NULL 승격
UPDATE companies
   SET business_start_date = created_at::date
 WHERE business_start_date IS NULL;

ALTER TABLE companies
  ALTER COLUMN business_start_date SET NOT NULL;

-- 예상 연매출액 (단위: 만원). 신규 컬럼이므로 임시 DEFAULT로 기존 행 채운 뒤 DEFAULT 해제.
ALTER TABLE companies
  ADD COLUMN expected_annual_revenue_manwon bigint NOT NULL DEFAULT 0
    CHECK (expected_annual_revenue_manwon >= 0);

ALTER TABLE companies
  ALTER COLUMN expected_annual_revenue_manwon DROP DEFAULT;

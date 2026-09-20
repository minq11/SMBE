-- 지시서 ↔ 표준서 정식 링크
-- 지금까지: 표준서 선택 시 폼 pre-fill 만 되고 저장 시 표준서 참조를 남기지 않음.
-- 변경: work_orders 에 standard_id 컬럼 추가, 발급 시 STANDARD_META 스냅샷 기록,
--       표준서 기반 지시서의 risk_assessments 는 is_simple=false + standard_id 로 마킹.

ALTER TABLE work_orders
  ADD COLUMN standard_id uuid REFERENCES standards(id);

CREATE INDEX work_orders_standard_id_idx
  ON work_orders (standard_id)
  WHERE standard_id IS NOT NULL;

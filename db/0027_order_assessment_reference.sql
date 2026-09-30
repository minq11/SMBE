-- 표준서 지시서는 위험성평가를 복사하지 않고 표준서의 승인된 평가를 가리킨다
-- (사장님 결정 2026-09-30).
--
-- 그동안 표준서 지시서를 발급할 때마다 표준서 평가의 사본(risk_assessments 행)이
-- 생겼다. 위험성평가 목록이 같은 내용으로 부풀고, 허용 불가 위험요인의 조치가
-- 사본마다 따로 세어졌다. 발급 시점의 위험요인·대책은 이미 work_order_snapshots
-- (RISK_ASSESSMENT) 에 남으므로 사본 행은 필요 없다.
--
-- 이미 생긴 사본은 지우지 않고(발급된 지시서가 가리킨다) order_copy 로 표시해
-- 목록·집계·회의 수집에서 뺀다. 이 시점에 지시서가 가리키는 표준서 평가는 전부
-- 사본이다 — 참조 방식은 이 마이그레이션 뒤부터 시작한다.
ALTER TABLE risk_assessments
  ADD COLUMN order_copy boolean NOT NULL DEFAULT false;

UPDATE risk_assessments ra
   SET order_copy = true
 WHERE NOT ra.is_simple
   AND EXISTS (SELECT 1 FROM work_orders wo WHERE wo.risk_assessment_id = ra.id);

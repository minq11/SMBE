-- 점검 항목 하나하나에 사진을 붙일 수 있게 한다.
-- 지금까지 점검 쪽 첨부 대상은 '부적합(inspection_finding)' 뿐이었다. 그런데
-- 현장에서 찍는 사진은 부적합 증거만이 아니다 — 적합 판정의 근거("가드가 닫혀
-- 있다")도 사진이 가장 빠르고, 그건 붙일 자리가 없었다.
-- inspection_results 는 항목당 한 행이므로 결과에 관계없이 사진의 집이 된다.
ALTER TABLE attachments DROP CONSTRAINT attachments_target_type_check;
ALTER TABLE attachments ADD CONSTRAINT attachments_target_type_check
  CHECK (target_type IN (
    'standard_step',
    'risk_item_before',
    'risk_item_after',
    'work_order',
    'inspection_result',
    'inspection_finding',
    'incident'
  ));

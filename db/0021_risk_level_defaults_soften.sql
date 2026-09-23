-- 기본 판단 기준의 어감을 누그러뜨린다.
--
-- 0020 의 기본값은 상을 "사망·신체 일부 상실" 로 정의하고 허용 불가로 두었다. 그러면
-- 상으로 매기는 순간 작업을 못 하게 되니 아무도 상을 고르지 않는다 — 평가가 위험을
-- 낮춰 적는 쪽으로 기운다. 상도 감소대책을 적용하면 허용하도록 두고, 정의는 결과의
-- 무게로만 구분한다.

CREATE OR REPLACE FUNCTION risk_level_defaults()
RETURNS TABLE (ord int, level text, label text, description text, acceptance risk_acceptance)
LANGUAGE sql IMMUTABLE AS $$
  VALUES
    (1, 'HIGH', '상', '중상이나 장기 치료가 필요한 재해로 이어질 수 있음', 'AFTER_REDUCTION'::risk_acceptance),
    (2, 'MID',  '중', '병원 치료가 필요한 부상으로 이어질 수 있음',        'AFTER_REDUCTION'::risk_acceptance),
    (3, 'LOW',  '하', '응급처치로 끝나는 가벼운 부상에 그침',              'ACCEPTABLE'::risk_acceptance)
$$;

-- 회사가 손대지 않은(0020 기본값 그대로인) 행만 새 기본값으로 바꾼다.
UPDATE company_risk_levels l
   SET description = d.description, acceptance = d.acceptance
  FROM risk_level_defaults() d,
       (VALUES
         ('HIGH', '사망 또는 신체 일부를 잃을 수 있는 재해가 발생할 수 있음', 'NOT_ACCEPTABLE'::risk_acceptance),
         ('MID',  '치료가 필요한 부상이 발생할 수 있음',                   'AFTER_REDUCTION'::risk_acceptance),
         ('LOW',  '응급처치로 회복 가능한 경미한 부상에 그침',             'ACCEPTABLE'::risk_acceptance)
       ) AS old(level, description, acceptance)
 WHERE l.level = d.level
   AND l.level = old.level
   AND l.description = old.description
   AND l.acceptance = old.acceptance;

-- 위험성 수준 판단 기준을 글 한 덩어리에서 등급별 행으로.
--
-- 0013 은 기준을 `companies.risk_criteria` 글 하나로 두었다. 사람이 읽기엔 됐지만
-- 화면이 "상은 무엇이고 허용되는가" 를 알 수 없어, 수준 단추 옆에 해당 등급의
-- 정의를 붙이거나 허용 여부를 등급에서 끌어오는 일을 할 수 없었다. 등급마다
-- 정의와 허용 경계를 한 행으로 둔다.
--
--   company_risk_levels              원본 — 회사당 상·중·하 세 행, 회사정보에서 수정
--   risk_assessments.criteria_snapshot  사본 — 평가 생성 시 세 행을 jsonb 배열로 복사
--
-- 사본을 두는 이유는 0013 과 같다. 회사가 기준을 바꿔도 이미 승인된 평가는 그때의
-- 기준으로 남아야 한다. 사본도 같은 모양(등급별)이어야 옛 평가와 새 평가를 한
-- 가지 방식으로 보여 줄 수 있다.

-- 허용 경계는 셋이다. "중은 감소대책을 적용한 뒤 허용" 처럼 조건부 허용이 실제
-- 기준표에 흔해서, 참/거짓으로는 담기지 않는다.
CREATE TYPE risk_acceptance AS ENUM ('ACCEPTABLE', 'AFTER_REDUCTION', 'NOT_ACCEPTABLE');

CREATE TABLE company_risk_levels (
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- 등급 수는 risk_assessment_items 의 CHECK 와 같은 셋으로 고정이다 (0013).
  level       text NOT NULL CHECK (level IN ('HIGH', 'MID', 'LOW')),
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 500),
  acceptance  risk_acceptance NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, level)
);

CREATE TRIGGER company_risk_levels_touch_updated_at
  BEFORE UPDATE ON company_risk_levels
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- 기본 기준. 새 회사의 출발점이고, 옛 글에서 등급 줄을 못 찾았을 때의 대체값이다.
CREATE FUNCTION risk_level_defaults()
RETURNS TABLE (ord int, level text, label text, description text, acceptance risk_acceptance)
LANGUAGE sql IMMUTABLE AS $$
  VALUES
    (1, 'HIGH', '상', '사망 또는 신체 일부를 잃을 수 있는 재해가 발생할 수 있음', 'NOT_ACCEPTABLE'::risk_acceptance),
    (2, 'MID',  '중', '치료가 필요한 부상이 발생할 수 있음',                   'AFTER_REDUCTION'::risk_acceptance),
    (3, 'LOW',  '하', '응급처치로 회복 가능한 경미한 부상에 그침',             'ACCEPTABLE'::risk_acceptance)
$$;

-- 회사가 생기면 기본 세 행을 같이 만든다. 앱의 가입 흐름뿐 아니라 운영자 스크립트·
-- 테스트가 회사를 만들어도 기준 없는 회사가 생기지 않게 DB 에서 건다.
CREATE FUNCTION seed_company_risk_levels() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO company_risk_levels (company_id, level, description, acceptance)
  SELECT NEW.id, d.level, d.description, d.acceptance FROM risk_level_defaults() d;
  RETURN NEW;
END
$$;

CREATE TRIGGER companies_seed_risk_levels
  AFTER INSERT ON companies
  FOR EACH ROW EXECUTE FUNCTION seed_company_risk_levels();

-- 옛 글을 등급별 배열로. 0013 의 기본 모양("상: …" 줄)을 따른 글이면 그 줄의 정의를
-- 살리고, 못 찾은 등급은 기본값을 쓴다. 허용 경계는 자유 문장이라 기계로 읽지 않고
-- 기본값을 둔다. 다르게 적어 둔 회사는 회사정보에서 한 번 고치면 된다.
CREATE FUNCTION pg_temp.criteria_from_text(t text) RETURNS jsonb
LANGUAGE sql AS $$
  SELECT jsonb_agg(
           jsonb_build_object(
             'level', d.level,
             'description', coalesce(
               (regexp_match(coalesce(t, ''),
                 '(?n)^[ \t]*' || d.label || '[ \t]*:[ \t]*(.*[^ \t\r])[ \t\r]*$'))[1],
               d.description),
             'acceptance', d.acceptance)
           ORDER BY d.ord)
    FROM risk_level_defaults() d
$$;

INSERT INTO company_risk_levels (company_id, level, description, acceptance)
SELECT c.id, e->>'level', left(e->>'description', 500), (e->>'acceptance')::risk_acceptance
  FROM companies c,
       jsonb_array_elements(pg_temp.criteria_from_text(c.risk_criteria)) e;

ALTER TABLE companies DROP COLUMN risk_criteria;

ALTER TABLE risk_assessments
  ALTER COLUMN criteria_snapshot TYPE jsonb
  USING pg_temp.criteria_from_text(criteria_snapshot);

ALTER TABLE risk_assessments
  ADD CONSTRAINT risk_assessments_criteria_snapshot_levels
  CHECK (jsonb_typeof(criteria_snapshot) = 'array'
         AND jsonb_array_length(criteria_snapshot) = 3);

-- 발급 사본에는 평가 행이 통째로 들어 있어 기준 글도 같이 박혀 있다. 화면이 한
-- 모양만 읽도록 같은 변환을 거친다.
UPDATE work_order_snapshots
   SET payload = jsonb_set(payload, '{criteria_snapshot}',
                           pg_temp.criteria_from_text(payload->>'criteria_snapshot'))
 WHERE snapshot_kind = 'RISK_ASSESSMENT'
   AND jsonb_typeof(payload->'criteria_snapshot') = 'string';

-- 지시서 초안에 싣던 기준 글도 걷는다. 이제 화면은 회사 기준을 따로 받고, 서버는
-- 초안의 값을 쓴 적이 없다. 정리일 뿐이라 수정 시각을 건드리지 않는다.
ALTER TABLE work_orders DISABLE TRIGGER work_orders_touch_updated_at;
UPDATE work_orders SET draft_data = draft_data - 'criteria' WHERE draft_data ? 'criteria';
ALTER TABLE work_orders ENABLE TRIGGER work_orders_touch_updated_at;

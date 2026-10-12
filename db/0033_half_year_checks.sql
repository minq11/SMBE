-- 경영책임자 반기 점검 (중대재해처벌법 시행령 제4조 제2·4·7·8호, 제5조).
--
-- 반기마다 한 장: 유해·위험요인 개선, 관리감독자 업무 평가, 종사자 의견 청취,
-- 대응 매뉴얼 점검, 법령 이행(방침·예산·선임)을 우리 기록으로 미리 채우고
-- 대표자가 확인·확정한다. 확정하면 못 고치고, 그때 본 숫자(facts)가 그대로 남는다 —
-- 판례가 "형식적 외관" 을 미이행으로 보므로 무엇을 보고 서명했는지가 중요하다.
--
-- 0022 의 assessment_reviews(위험성평가 화면의 반기 서명, 2호만)는 이 표로 합친다.
CREATE TABLE company_half_year_checks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  year            int  NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  half            int  NOT NULL CHECK (half IN (1, 2)),
  status          text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'CONFIRMED')),
  -- 확정 시점의 숫자. 작성 중에는 화면이 매번 새로 센다.
  facts           jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- 줄마다 대표자가 적은 것 (조치 계획·관리감독자 평가·점검 확인).
  notes           jsonb NOT NULL DEFAULT '{}'::jsonb,
  representative  text NOT NULL DEFAULT '' CHECK (char_length(representative) <= 100),
  confirmed_on    date,
  confirmed_by    uuid REFERENCES users(id),
  -- 반기 마지막 달 알림을 보낸 때. 한 반기에 한 통.
  reminded_at     timestamptz,
  updated_by      uuid NOT NULL REFERENCES users(id),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, year, half),
  CHECK (status <> 'CONFIRMED' OR (confirmed_on IS NOT NULL AND confirmed_by IS NOT NULL))
);

-- 예전 서명을 옮긴다 (반기당 마지막 서명). 2호 숫자만 있던 기록이라 facts.hazard 에 둔다.
INSERT INTO company_half_year_checks
  (company_id, year, half, status, facts, notes, representative, confirmed_on, confirmed_by, updated_by, updated_at)
SELECT DISTINCT ON (r.company_id, r.period_year, r.period_half)
       r.company_id, r.period_year, r.period_half, 'CONFIRMED',
       jsonb_build_object('hazard', r.stats),
       CASE WHEN r.note IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('hazard', r.note) END,
       u.display_name, (r.reviewed_at AT TIME ZONE 'Asia/Seoul')::date, r.reviewed_by,
       r.reviewed_by, r.reviewed_at
  FROM assessment_reviews r JOIN users u ON u.id = r.reviewed_by
 ORDER BY r.company_id, r.period_year, r.period_half, r.reviewed_at DESC;

DROP TABLE assessment_reviews;

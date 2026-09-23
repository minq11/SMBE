-- 위험성평가 법정 기록의 빈칸 넷.
--
--   고시 제9조   실시규정 — 회사가 목적·방법·시기·역할·참여·공유·기록을 정해 둔 글.
--   3단계 판단법 표준 양식 — 유해·위험요인 → 현재 안전조치 → 위험성 → 개선대책.
--               "지금 뭘 하고 있는가" 칸이 없어 감독관이 보면 빈칸이었다.
--   고시 제13조  감소대책을 실행했는데도 허용 수준이 아니면 추가 대책. 조치 후
--               허용 불가로 적을 때 추가 대책을 같이 적고, 항목은 계속 "조치 필요".
--   중처법 시행령 제4조 제3호  경영책임자가 반기 1회 이상 확인·개선 이행을 점검.
--               위험성평가 결과를 보고받으면 그 점검으로 본다 — 그 보고·확인의 기록.
--   고시 제6조   근로자 참여 — 위험요인을 찾을 때 근로자가 말한 것을 평가에 남긴다.

ALTER TABLE risk_assessment_items
  ADD COLUMN current_control text
    CHECK (current_control IS NULL OR char_length(current_control) <= 1000),
  ADD COLUMN follow_up_measure text
    CHECK (follow_up_measure IS NULL OR char_length(follow_up_measure) <= 1000);

ALTER TABLE risk_assessments
  ADD COLUMN worker_opinion text
    CHECK (worker_opinion IS NULL OR char_length(worker_opinion) <= 2000);

-- 실시규정. 새 회사는 이 기본 문안으로 시작하고 회사정보에서 고친다. 기존 회사도
-- 빈칸보다 기본 문안이 낫다 — 감독이 오면 "없다" 보다 "이렇게 정했다" 가 답이다.
ALTER TABLE companies
  ADD COLUMN risk_assessment_policy text NOT NULL DEFAULT
'1. 목적: 우리 회사 작업의 위험을 찾아 줄이고, 그 기록을 남긴다.
2. 방법: 위험성 수준 3단계 판단법(상·중·하). 판단 기준과 허용 여부는 회사정보 > 위험성 판단 기준을 따른다.
3. 시기: 최초평가는 사업 개시 후 1개월 안에 착수한다. 정기평가는 매년 1회. 설비·물질·공정·인원이 바뀌거나 사고·아차사고가 난 뒤에는 수시평가. 상시평가는 월 1회 위험요인 점검, 매주 안전회의 공유, 매일 작업 전 TBM.
4. 역할: 사업주(관리자)가 실시를 총괄하고 결과를 승인한다. 반기 1회 이행을 점검하고 서명한다.
5. 근로자 참여: 위험요인을 찾을 때와 판단 기준을 정할 때 해당 작업 근로자가 참여한다. 근로자 의견은 평가에 적는다.
6. 공유: 결과는 작업지시서와 TBM 으로 근로자에게 알린다.
7. 기록: 평가와 조치 기록은 3년 보관한다.'
    CHECK (char_length(risk_assessment_policy) BETWEEN 1 AND 4000);

CREATE TABLE assessment_reviews (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period_year  int  NOT NULL,
  period_half  int  NOT NULL CHECK (period_half IN (1, 2)),
  reviewed_by  uuid NOT NULL REFERENCES users(id),
  reviewed_at  timestamptz NOT NULL DEFAULT now(),
  -- 점검 시점의 숫자(평가·조치 완료·미조치·만료 표준서). 나중에 숫자가 바뀌어도
  -- "그때 무엇을 보고 서명했나" 가 남는다.
  stats        jsonb NOT NULL,
  note         text CHECK (note IS NULL OR char_length(note) <= 2000)
);
CREATE INDEX assessment_reviews_company_period_idx
  ON assessment_reviews (company_id, period_year DESC, period_half DESC, reviewed_at DESC);

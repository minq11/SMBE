-- 사후 입력 · 수정 이력 · 주간 안전점검 회의.
-- 기존 점검 행은 건드리지 않고 컬럼만 덧붙인다 (현장 입력 = 본인 입력으로 채운다).

-- 1. 사후 입력 -------------------------------------------------------------
-- inspector_id 는 "누구의 점검인가", recorded_by 는 "누가 실제로 타이핑했는가".
-- 관리자가 작업자 대신 넣으면 두 값이 갈라지고, 그 사실이 화면에 남는다.
-- submitted_at 은 저장 시각 그대로 두고 과거 시각으로 위조하지 않는다.
ALTER TABLE inspections
  ADD COLUMN recorded_by uuid REFERENCES users(id),
  ADD COLUMN recorded_by_name text,
  ADD COLUMN backfilled boolean NOT NULL DEFAULT false;

UPDATE inspections SET recorded_by = inspector_id, recorded_by_name = inspector_name;

ALTER TABLE inspections
  ALTER COLUMN recorded_by SET NOT NULL,
  ALTER COLUMN recorded_by_name SET NOT NULL,
  -- 사후 입력은 웹에서만 한다. 현장 경로(QR·링크)로 들어온 기록을 대리 입력으로 둔갑시키지 않는다.
  ADD CONSTRAINT inspections_backfill_is_web CHECK (NOT backfilled OR entry_path = 'WEB');

-- 2. 수정 이력 -------------------------------------------------------------
-- 점검 결과는 수정할 수 있지만 원본이 사라지면 증빙이 아니다. 수정 전·후를
-- 통째로 남겨 "무엇이 언제 누구에 의해 어떻게 바뀌었는가"에 답한다.
CREATE TABLE inspection_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES inspections(id),
  revised_by uuid NOT NULL REFERENCES users(id),
  revised_by_name text NOT NULL,
  revised_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  reason text NOT NULL DEFAULT '',
  before_json jsonb NOT NULL,
  after_json jsonb NOT NULL
);
CREATE INDEX inspection_revisions_inspection_idx
  ON inspection_revisions(inspection_id, revised_at DESC);

-- 3. 주간 안전점검 회의 ----------------------------------------------------
-- 상시평가의 "매주 논의·공유·이행점검" 요건을 담는다. 회사당 주 1건.
-- week_start 는 한국시간 기준 그 주의 월요일.
CREATE TABLE safety_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  week_start date NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','COMPLETED')),
  discussion text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_by uuid REFERENCES users(id),
  completed_at timestamptz,
  UNIQUE (company_id, week_start),
  CHECK (status <> 'COMPLETED' OR (completed_by IS NOT NULL AND completed_at IS NOT NULL))
);
CREATE INDEX safety_meetings_company_week_idx
  ON safety_meetings(company_id, week_start DESC);

CREATE TABLE safety_meeting_attendees (
  meeting_id uuid NOT NULL REFERENCES safety_meetings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  snapshot_display_name text NOT NULL,
  PRIMARY KEY (meeting_id, user_id)
);

-- 수집 항목. source_id 에 FK 를 걸지 않는 이유: 부적합·사고·감소대책이 서로
-- 다른 테이블이고 안전사고는 아직 테이블이 없다. summary 는 수집 시점의 사본이라
-- 원본이 나중에 바뀌어도 그 주에 무엇을 논의했는지가 보존된다.
-- 회의에서 확인(reviewed)해도 원본 부적합은 종결되지 않는다 — 종결은 조치 화면의 몫이다.
CREATE TABLE safety_meeting_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES safety_meetings(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('INSPECTION_FINDING','INCIDENT','RISK_MEASURE')),
  source_id uuid NOT NULL,
  summary text NOT NULL,
  reviewed boolean NOT NULL DEFAULT false,
  note text NOT NULL DEFAULT '',
  UNIQUE (meeting_id, source_type, source_id)
);

-- 안전사고 (docs/incident-plan.md, 사장님 결정 2026-09-23)
--
-- 사고는 "기록" 이 아니라 "사고 뒤 기한 안에 해야 할 일 목록" 이다. 등급(아차·경미·
-- 보고 대상·중대재해)이 입력에서 정해지고, 등급에 맞는 할 일(incident_duties)이
-- 기한과 함께 자동으로 생긴다. 할 일과 재발방지대책이 다 끝나야 종결(CLOSED).
--
--   incidents          사고 한 건. 지시서를 연결하면 이름을 사본으로 남긴다 — 지시서가
--                      바뀌거나 취소돼도 사고 기록은 그대로다.
--   incident_victims   다친 사람. 구성원만 (외부인 비허용).
--   incident_actions   재발방지대책 — 내용·담당·기한·완료.
--   incident_duties    법이 요구하는 할 일 — 종류·기한·완료·증빙 메모.
--
-- 삭제는 없다 (산안법 57조 1항 은폐 금지). 고치면 감사 로그. 3년 보존
-- (시행규칙 72조) 은 retention_until 로 적어 둔다.

CREATE TABLE incidents (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES companies(id),
  kind                text NOT NULL CHECK (kind IN ('NEAR_MISS', 'INJURY')),
  occurred_at         timestamptz NOT NULL,
  location_id         uuid REFERENCES work_locations(id),
  location            text NOT NULL DEFAULT '',
  location_detail     text NOT NULL DEFAULT '',
  work_order_id       uuid REFERENCES work_orders(id),
  work_order_name     text,
  occurrence_type     text NOT NULL CHECK (occurrence_type IN (
    'FALL', 'SLIP', 'CRUSH', 'STRIKE', 'HIT_BY', 'CAUGHT', 'CUT',
    'ELECTRIC', 'FIRE_EXPLOSION', 'TEMPERATURE', 'CHEMICAL', 'ASPHYXIA', 'OTHER'
  )),
  description         text NOT NULL DEFAULT '',
  immediate_action    text NOT NULL DEFAULT '',
  work_stopped        boolean NOT NULL DEFAULT false,
  evacuated           boolean NOT NULL DEFAULT false,
  cause               text NOT NULL DEFAULT '',
  -- 입력에서 서버가 정하는 등급. 아차사고 / 경미 / 보고 대상(사망 또는 휴업 3일↑) /
  -- 중대재해(산안법 시행규칙 3조).
  grade               text NOT NULL CHECK (grade IN ('NEAR_MISS', 'MINOR', 'REPORTABLE', 'SERIOUS')),
  -- 중처법 중대산업재해 (5인 이상 회사만).
  serious_under_scpa  boolean NOT NULL DEFAULT false,
  status              text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  reported_by         uuid NOT NULL REFERENCES users(id),
  reported_via        text NOT NULL DEFAULT 'MANAGER' CHECK (reported_via IN ('MANAGER', 'WORKER')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid NOT NULL REFERENCES users(id),
  closed_at           timestamptz,
  closed_by           uuid REFERENCES users(id),
  retention_until     date NOT NULL,
  CHECK (kind = 'INJURY' OR grade = 'NEAR_MISS'),
  CHECK ((status = 'CLOSED') = (closed_at IS NOT NULL))
);

CREATE INDEX incidents_company_idx ON incidents (company_id, occurred_at DESC);
CREATE INDEX incidents_work_order_idx ON incidents (work_order_id) WHERE work_order_id IS NOT NULL;

CREATE TABLE incident_victims (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id          uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  user_id              uuid NOT NULL REFERENCES users(id),
  name                 text NOT NULL,
  body_part            text NOT NULL DEFAULT '',
  injury               text NOT NULL DEFAULT '',
  expected_leave_days  int NOT NULL DEFAULT 0 CHECK (expected_leave_days >= 0),
  fatal                boolean NOT NULL DEFAULT false,
  treatment_months     int NOT NULL DEFAULT 0 CHECK (treatment_months >= 0),
  hospital             text NOT NULL DEFAULT '',
  sort_no              int NOT NULL DEFAULT 0
);
CREATE INDEX incident_victims_incident_idx ON incident_victims (incident_id, sort_no);

CREATE TABLE incident_actions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id          uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  measure              text NOT NULL,
  responsible_user_id  uuid REFERENCES users(id),
  due_on               date,
  done_at              timestamptz,
  done_by              uuid REFERENCES users(id),
  note                 text NOT NULL DEFAULT '',
  sort_no              int NOT NULL DEFAULT 0
);
CREATE INDEX incident_actions_incident_idx ON incident_actions (incident_id, sort_no);

CREATE TABLE incident_duties (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id  uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN (
    'STOP_WORK', 'REPORT_MINISTRY', 'SURVEY_FORM', 'RISK_ASSESSMENT',
    'PREVENTION', 'SHARE', 'CEO_CONFIRM'
  )),
  due_on       date,
  done_at      timestamptz,
  done_by      uuid REFERENCES users(id),
  note         text NOT NULL DEFAULT '',
  sort_no      int NOT NULL DEFAULT 0,
  UNIQUE (incident_id, kind)
);

-- 기한이 다가온 할 일을 홈·목록에서 센다.
CREATE INDEX incident_duties_open_idx ON incident_duties (incident_id, due_on)
  WHERE done_at IS NULL;

-- 첨부 대상 incident 는 0008 부터 예약돼 있었다 (사진, 유료).

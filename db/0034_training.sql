-- 안전보건교육 기록 (산업안전보건법 제29조, 시행규칙 별표 4·5).
--
-- 교육 한 번 = 한 행, 참석자는 따로. 종류는 넷: 채용 시·정기·작업내용 변경 시·특별.
-- "누가 언제 무슨 교육이 필요한지" 는 저장하지 않고 인원·TBM·PTW 기록에서 그때그때
-- 센다 (server/training.ts). 시간은 0.5 단위.
CREATE TABLE training_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('HIRE', 'REGULAR', 'CHANGE', 'SPECIAL')),
  held_on     date NOT NULL,
  hours       numeric(4,1) NOT NULL CHECK (hours > 0 AND hours <= 24),
  topic       text NOT NULL CHECK (char_length(btrim(topic)) BETWEEN 1 AND 200),
  instructor  text NOT NULL DEFAULT '' CHECK (char_length(instructor) <= 100),
  note        text NOT NULL DEFAULT '' CHECK (char_length(note) <= 1000),
  created_by  uuid NOT NULL REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX training_sessions_company_idx ON training_sessions (company_id, held_on DESC);

CREATE TABLE training_attendees (
  session_id            uuid NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  user_id               uuid NOT NULL REFERENCES users(id),
  snapshot_display_name text NOT NULL,
  PRIMARY KEY (session_id, user_id)
);
CREATE INDEX training_attendees_user_idx ON training_attendees (user_id);

-- TBM 1회를 정기교육 몇 분으로 산입할지. 0 이면 산입하지 않는다 (회사가 정한다).
ALTER TABLE companies
  ADD COLUMN tbm_training_minutes int NOT NULL DEFAULT 0
  CHECK (tbm_training_minutes IN (0, 10, 15, 20, 30));

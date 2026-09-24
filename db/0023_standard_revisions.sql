-- 표준서 개정본 (사장님 결정 2026-09-24)
--
-- 승인된 표준서는 고치지 않는다. 고치려면 개정본을 새로 따서(모든 내용 복사) 그것을
-- 고치고 승인받는다. 표준서에 연결된 일(지시서·위험성평가)은 어느 개정본이었는지를
-- 함께 적어, "그날 그 작업의 표준서" 로 되돌아갈 수 있다.
--
--   standard_revisions   개정본 — 표준서당 여러 판. DRAFT(작성 중) 은 한 번에 하나.
--   standard_steps / standard_checklist_items   개정본에 달린다 (revision_id).
--   standards.current_revision_id   승인된 현재 판. name·ptw_required 는 그 판의 거울.
--   risk_assessments.standard_revision_id / work_orders.standard_revision_id
--                        그때의 판.
--
-- 0006 이 버전 테이블을 없앴던 이유("표준서는 법정 문서가 아니다")는 반만 맞았다.
-- 사고가 나면 "그때 표준서에 뭐라고 적혀 있었나" 를 묻는다.

CREATE TABLE standard_revisions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  standard_id   uuid NOT NULL REFERENCES standards(id) ON DELETE CASCADE,
  revision_no   int  NOT NULL CHECK (revision_no >= 1),
  status        text NOT NULL CHECK (status IN ('DRAFT', 'APPROVED', 'SUPERSEDED')),
  name          text NOT NULL,
  ptw_required  boolean NOT NULL DEFAULT false,
  -- 무엇을 왜 바꿨나. 승인할 때 적는다.
  change_note   text CHECK (change_note IS NULL OR char_length(change_note) <= 1000),
  created_by    uuid NOT NULL REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  approved_by   uuid REFERENCES users(id),
  approved_at   timestamptz,
  UNIQUE (standard_id, revision_no)
);
CREATE UNIQUE INDEX standard_revisions_one_draft_idx
  ON standard_revisions (standard_id) WHERE status = 'DRAFT';
CREATE INDEX standard_revisions_standard_idx
  ON standard_revisions (standard_id, revision_no DESC);
CREATE TRIGGER standard_revisions_touch_updated_at
  BEFORE UPDATE ON standard_revisions
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- 기존 표준서마다 1판. 지금 내용이 곧 1판이고, 만든 사람이 승인한 것으로 본다.
INSERT INTO standard_revisions
  (standard_id, revision_no, status, name, ptw_required, created_by, created_at,
   updated_at, approved_by, approved_at)
SELECT id, 1, 'APPROVED', name, ptw_required, created_by, created_at,
       updated_at, created_by, created_at
  FROM standards;

ALTER TABLE standards
  ADD COLUMN current_revision_id uuid REFERENCES standard_revisions(id);
UPDATE standards s
   SET current_revision_id = r.id
  FROM standard_revisions r
 WHERE r.standard_id = s.id AND r.revision_no = 1;

ALTER TABLE standard_steps
  ADD COLUMN revision_id uuid REFERENCES standard_revisions(id) ON DELETE CASCADE;
UPDATE standard_steps st
   SET revision_id = s.current_revision_id
  FROM standards s
 WHERE s.id = st.standard_id;
ALTER TABLE standard_steps ALTER COLUMN revision_id SET NOT NULL;
ALTER TABLE standard_steps DROP CONSTRAINT IF EXISTS standard_steps_standard_id_order_no_key;
DROP INDEX IF EXISTS standard_steps_standard_order_uniq;
CREATE UNIQUE INDEX standard_steps_revision_order_idx
  ON standard_steps (revision_id, order_no);

ALTER TABLE standard_checklist_items
  ADD COLUMN revision_id uuid REFERENCES standard_revisions(id) ON DELETE CASCADE;
UPDATE standard_checklist_items ci
   SET revision_id = s.current_revision_id
  FROM standards s
 WHERE s.id = ci.standard_id;
ALTER TABLE standard_checklist_items ALTER COLUMN revision_id SET NOT NULL;
ALTER TABLE standard_checklist_items
  DROP CONSTRAINT IF EXISTS standard_checklist_items_standard_id_category_order_no_key;
DROP INDEX IF EXISTS standard_checklist_items_standard_cat_order_uniq;
CREATE UNIQUE INDEX standard_checklist_items_revision_cat_order_idx
  ON standard_checklist_items (revision_id, category, order_no);

-- 그때의 판. 옛 기록은 1판밖에 없었으니 1판.
ALTER TABLE risk_assessments
  ADD COLUMN standard_revision_id uuid REFERENCES standard_revisions(id);
UPDATE risk_assessments ra
   SET standard_revision_id = s.current_revision_id
  FROM standards s
 WHERE s.id = ra.standard_id;

ALTER TABLE work_orders
  ADD COLUMN standard_revision_id uuid REFERENCES standard_revisions(id);
UPDATE work_orders w
   SET standard_revision_id = s.current_revision_id
  FROM standards s
 WHERE s.id = w.standard_id;
UPDATE work_order_snapshots
   SET payload = payload || '{"standard_revision_no": 1}'::jsonb
 WHERE snapshot_kind = 'STANDARD_META' AND NOT (payload ? 'standard_revision_no');

-- 개정본을 따면 단계 사진도 따라간다. 같은 파일을 두 단계가 가리키므로 storage_key
-- 는 더 이상 하나가 아니다. 지울 때는 마지막 참조일 때만 파일을 지운다 (attachments.ts).
ALTER TABLE attachments DROP CONSTRAINT IF EXISTS attachments_storage_key_key;
CREATE INDEX attachments_storage_key_idx ON attachments (storage_key);

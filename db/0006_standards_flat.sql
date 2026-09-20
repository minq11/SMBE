-- 표준서 모델 재정의: mutable single document + 위험성평가 회차 이력
--
-- 배경:
--   - 산안법상 표준서 자체는 필수 문서 아님. 무거운 버전 관리 요건 없음.
--   - 위험성평가만 법정 문서·3년 보존 대상. 최초/정기/수시/상시 회차별로 독립 이력 필요.
--
-- 변경:
--   - standard_versions 테이블 폐기
--   - standard_steps · standard_checklist_items 를 standards 에 직접 연결
--   - standards 에 ptw_required 컬럼 신설 (버전에서 옮겨옴)
--   - risk_assessments 를 standard_version_id 대신 standard_id 로 연결
--   - 표준서 편집 이력은 audit_logs 로 소명 (별도 버전 테이블 없음)

-- 1) 새 컬럼·인덱스 준비 (아직 NOT NULL 아님)
ALTER TABLE standards         ADD COLUMN ptw_required boolean NOT NULL DEFAULT false;
ALTER TABLE standard_steps    ADD COLUMN standard_id uuid REFERENCES standards(id) ON DELETE CASCADE;
ALTER TABLE standard_checklist_items
                              ADD COLUMN standard_id uuid REFERENCES standards(id) ON DELETE CASCADE;
ALTER TABLE risk_assessments  ADD COLUMN standard_id uuid REFERENCES standards(id);

-- 2) 백필: 기존 데이터에서 standards ← standard_versions 를 뛰어넘어 standards 직접 참조로 이전
UPDATE standards s
   SET ptw_required = COALESCE(sv.ptw_required, false)
  FROM standard_versions sv
 WHERE sv.id = s.current_version_id;

UPDATE standard_steps ss
   SET standard_id = sv.standard_id
  FROM standard_versions sv
 WHERE ss.version_id = sv.id;

UPDATE standard_checklist_items sci
   SET standard_id = sv.standard_id
  FROM standard_versions sv
 WHERE sci.version_id = sv.id;

UPDATE risk_assessments ra
   SET standard_id = sv.standard_id
  FROM standard_versions sv
 WHERE ra.standard_version_id = sv.id;

-- 3) 무결성 승격
ALTER TABLE standard_steps           ALTER COLUMN standard_id SET NOT NULL;
ALTER TABLE standard_checklist_items ALTER COLUMN standard_id SET NOT NULL;
-- risk_assessments.standard_id 는 NULL 허용 (NULL = 간이평가/예외 경로)

-- 4) 구 인덱스/제약/컬럼 정리
DROP INDEX IF EXISTS risk_assessments_standard_version_idx;

ALTER TABLE risk_assessments  DROP COLUMN standard_version_id;

ALTER TABLE standard_steps    DROP CONSTRAINT IF EXISTS standard_steps_version_id_order_no_key;
ALTER TABLE standard_steps    DROP COLUMN version_id;

ALTER TABLE standard_checklist_items
                              DROP CONSTRAINT IF EXISTS standard_checklist_items_version_id_category_order_no_key;
ALTER TABLE standard_checklist_items
                              DROP COLUMN version_id;

ALTER TABLE standards         DROP CONSTRAINT IF EXISTS standards_current_version_fk;
ALTER TABLE standards         DROP COLUMN current_version_id;

DROP TABLE IF EXISTS standard_versions;

-- 5) 새 인덱스·제약
CREATE UNIQUE INDEX standard_steps_standard_order_uniq
  ON standard_steps (standard_id, order_no);

CREATE UNIQUE INDEX standard_checklist_items_standard_cat_order_uniq
  ON standard_checklist_items (standard_id, category, order_no);

CREATE INDEX risk_assessments_standard_performed_idx
  ON risk_assessments (standard_id, performed_on DESC)
  WHERE status = 'APPROVED';

CREATE INDEX risk_assessments_standard_id_idx
  ON risk_assessments (standard_id)
  WHERE standard_id IS NOT NULL;

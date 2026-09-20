-- Standards module: 표준서 마스터 + 버전 + 단계 + 체크리스트
-- 위험성평가와 연결: 표준서 승인 = 표준서 버전 + 그 버전의 위험성평가가 모두 승인된 상태

CREATE TABLE standards (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES companies(id),
  name                  text NOT NULL,
  status                text NOT NULL DEFAULT 'DRAFT'
                          CHECK (status IN ('DRAFT','APPROVED','ARCHIVED')),
  current_version_id    uuid, -- 발효 중인 승인 버전. FK는 아래에서 지연 추가.
  created_by            uuid NOT NULL REFERENCES users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  archived_at           timestamptz,
  archived_by           uuid REFERENCES users(id),
  UNIQUE (id, company_id),
  CHECK (status <> 'ARCHIVED' OR (archived_at IS NOT NULL AND archived_by IS NOT NULL))
);

CREATE INDEX standards_company_status_idx ON standards(company_id, status);
CREATE TRIGGER standards_touch_updated_at
  BEFORE UPDATE ON standards FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE standard_versions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  standard_id         uuid NOT NULL REFERENCES standards(id) ON DELETE CASCADE,
  version_no          int  NOT NULL,
  status              text NOT NULL DEFAULT 'DRAFT'
                        CHECK (status IN ('DRAFT','PENDING','APPROVED','SUPERSEDED')),
  ptw_required        boolean NOT NULL DEFAULT false,
  risk_assessment_id  uuid, -- 이 버전용 승인된 위험성평가. NULL이면 아직 미연계.
  created_by          uuid NOT NULL REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  approved_by         uuid REFERENCES users(id),
  approved_at         timestamptz,
  self_approval       boolean NOT NULL DEFAULT false,
  UNIQUE (standard_id, version_no),
  CHECK (
    status <> 'APPROVED' OR
    (approved_by IS NOT NULL AND approved_at IS NOT NULL AND risk_assessment_id IS NOT NULL)
  )
);

CREATE INDEX standard_versions_standard_status_idx ON standard_versions(standard_id, status);

-- 표준서의 current_version_id는 실제 존재하는 승인 버전을 가리키도록 지연 FK
ALTER TABLE standards
  ADD CONSTRAINT standards_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES standard_versions(id);

CREATE TABLE standard_steps (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES standard_versions(id) ON DELETE CASCADE,
  order_no   int  NOT NULL,
  step_text  text NOT NULL,
  UNIQUE (version_id, order_no)
);

CREATE TABLE standard_checklist_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES standard_versions(id) ON DELETE CASCADE,
  category   text NOT NULL CHECK (category IN ('TBM','DURING_WORK')),
  order_no   int  NOT NULL,
  text       text NOT NULL,
  UNIQUE (version_id, category, order_no)
);

-- 위험성평가에 표준서 버전 연계 컬럼 추가
-- NULL이면 간이평가(예외 경로), NOT NULL이면 특정 표준서 버전 소속.
ALTER TABLE risk_assessments
  ADD COLUMN standard_version_id uuid REFERENCES standard_versions(id);

CREATE INDEX risk_assessments_standard_version_idx
  ON risk_assessments(standard_version_id)
  WHERE standard_version_id IS NOT NULL;

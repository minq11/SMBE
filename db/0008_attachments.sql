-- Generic attachments (S3-backed). 다목적 첨부 테이블.
-- 대상: 표준서 작업단계 · 위험요인 조치전/조치후 · 지시서 · 점검 부적합 · 사고 등.
-- storage_key 는 S3 오브젝트 키. company_id 접두사로 멀티테넌트 격리 안전판.
-- 업로드 흐름: PENDING 로 행 삽입 → presigned PUT URL 로 브라우저 업로드 →
-- confirmUpload 로 READY 승격. PENDING 인 채 방치된 행은 후속 배치로 정리.
CREATE TABLE attachments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES companies(id),
  target_type        text NOT NULL CHECK (target_type IN (
    'standard_step',
    'risk_item_before',
    'risk_item_after',
    'work_order',
    'inspection_finding',
    'incident'
  )),
  target_id          uuid NOT NULL,
  storage_key        text NOT NULL UNIQUE,
  original_filename  text NOT NULL,
  mime_type          text NOT NULL,
  size_bytes         bigint,
  width              int,
  height             int,
  status             text NOT NULL DEFAULT 'PENDING'
                       CHECK (status IN ('PENDING','READY','DELETED')),
  uploaded_by        uuid NOT NULL REFERENCES users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  ready_at           timestamptz,
  deleted_at         timestamptz,
  CHECK (status <> 'READY'   OR ready_at   IS NOT NULL),
  CHECK (status <> 'DELETED' OR deleted_at IS NOT NULL)
);

CREATE INDEX attachments_target_ready_idx
  ON attachments (company_id, target_type, target_id)
  WHERE status = 'READY';

CREATE INDEX attachments_pending_created_idx
  ON attachments (created_at)
  WHERE status = 'PENDING';

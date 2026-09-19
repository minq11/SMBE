-- Work orders phase 1: simple assessments, immutable issue snapshots and audit.
CREATE TABLE risk_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  is_simple boolean NOT NULL DEFAULT true,
  name text NOT NULL,
  assessment_kind text NOT NULL CHECK (assessment_kind IN ('FIRST','PERIODIC','AD_HOC','CONTINUOUS')),
  performed_on date NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('DRAFT','PENDING','APPROVED','REJECTED')),
  criteria_snapshot text NOT NULL,
  work_method_snapshot text NOT NULL,
  safety_info jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  retention_until date NOT NULL,
  UNIQUE (id, company_id),
  CHECK (status <> 'APPROVED' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE TABLE risk_assessment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES risk_assessments(id),
  order_no int NOT NULL,
  hazard text NOT NULL,
  initial_risk_level text NOT NULL CHECK (initial_risk_level IN ('HIGH','MID','LOW')),
  initial_allowable boolean NOT NULL,
  reduction_measure text NOT NULL,
  responsible_user_id uuid REFERENCES users(id),
  planned_completion_date date,
  actual_action text,
  actual_completion_date date,
  post_risk_level text CHECK (post_risk_level IN ('HIGH','MID','LOW')),
  post_allowable boolean,
  UNIQUE (assessment_id, order_no)
);
CREATE TABLE risk_assessment_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES risk_assessments(id),
  user_id uuid NOT NULL REFERENCES users(id),
  snapshot_display_name text NOT NULL,
  UNIQUE (assessment_id, user_id)
);
CREATE TABLE work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  name text NOT NULL,
  group_label text,
  risk_assessment_id uuid,
  work_period_start date,
  work_period_end date,
  work_start_time time,
  work_end_time time,
  location_free_text text,
  ptw_required boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ISSUE_PENDING','ISSUED','IN_PROGRESS','COMPLETED','CANCELED')),
  draft_data jsonb NOT NULL,
  revision int NOT NULL DEFAULT 1,
  issue_version int NOT NULL DEFAULT 0,
  issued_at timestamptz,
  self_approval_at_issue boolean NOT NULL DEFAULT false,
  cancel_reason text,
  canceled_at timestamptz,
  canceled_by uuid REFERENCES users(id),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (risk_assessment_id, company_id) REFERENCES risk_assessments(id, company_id),
  CHECK (status NOT IN ('ISSUED','IN_PROGRESS','COMPLETED') OR (
    issued_at IS NOT NULL AND risk_assessment_id IS NOT NULL
    AND work_period_start IS NOT NULL AND work_period_end >= work_period_start
    AND work_start_time IS NOT NULL AND work_end_time IS NOT NULL
    AND location_free_text IS NOT NULL AND issue_version > 0
  )),
  CHECK (status <> 'CANCELED' OR (length(trim(cancel_reason)) > 0 AND canceled_at IS NOT NULL AND canceled_by IS NOT NULL))
);
CREATE INDEX work_orders_company_date_idx ON work_orders(company_id, created_at DESC);
CREATE TRIGGER work_orders_touch_updated_at BEFORE UPDATE ON work_orders FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TABLE work_order_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES work_orders(id),
  user_id uuid NOT NULL REFERENCES users(id),
  snapshot_display_name text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PENDING_APPROVAL','UNASSIGNED')),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  unassigned_at timestamptz
);
CREATE UNIQUE INDEX work_order_assignments_active_idx ON work_order_assignments(work_order_id,user_id) WHERE status <> 'UNASSIGNED';
CREATE INDEX work_order_assignments_user_idx ON work_order_assignments(user_id,work_order_id);
CREATE TABLE work_order_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES work_orders(id),
  snapshot_kind text NOT NULL CHECK (snapshot_kind IN ('RISK_ASSESSMENT','WORK_METHOD','STANDARD_META')),
  payload jsonb NOT NULL,
  taken_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_order_id, snapshot_kind)
);
CREATE TABLE work_order_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES work_orders(id),
  category text NOT NULL CHECK (category IN ('TBM','DURING_WORK')),
  order_no int NOT NULL,
  text text NOT NULL,
  origin text NOT NULL DEFAULT 'SIMPLE_ASSESSMENT' CHECK (origin IN ('TEMPLATE','STANDARD','FIELD_ADDED','SIMPLE_ASSESSMENT')),
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_order_id, category, order_no)
);
CREATE TABLE work_order_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES work_orders(id),
  issue_version int NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id),
  link_channel text NOT NULL DEFAULT 'EMAIL',
  link_target text,
  status text NOT NULL DEFAULT 'RETRY_PENDING' CHECK (status IN ('RETRY_PENDING','SENDING','SENT','FAILED','SKIPPED')),
  attempt_count int NOT NULL DEFAULT 0,
  attempted_at timestamptz,
  sent_at timestamptz,
  failure_reason text,
  UNIQUE (work_order_id, issue_version, user_id)
);
CREATE TABLE audit_logs (
  id bigserial PRIMARY KEY,
  company_id uuid REFERENCES companies(id),
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  path text NOT NULL DEFAULT 'WEB' CHECK (path IN ('WEB','QR','LINK','API','BATCH')),
  before_json jsonb,
  after_json jsonb,
  is_self_approval boolean NOT NULL DEFAULT false,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_company_at_idx ON audit_logs(company_id,at DESC);
CREATE INDEX audit_logs_target_idx ON audit_logs(target_type,target_id,at DESC);

-- Additive only: preserve issued orders and create their daily session snapshots.
ALTER TABLE work_orders ADD CONSTRAINT work_orders_id_company_unique UNIQUE(id,company_id);
CREATE TABLE work_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  work_order_id uuid NOT NULL,
  work_date date NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  expected_assignees jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(work_order_id,company_id) REFERENCES work_orders(id,company_id),
  UNIQUE(work_order_id,work_date),
  CHECK(ends_at > starts_at AND ends_at <= starts_at + interval '16 hours')
);
CREATE INDEX work_sessions_company_date_idx ON work_sessions(company_id,work_date DESC);
CREATE TABLE inspections (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES work_sessions(id),
  inspector_id uuid NOT NULL REFERENCES users(id),
  inspector_name text NOT NULL,
  inspector_role text NOT NULL,
  category text NOT NULL CHECK(category IN ('TBM','DURING_WORK')),
  entry_path text NOT NULL CHECK(entry_path IN ('WEB','QR','LINK')),
  confirmed boolean NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK(category <> 'TBM' OR confirmed)
);
CREATE UNIQUE INDEX inspections_tbm_once_idx ON inspections(session_id,inspector_id) WHERE category='TBM';
CREATE INDEX inspections_session_idx ON inspections(session_id,submitted_at DESC);
CREATE TABLE inspection_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES inspections(id),
  checklist_item_id uuid NOT NULL REFERENCES work_order_checklist_items(id),
  item_text text NOT NULL,
  result text NOT NULL CHECK(result IN ('PASS','FAIL','NA')),
  comment text NOT NULL DEFAULT '',
  UNIQUE(inspection_id,checklist_item_id)
);
CREATE TABLE inspection_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id uuid NOT NULL UNIQUE REFERENCES inspection_results(id),
  assigned_manager_id uuid NOT NULL REFERENCES users(id),
  assigned_manager_name text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','RESOLVED')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  resolution text,
  resolved_by uuid REFERENCES users(id),
  resolved_at timestamptz,
  CHECK(status <> 'RESOLVED' OR (length(trim(resolution)) > 0 AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL))
);
CREATE INDEX inspection_findings_manager_open_idx ON inspection_findings(assigned_manager_id,created_at DESC) WHERE status='OPEN';

-- Called inside the issue transaction; idempotent for existing issued orders.
CREATE FUNCTION create_work_sessions(target_order uuid) RETURNS void LANGUAGE sql AS $$
  INSERT INTO work_sessions(company_id,work_order_id,work_date,starts_at,ends_at,expected_assignees)
  SELECT w.company_id,w.id,d.day::date,
    (d.day::date + w.work_start_time) AT TIME ZONE 'Asia/Seoul',
    (d.day::date + w.work_end_time + CASE WHEN w.work_end_time <= w.work_start_time THEN interval '1 day' ELSE interval '0 day' END) AT TIME ZONE 'Asia/Seoul',
    coalesce((SELECT jsonb_agg(jsonb_build_object('userId',a.user_id,'name',a.snapshot_display_name) ORDER BY a.assigned_at,a.id)
      FROM work_order_assignments a WHERE a.work_order_id=w.id AND a.status='ACTIVE'),'[]'::jsonb)
  FROM work_orders w CROSS JOIN LATERAL generate_series(w.work_period_start::timestamp,w.work_period_end::timestamp,interval '1 day') d(day)
  WHERE w.id=target_order AND w.issued_at IS NOT NULL
  ON CONFLICT(work_order_id,work_date) DO NOTHING;
$$;
SELECT create_work_sessions(id) FROM work_orders WHERE issued_at IS NOT NULL;

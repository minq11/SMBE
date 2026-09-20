CREATE TABLE work_permits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  work_order_id uuid NOT NULL UNIQUE REFERENCES work_orders(id),
  applicant_id uuid NOT NULL REFERENCES users(id),
  approver_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL CHECK (status IN ('PENDING','APPROVED','REJECTED','WITHDRAWN','INVALID')),
  revision integer NOT NULL DEFAULT 1,
  details jsonb NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  self_approval boolean NOT NULL DEFAULT false,
  rejection_reason text,
  notification_status text NOT NULL DEFAULT 'PENDING' CHECK(notification_status IN ('PENDING','SENT','FAILED','SKIPPED')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX work_permits_inbox ON work_permits(company_id,approver_id,status);
CREATE TABLE work_permit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permit_id uuid NOT NULL REFERENCES work_permits(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  action text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

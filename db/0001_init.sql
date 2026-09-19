-- Phase 1: 계정 · 회사 · 소속 · 장소 · 초대
-- Reference: docs/SMBE-schema-v5.5.md (§2, §3, §4-1)

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- Enum types ---------------------------------------------------------------

CREATE TYPE user_status AS ENUM ('ACTIVE', 'WITHDRAWN');

CREATE TYPE oauth_provider AS ENUM ('NAVER', 'GOOGLE', 'KAKAO');

CREATE TYPE employee_size_band AS ENUM (
  'UNDER_5',
  'FROM_5_TO_19',
  'FROM_20_TO_49',
  'FROM_50'
);

CREATE TYPE company_pro_state AS ENUM (
  'FREE',
  'PRO_VOLUNTARY',
  'PRO_MANDATORY'
);

CREATE TYPE company_member_role AS ENUM (
  'MANAGER_SUPERVISOR',
  'MANAGER_SAFETY',
  'WORKER'
);

CREATE TYPE company_member_status AS ENUM (
  'JOIN_PENDING',
  'ACTIVE',
  'RESIGNED'
);

CREATE TYPE company_join_via AS ENUM (
  'INVITE_LINK',
  'DIRECT_JOIN',
  'COMPANY_CREATE'
);

-- Helper: updated_at auto-touch --------------------------------------------

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- users --------------------------------------------------------------------

CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name   text NOT NULL,
  email          citext,
  phone          text,
  status         user_status NOT NULL DEFAULT 'ACTIVE',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- email은 NULL 허용(카카오 미동의 등)이므로 partial unique
CREATE UNIQUE INDEX users_email_unique_idx
  ON users (email)
  WHERE email IS NOT NULL;

CREATE TRIGGER users_touch_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- user_identities ----------------------------------------------------------

CREATE TABLE user_identities (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider          oauth_provider NOT NULL,
  provider_user_id  text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_user_id)
);

CREATE INDEX user_identities_user_id_idx ON user_identities (user_id);

-- companies ----------------------------------------------------------------

CREATE TABLE companies (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                          text NOT NULL,
  business_type                 text,
  business_start_date           date,
  company_code                  text NOT NULL UNIQUE,
  initial_employee_size_band    employee_size_band NOT NULL,
  current_employee_size_band    employee_size_band,
  active_headcount              int NOT NULL DEFAULT 0 CHECK (active_headcount >= 0),
  free_limit                    int NOT NULL DEFAULT 10 CHECK (free_limit >= 0),
  pro_state                     company_pro_state NOT NULL DEFAULT 'FREE',
  pro_started_at                timestamptz,
  pro_downgraded_at             timestamptz,
  pro_downgraded_by             uuid REFERENCES users(id) ON DELETE SET NULL,
  created_by                    uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  withdrawn_at                  timestamptz
);

CREATE INDEX companies_created_by_idx ON companies (created_by);

CREATE TRIGGER companies_touch_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- company_members ----------------------------------------------------------

CREATE TABLE company_members (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  company_id                uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  role                      company_member_role NOT NULL,
  status                    company_member_status NOT NULL,
  joined_via                company_join_via NOT NULL,
  joined_at                 timestamptz NOT NULL DEFAULT now(),
  left_at                   timestamptz,
  approved_by               uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at               timestamptz,
  snapshot_display_name     text NOT NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX company_members_company_left_idx ON company_members (company_id, left_at);
CREATE INDEX company_members_user_left_idx    ON company_members (user_id, left_at);

-- 1인 1회사: 활성 소속(퇴사 전)은 사용자당 최대 1건
CREATE UNIQUE INDEX company_members_active_user_unique
  ON company_members (user_id)
  WHERE left_at IS NULL;

CREATE TRIGGER company_members_touch_updated_at
  BEFORE UPDATE ON company_members
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- work_locations -----------------------------------------------------------

CREATE TABLE work_locations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  parent_id    uuid REFERENCES work_locations(id) ON DELETE CASCADE,
  name         text NOT NULL,
  depth        smallint NOT NULL CHECK (depth BETWEEN 1 AND 5),
  path_cache   text,
  sort_no      int NOT NULL DEFAULT 0,
  disabled_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX work_locations_company_active_idx
  ON work_locations (company_id)
  WHERE disabled_at IS NULL;
CREATE INDEX work_locations_parent_idx ON work_locations (parent_id);

CREATE TRIGGER work_locations_touch_updated_at
  BEFORE UPDATE ON work_locations
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- company_invitations ------------------------------------------------------

CREATE TABLE company_invitations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  inviter_id     uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  contact_email  citext,
  contact_phone  text,
  target_role    company_member_role NOT NULL,
  token          text NOT NULL UNIQUE,
  sent_at        timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz,
  accepted_at    timestamptz,
  accepted_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  CHECK (contact_email IS NOT NULL OR contact_phone IS NOT NULL)
);

CREATE INDEX company_invitations_company_idx ON company_invitations (company_id);
CREATE INDEX company_invitations_open_idx
  ON company_invitations (company_id)
  WHERE accepted_at IS NULL;

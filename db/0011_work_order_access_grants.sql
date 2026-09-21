-- 접근 권한을 발송 기록에서 분리한다.
--
-- 0010은 토큰을 work_order_outputs 에 붙였다. 그때는 전달 채널이 메일 하나였다.
-- Pro 요금제는 같은 작업자에게 메일과 알림톡을 모두 보내므로 outputs 는 채널별로 행이
-- 나뉘어야 하는데, 토큰은 "작업자 × 작업지시 × 발급회차"의 것이라 채널 수만큼 복제되면 안 된다.
-- 메일로 가든 알림톡으로 가든 같은 링크여야 열람 집계가 하나로 모인다.
--
--   work_order_access_grants : 접근 권한 (토큰·만료·폐기·열람)  — 작업자당 1행
--   work_order_outputs       : 발송 기록 (채널·상태·재시도)      — 작업자 × 채널
--
-- 수명도 다르다. 토큰은 작업 기간 동안 살아 있고, 발송 기록은 시점의 사실이다.
-- 채널 설계: docs/notifications.md · 토큰 설계: docs/worker-access.md

CREATE TABLE work_order_access_grants (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id     uuid NOT NULL REFERENCES work_orders(id),
  issue_version     int NOT NULL,
  user_id           uuid NOT NULL REFERENCES users(id),
  access_token_hash text NOT NULL UNIQUE,
  token_issued_at   timestamptz NOT NULL DEFAULT now(),
  token_expires_at  timestamptz NOT NULL,
  token_revoked_at  timestamptz,
  first_opened_at   timestamptz,
  last_opened_at    timestamptz,
  open_count        int NOT NULL DEFAULT 0,
  last_open_ip      text,
  last_open_agent   text,
  UNIQUE (work_order_id, issue_version, user_id),
  CONSTRAINT work_order_access_grants_hash_shape
    CHECK (access_token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT work_order_access_grants_expiry_shape
    CHECK (token_expires_at > token_issued_at),
  CONSTRAINT work_order_access_grants_open_shape
    CHECK (
      (open_count = 0 AND first_opened_at IS NULL AND last_opened_at IS NULL)
      OR (open_count > 0 AND first_opened_at IS NOT NULL AND last_opened_at IS NOT NULL)
    )
);

CREATE INDEX work_order_access_grants_order_idx
  ON work_order_access_grants (work_order_id, issue_version);

-- 0010 에서 발급된 토큰이 있으면 옮긴다. 아직 발급 경로가 없으므로 보통 0건이다.
INSERT INTO work_order_access_grants (
  work_order_id, issue_version, user_id, access_token_hash,
  token_issued_at, token_expires_at, token_revoked_at,
  first_opened_at, last_opened_at, open_count, last_open_ip, last_open_agent
)
SELECT work_order_id, issue_version, user_id, access_token_hash,
       token_issued_at, token_expires_at, token_revoked_at,
       first_opened_at, last_opened_at, open_count, last_open_ip, last_open_agent
  FROM work_order_outputs
 WHERE access_token_hash IS NOT NULL;

ALTER TABLE work_order_outputs
  DROP CONSTRAINT IF EXISTS work_order_outputs_access_token_shape,
  DROP CONSTRAINT IF EXISTS work_order_outputs_access_open_shape,
  DROP COLUMN access_token_hash,
  DROP COLUMN token_issued_at,
  DROP COLUMN token_expires_at,
  DROP COLUMN token_revoked_at,
  DROP COLUMN first_opened_at,
  DROP COLUMN last_opened_at,
  DROP COLUMN open_count,
  DROP COLUMN last_open_ip,
  DROP COLUMN last_open_agent;

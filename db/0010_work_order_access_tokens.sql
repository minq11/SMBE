-- 작업지시 링크 접근 토큰 (배정별 1개)
--
-- 목적: 로그인 없이 문자·메일 링크만으로 배정된 작업자가 본인 작업지시에 접근.
-- 토큰 원문은 저장하지 않는다. sha256 해시만 보관해 DB가 유출돼도 링크를 되살릴 수 없게 한다.
-- 토큰은 work_order_outputs 행(= 작업지시 × 발급회차 × 작업자)에 1:1로 붙으므로
-- "누가 확인했는가"가 토큰 자체로 결정된다. 공용 링크를 두지 않는 이유다.
-- 설계 배경과 보안 경계: docs/worker-access.md

ALTER TABLE work_order_outputs
  ADD COLUMN access_token_hash text UNIQUE,
  ADD COLUMN token_issued_at   timestamptz,
  ADD COLUMN token_expires_at  timestamptz,
  ADD COLUMN token_revoked_at  timestamptz,
  ADD COLUMN first_opened_at   timestamptz,
  ADD COLUMN last_opened_at    timestamptz,
  ADD COLUMN open_count        int NOT NULL DEFAULT 0,
  ADD COLUMN last_open_ip      text,
  ADD COLUMN last_open_agent   text;

-- 해시는 sha256 hex 64자. 발급된 토큰은 반드시 발급시각과 미래의 만료시각을 함께 갖는다.
ALTER TABLE work_order_outputs
  ADD CONSTRAINT work_order_outputs_access_token_shape CHECK (
    access_token_hash IS NULL
    OR (
      access_token_hash ~ '^[0-9a-f]{64}$'
      AND token_issued_at IS NOT NULL
      AND token_expires_at IS NOT NULL
      AND token_expires_at > token_issued_at
    )
  );

-- 열람 기록은 토큰이 발급된 행에만 쌓인다.
ALTER TABLE work_order_outputs
  ADD CONSTRAINT work_order_outputs_access_open_shape CHECK (
    (open_count = 0 AND first_opened_at IS NULL AND last_opened_at IS NULL)
    OR (open_count > 0 AND first_opened_at IS NOT NULL AND last_opened_at IS NOT NULL)
  );

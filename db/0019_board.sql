-- 통합자료실: 공지사항(NOTICE) · 자료실(RESOURCE).
--
-- 글은 회사 관리자(관리감독자·안전관리자)만 쓰고, 회사 구성원 모두가 읽는다.
-- 본문은 편집기(Tiptap)의 JSON 문서 그대로 보관한다 (body). HTML 은 저장하지
-- 않고 읽을 때 화이트리스트 렌더러가 만든다 — 저장된 HTML 을 그대로 내보내는
-- 화면은 XSS 의 통로가 된다 (src/features/board/model.ts renderDoc).
--
-- 공지사항은 팝업으로 띄울 수 있다. popup 이 켜져 있고 오늘이 기간 안이면 구성원이
-- 홈(또는 작업자 링크 화면)에 들어올 때 창으로 뜬다. "오늘 하루 안 보기 / 7일간
-- 안 보기" 는 기기의 localStorage 가 기억한다 — 서버에 사람×공지 열람표를 두지
-- 않는다. 기기를 바꾸면 다시 보이는 것이 오히려 공지의 목적에 맞다.
--
-- 초안(DRAFT) 은 작성자가 아니라 회사의 관리자 모두가 본다. 관리자가 둘일 때
-- 한 사람이 쓰다 만 글을 다른 사람이 이어 쓰거나 정리할 수 있어야 한다.
--
-- 첨부(사진·동영상)는 attachments 테이블에 target_type='board_post' 로 붙는다.
-- 유료 회사만 올릴 수 있고 회사당 합계 1GB 까지다 (src/server/attachments.ts).
CREATE TABLE board_posts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id),
  kind          text NOT NULL CHECK (kind IN ('NOTICE', 'RESOURCE')),
  status        text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED')),
  title         text NOT NULL DEFAULT '',
  body          jsonb NOT NULL DEFAULT '{"type":"doc","content":[]}'::jsonb,
  -- 공지 팝업. 자료실 글은 항상 false 다.
  popup         boolean NOT NULL DEFAULT false,
  popup_from    date,
  popup_until   date,
  created_by    uuid NOT NULL REFERENCES users(id),
  updated_by    uuid NOT NULL REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  published_at  timestamptz,
  -- 유료 회사의 첫 발행 때 푸시를 보낸 시각. 다시 저장해도 두 번 보내지 않는다.
  push_sent_at  timestamptz,
  deleted_at    timestamptz,
  CHECK (status <> 'PUBLISHED' OR published_at IS NOT NULL),
  CHECK (kind = 'NOTICE' OR NOT popup),
  CHECK (popup_from IS NULL OR popup_until IS NULL OR popup_from <= popup_until)
);

CREATE INDEX board_posts_list_idx
  ON board_posts (company_id, kind, status, published_at DESC)
  WHERE deleted_at IS NULL;

-- 첨부 대상에 자료실 글을 더한다.
ALTER TABLE attachments DROP CONSTRAINT attachments_target_type_check;
ALTER TABLE attachments ADD CONSTRAINT attachments_target_type_check CHECK (target_type IN (
  'standard_step',
  'risk_item_before',
  'risk_item_after',
  'work_order',
  'inspection_result',
  'inspection_finding',
  'incident',
  'board_post'
));

-- 회사별 자료실 저장 용량(1GB) 계산용. READY 와 방금 시작한 PENDING 을 합산한다.
CREATE INDEX attachments_board_quota_idx
  ON attachments (company_id, status, created_at)
  WHERE target_type = 'board_post';

-- 웹 푸시 구독. 사람의 기기 하나가 행 하나다 (endpoint 가 기기·브라우저를 특정한다).
-- 회사에 묶지 않는다 — 회사를 옮겨도 기기는 그대로이고, 보낼 때 company_members 로
-- 대상을 고른다. 유료 회사의 공지·자료 발행 때만 보낸다 (src/server/push.ts).
CREATE TABLE push_subscriptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id),
  endpoint      text NOT NULL UNIQUE,
  p256dh        text NOT NULL,
  auth          text NOT NULL,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz
);

CREATE INDEX push_subscriptions_user_idx ON push_subscriptions (user_id);

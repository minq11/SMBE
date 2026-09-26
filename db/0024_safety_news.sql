-- 통합자료실에 "오늘의 안전소식"(NEWS) 을 더한다.
--
-- 공지사항·자료실은 회사 안의 글이지만 안전소식은 심플안전(운영자)이 모든 회사에
-- 같이 보내는 글이다. 그래서 company_id 가 NULL 이다 — 어느 회사의 것도 아니다.
-- 쓰기는 운영자(SMBE_OPERATOR_EMAILS)만, 읽기는 로그인한 구성원 전원.
-- 공지사항처럼 팝업으로 띄울 수 있다 (홈·작업자 링크 화면).
--
-- 첨부(사진·동영상)는 그대로 attachments 에 붙는다. 올린 운영자의 소속 회사 id 로
-- 저장되지만, 읽기는 글이 NEWS 이면 회사를 가리지 않는다 (src/server/attachments.ts).

ALTER TABLE board_posts ALTER COLUMN company_id DROP NOT NULL;

ALTER TABLE board_posts DROP CONSTRAINT board_posts_kind_check;
ALTER TABLE board_posts ADD CONSTRAINT board_posts_kind_check
  CHECK (kind IN ('NOTICE', 'RESOURCE', 'NEWS'));

-- 안전소식만 회사가 없고, 회사 글은 반드시 회사가 있다.
ALTER TABLE board_posts ADD CONSTRAINT board_posts_company_by_kind_check
  CHECK ((kind = 'NEWS') = (company_id IS NULL));

-- 팝업은 공지사항과 안전소식만. 0019 의 검사식은 이름 없이 만들어져 자동 이름
-- (board_posts_check1) 을 받았으므로, 이름이 아니라 식으로 찾아 지운다.
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
   WHERE conrelid = 'board_posts'::regclass AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%NOT popup%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE board_posts DROP CONSTRAINT %I', c);
  END IF;
END $$;
ALTER TABLE board_posts ADD CONSTRAINT board_posts_popup_kind_check
  CHECK (kind IN ('NOTICE', 'NEWS') OR NOT popup);

CREATE INDEX board_posts_news_idx
  ON board_posts (status, published_at DESC)
  WHERE kind = 'NEWS' AND deleted_at IS NULL;

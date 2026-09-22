-- 작성 중 초안 삭제.
--
-- 발급된 지시서는 지우지 않는다. 법정 기록이고 회차·점검·부적합이 딸려 있어,
-- 지우면 증빙에 구멍이 난다. 그 경우의 수단은 이미 있는 '취소'다.
-- 지울 수 있는 것은 **아무도 본 적 없는 초안**뿐이다 — 잘못 만든 초안이
-- 목록에 영원히 쌓이는 것을 막는 것이 이 기능의 전부다.
--
-- 물리 삭제도 하지 않는다. 초안에도 간이 위험성평가·배정이 딸려 있어 행을
-- 지우면 정리할 것이 줄줄이 나오고, 실수로 지운 것을 되돌릴 방법이 없어진다.
-- 목록에서 감추고 누가 언제 지웠는지를 남긴다.
ALTER TABLE work_orders
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN deleted_by uuid REFERENCES users(id),
  ADD CONSTRAINT work_orders_delete_pair
    CHECK ((deleted_at IS NULL) = (deleted_by IS NULL)),
  -- 발급된 지시서에는 삭제 표시가 절대 서지 않는다. 앱이 실수해도 DB 가 막는다.
  ADD CONSTRAINT work_orders_delete_draft_only
    CHECK (deleted_at IS NULL OR status = 'DRAFT');

CREATE INDEX work_orders_company_live_idx
  ON work_orders(company_id, created_at DESC)
  WHERE deleted_at IS NULL;

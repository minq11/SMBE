-- 미실시 주 안전점검 회의 메일 알림의 발송 장부.
--
-- 회의가 없는 주에는 safety_meetings 행 자체가 없으므로 "알렸다" 를 적을 자리도
-- 없다. 그 주를 DRAFT 로 만들어 두는 방법도 있지만, 아무도 열지 않은 회의를
-- "작성 중" 으로 세우면 목록이 거짓말을 한다. 그래서 알림만 따로 적는다.
--
-- (company_id, week_start) 가 유일하므로 같은 주를 두 번 알리지 않는다. 배치가
-- 여러 번 돌아도, 여러 주가 한꺼번에 밀려도 결과가 같다.
CREATE TABLE safety_meeting_reminders (
  company_id   uuid NOT NULL REFERENCES companies(id),
  week_start   date NOT NULL,
  sent_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  recipients   int NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, week_start)
);

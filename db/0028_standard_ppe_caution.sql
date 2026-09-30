-- 표준서에 필요 보호구와 주의사항을 더한다 (사장님 결정 2026-09-30).
--
-- 위험요인·대책·사전조사는 위험성평가가 이미 다루므로 표준서에 다시 두지 않는다.
-- 더하는 것은 둘뿐이다: 현장이 가장 먼저 확인하는 보호구(칩으로 고름)와, 절대 하지
-- 말 것·특이 조건·사고 시 연락을 한 칸에 적는 주의사항(선택). 둘 다 판에 묶인다.
ALTER TABLE standard_revisions
  ADD COLUMN ppe text[] NOT NULL DEFAULT '{}',
  ADD COLUMN caution text NOT NULL DEFAULT ''
    CHECK (char_length(caution) <= 2000);

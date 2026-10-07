-- 소규모 사업장의 업무분장은 기존 세 역할과 선택 비고로만 관리한다.
ALTER TABLE company_members
  ADD COLUMN duty_note text NOT NULL DEFAULT ''
  CHECK (char_length(duty_note) <= 500);

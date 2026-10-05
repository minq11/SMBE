-- TBM·작업 중 점검의 종합의견 (선택). 항목별 코멘트와 별개로 "오늘 작업 전체에 대해 한마디".
-- 위험성평가에서 위험요인을 찾을 때 작업자 의견으로 참고한다.
ALTER TABLE inspections
  ADD COLUMN overall_comment text NOT NULL DEFAULT '' CHECK (length(overall_comment) <= 2000);

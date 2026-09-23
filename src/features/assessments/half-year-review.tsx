"use client";

import { useState, useTransition } from "react";
import { ClipboardCheck } from "lucide-react";
import type { HalfYearReview } from "@/server/assessments";
import { recordHalfYearReviewAction } from "./actions";
import { koDate } from "./model";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { FormErrorDialog } from "@/components/ui/form-error-dialog";

const halfLabel = (half: 1 | 2) => (half === 1 ? "상반기" : "하반기");

/**
 * 경영책임자 반기 점검 (중처법 시행령 제4조 제3호). 기소 사유 1위인 조항이라
 * 위험성평가 화면 맨 위에 둔다. 사장이 이 숫자를 보고 서명하면 "결과를 보고받고
 * 확인했다" 는 기록이 남는다. 숫자는 서명 시점 그대로 박힌다.
 */
export function HalfYearReviewCard({ review }: { review: HalfYearReview }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { confirm, dialog } = useConfirm();
  const s = review.stats;

  const sign = async () => {
    if (
      !(await confirm(
        "위 숫자를 확인했고, 남은 조치는 챙기겠다는 서명입니다. 서명 시점의 숫자가 기록에 남습니다.",
        { title: "반기 점검을 서명할까요?", confirmLabel: "서명" },
      ))
    )
      return;
    start(async () => {
      setError(null);
      const result = await recordHalfYearReviewAction(note);
      if (!result.ok) setError(result.error);
      else {
        setOpen(false);
        setNote("");
      }
    });
  };

  return (
    <section
      className={`asmt-review${review.current ? " is-done" : ""}`}
      aria-label="경영책임자 반기 점검"
    >
      <div className="asmt-review-head">
        <h2>
          <ClipboardCheck size={16} style={{ verticalAlign: "-3px" }} />{" "}
          {review.year}년 {halfLabel(review.half)} 경영책임자 점검
        </h2>
        {review.current ? (
          <span className="asmt-tag asmt-tag--ok">
            점검 완료 · {koDate(review.current.reviewed_at.slice(0, 10))} ·{" "}
            {review.current.reviewed_by_name}
          </span>
        ) : (
          <span className="asmt-tag asmt-tag--action">아직 점검 전</span>
        )}
      </div>
      <p className="asmt-review-lead">
        중대재해처벌법은 반기마다 위험요인 확인·개선이 되고 있는지 경영책임자가
        점검하라고 합니다. 위험성평가 결과를 보고받고 확인하면 그 점검입니다.
      </p>
      <dl className="asmt-review-stats">
        <div>
          <dt>이 반기 평가</dt>
          <dd>{s.assessments}건</dd>
        </div>
        <div>
          <dt>조치 완료</dt>
          <dd>{s.actions_done}건</dd>
        </div>
        <div className={s.actions_open > 0 ? "is-alert" : ""}>
          <dt>남은 조치</dt>
          <dd>{s.actions_open}건</dd>
        </div>
        <div className={s.standards_expired > 0 ? "is-alert" : ""}>
          <dt>평가 필요 표준서</dt>
          <dd>{s.standards_expired}건</dd>
        </div>
        <div className={s.pending > 0 ? "is-alert" : ""}>
          <dt>승인 대기</dt>
          <dd>{s.pending}건</dd>
        </div>
      </dl>
      {review.current?.note && (
        <p className="asmt-review-note">{review.current.note}</p>
      )}
      {!open ? (
        <div className="asmt-review-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={() => setOpen(true)}
          >
            {review.current ? "다시 서명" : "점검 확인 서명"}
          </button>
        </div>
      ) : (
        <div className="asmt-review-form">
          <label className="form-field">
            <span>점검 의견 (선택)</span>
            <textarea
              rows={2}
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="예: 남은 조치 2건은 10월까지 마무리"
            />
          </label>
          <div className="asmt-review-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setOpen(false)}
            >
              취소
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={sign}
              disabled={pending}
            >
              {pending ? "저장 중…" : "서명"}
            </button>
          </div>
        </div>
      )}
      {review.history.length > 0 && (
        <details className="std-fold asmt-review-history">
          <summary>지난 점검 기록 ({review.history.length}건)</summary>
          <ul>
            {review.history.map((r) => (
              <li key={r.id}>
                <strong>
                  {r.period_year}년 {halfLabel(r.period_half)}
                </strong>{" "}
                · {koDate(r.reviewed_at.slice(0, 10))} · {r.reviewed_by_name} ·
                평가 {r.stats.assessments}건 · 남은 조치 {r.stats.actions_open}
                건{r.note ? ` · ${r.note}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
      <FormErrorDialog message={error} nonce={error} />
      {dialog}
    </section>
  );
}

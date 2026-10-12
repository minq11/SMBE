"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Save } from "lucide-react";
import { FloatField, FloatTextarea } from "@/components/ui/float-field";
import {
  FormErrorDialog,
  useFormError,
} from "@/components/ui/form-error-dialog";
import { HelpDialog } from "@/components/ui/help-dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  periodLabel,
  SUPERVISOR_RATINGS,
  type HalfYearCheck,
  type HalfYearNotes,
  type SupervisorRating,
} from "./model";
import { saveHalfYearCheckAction } from "./actions";
import { HazardFacts, LegalFacts, ManualFacts, OpinionFacts } from "./document";

/**
 * 반기 점검 작성. 숫자는 서버가 채워 왔고, 대표자는 줄마다 한두 마디와 관리감독자
 * 평가만 적는다. 임시저장은 초안으로 남고, 확정하면 못 고친다.
 */
export function HalfYearCheckForm({ check }: { check: HalfYearCheck }) {
  const [notes, setNotes] = useState<HalfYearNotes>(check.notes);
  const [representative, setRepresentative] = useState(check.representative);
  const [pending, start] = useTransition();
  const err = useFormError();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const href = `/company/half-year-check?year=${check.year}&half=${check.half}`;
  const { facts } = check;

  const submit = (confirmNow: boolean) =>
    start(async () => {
      err.clear();
      try {
        const result = await saveHalfYearCheckAction(
          { year: check.year, half: check.half, notes, representative },
          confirmNow,
        );
        if (result.error) return err.show(result.error);
        router.push(href);
        router.refresh();
      } catch {
        err.show("저장하지 못했습니다. 잠시 후 다시 시도하세요.");
      }
    });

  const setSupervisor = (
    userId: string,
    patch: Partial<{ rating: SupervisorRating | null; note: string }>,
  ) =>
    setNotes({
      ...notes,
      supervisors: {
        ...notes.supervisors,
        [userId]: {
          ...(notes.supervisors[userId] ?? { rating: null, note: "" }),
          ...patch,
        },
      },
    });

  return (
    <form
      className="policy-form-page"
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
    >
      <fieldset className="policy-card policy-fields" disabled={pending}>
        <div className="wo-section-head">
          <h2>1. 유해·위험요인 확인·개선</h2>
          <HelpDialog title="유해·위험요인 확인·개선" variant="icon">
            <dl className="help-rows">
              <dt>무엇</dt>
              <dd>
                이 반기에 위험성평가를 했고, 찾은 위험요인과 점검 불량이
                조치됐는지 봅니다.
              </dd>
              <dt>적을 것</dt>
              <dd>
                남은 조치가 있으면 언제까지 누가 할지. 예: 끼임 대책 2건은
                7월까지.
              </dd>
              <dt>왜</dt>
              <dd>시행령 4조 2호. 반기 1회 점검하고 기록해야 합니다.</dd>
            </dl>
          </HelpDialog>
        </div>
        <HazardFacts f={facts.hazard} />
        <FloatTextarea
          id="hyc-hazard"
          label="남은 조치 계획"
          hint="남은 조치 2건은 7월까지 김반장"
          rows={2}
          maxLength={1000}
          value={notes.hazard}
          onChange={(e) => setNotes({ ...notes, hazard: e.target.value })}
        />
      </fieldset>

      <fieldset className="policy-card policy-fields" disabled={pending}>
        <div className="wo-section-head">
          <h2>2. 관리감독자 업무 수행</h2>
          <HelpDialog title="관리감독자 업무 수행" variant="icon">
            <dl className="help-rows">
              <dt>무엇</dt>
              <dd>
                관리감독자·안전관리자가 이 반기에 지시서를 내고 TBM·점검·불량
                조치를 했는지 숫자로 봅니다.
              </dd>
              <dt>적을 것</dt>
              <dd>사람마다 충실 / 보완 필요 중 하나. 보완이면 무엇을.</dd>
              <dt>왜</dt>
              <dd>시행령 4조 4호. 반기 1회 평가하고 기록해야 합니다.</dd>
            </dl>
          </HelpDialog>
        </div>
        {facts.supervisors.length === 0 ? (
          <p className="wo-muted">관리감독자·안전관리자가 없습니다.</p>
        ) : (
          <ul className="hyc-supervisors" aria-label="관리감독자">
            {facts.supervisors.map((s) => {
              const current = notes.supervisors[s.user_id];
              return (
                <li key={s.user_id}>
                  <div className="hyc-supervisor-head">
                    <strong>{s.name}</strong>
                    <small>
                      지시서 {s.orders_issued} · TBM {s.tbm_confirmed} · 점검{" "}
                      {s.inspections} · 불량 조치 {s.findings_resolved}
                    </small>
                  </div>
                  <div
                    className="seg-row"
                    role="radiogroup"
                    aria-label={`${s.name} 평가`}
                  >
                    {(
                      Object.keys(SUPERVISOR_RATINGS) as SupervisorRating[]
                    ).map((key) => (
                      <label key={key} className="seg-option">
                        <input
                          type="radio"
                          name={`rating-${s.user_id}`}
                          value={key}
                          checked={current?.rating === key}
                          onChange={() =>
                            setSupervisor(s.user_id, { rating: key })
                          }
                        />
                        <span>{SUPERVISOR_RATINGS[key]}</span>
                      </label>
                    ))}
                  </div>
                  <FloatField
                    className="float-field--flush"
                    id={`hyc-sup-note-${s.user_id}`}
                    label="비고"
                    hint="보완 필요면 무엇을"
                    maxLength={200}
                    value={current?.note ?? ""}
                    onChange={(e) =>
                      setSupervisor(s.user_id, { note: e.target.value })
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>

      <fieldset className="policy-card policy-fields" disabled={pending}>
        <div className="wo-section-head">
          <h2>3. 종사자 의견 청취</h2>
          <HelpDialog title="종사자 의견 청취" variant="icon">
            <dl className="help-rows">
              <dt>무엇</dt>
              <dd>
                작업자가 낸 아차사고 신고, 위험성평가에 참여한 사람 수, 평가에
                적힌 의견, 주간 회의 횟수.
              </dd>
              <dt>적을 것</dt>
              <dd>
                의견에 어떻게 응답했는지 한 줄. 예: 야간 조명 어둡다는 의견 → 등
                2개 설치.
              </dd>
              <dt>왜</dt>
              <dd>
                시행령 4조 7호. 반기 1회 의견을 듣고 조치했는지 점검해야 합니다.
              </dd>
            </dl>
          </HelpDialog>
        </div>
        <OpinionFacts f={facts.opinions} />
        <FloatTextarea
          id="hyc-opinions"
          label="의견에 대한 조치"
          hint="야간 조명 어둡다는 의견 → 등 2개 설치"
          rows={2}
          maxLength={1000}
          value={notes.opinions}
          onChange={(e) => setNotes({ ...notes, opinions: e.target.value })}
        />
      </fieldset>

      <fieldset className="policy-card policy-fields" disabled={pending}>
        <div className="wo-section-head">
          <h2>4. 중대재해 대응 절차 점검</h2>
          <HelpDialog title="중대재해 대응 절차 점검" variant="icon">
            <dl className="help-rows">
              <dt>무엇</dt>
              <dd>대응 절차 문서가 있고 비상연락처가 지금 사람·번호인지.</dd>
              <dt>적을 것</dt>
              <dd>
                읽어 보고 점검함에 표시. 바뀐 게 있으면 기준정보의 대응 절차에서
                고치고 여기 한 줄.
              </dd>
              <dt>왜</dt>
              <dd>시행령 4조 8호. 매뉴얼을 반기 1회 점검해야 합니다.</dd>
            </dl>
          </HelpDialog>
        </div>
        <ManualFacts f={facts.manual} />
        <label className="inc-check">
          <input
            type="checkbox"
            checked={notes.manual_checked}
            onChange={(e) =>
              setNotes({ ...notes, manual_checked: e.target.checked })
            }
          />
          <span>절차와 비상연락처를 읽고 점검함</span>
        </label>
        <FloatField
          id="hyc-manual"
          label="바꾼 것 (선택)"
          hint="비상연락처를 새 반장 번호로"
          maxLength={500}
          value={notes.manual}
          onChange={(e) => setNotes({ ...notes, manual: e.target.value })}
        />
      </fieldset>

      <fieldset className="policy-card policy-fields" disabled={pending}>
        <div className="wo-section-head">
          <h2>5. 법령 이행 — 방침·예산·선임·교육</h2>
          <HelpDialog title="법령 이행" variant="icon">
            <dl className="help-rows">
              <dt>무엇</dt>
              <dd>
                올해 방침·목표, 안전보건 예산 편성·집행, 인원 비고에 적힌 법정
                직책, 이 반기 교육 이수.
              </dd>
              <dt>적을 것</dt>
              <dd>
                비어 있는 게 있으면 언제 채울지. 예: 예산 집행은 3분기부터
                분기마다 기록.
              </dd>
              <dt>왜</dt>
              <dd>시행령 5조. 법령상 의무 이행을 반기 1회 점검해야 합니다.</dd>
            </dl>
          </HelpDialog>
        </div>
        <LegalFacts f={facts.legal} year={check.year} />
        <FloatTextarea
          id="hyc-legal"
          label="미이행 항목 조치 계획"
          hint="예산 집행은 3분기부터 분기마다 기록"
          rows={2}
          maxLength={1000}
          value={notes.legal}
          onChange={(e) => setNotes({ ...notes, legal: e.target.value })}
        />
      </fieldset>

      <fieldset className="policy-card policy-fields" disabled={pending}>
        <h2>대표자 확인</h2>
        <FloatField
          id="hyc-representative"
          label="대표자명"
          maxLength={100}
          value={representative}
          onChange={(e) => setRepresentative(e.target.value)}
        />
      </fieldset>

      <div className="form-actions sticky-actions">
        <button type="submit" className="btn-secondary" disabled={pending}>
          <Save size={14} /> {pending ? "저장 중…" : "임시저장"}
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={pending}
          onClick={async () => {
            if (
              await confirm(
                `${periodLabel(check.year, check.half)} 점검을 확정합니다. 지금 보이는 숫자가 그대로 기록에 남고, 확정한 뒤에는 고칠 수 없습니다.`,
                { title: "반기 점검 확정", confirmLabel: "확정" },
              )
            )
              submit(true);
          }}
        >
          <Check size={14} /> {pending ? "저장 중…" : "확정"}
        </button>
      </div>
      <FormErrorDialog message={err.message} nonce={err.nonce} />
      {dialog}
    </form>
  );
}

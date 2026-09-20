"use client";
import {
  cloneElement,
  useActionState,
  useId,
  useState,
  useTransition,
  type ReactElement,
} from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileText,
  Plus,
  Save,
  Send,
  ShieldCheck,
} from "lucide-react";
import { HelpTip } from "@/components/ui/help-tip";
import { PtwHelp } from "@/features/standards/ptw-help";
import { saveOrderAction, saveAndIssueAction } from "./actions";
import { shiftMinutes, type WorkDraft, type MemberOption } from "./model";

export type StandardPickerOption = {
  id: string;
  name: string;
  ptw_required: boolean;
  prefill: {
    name: string;
    ptw_required: boolean;
    method: string;
    tbm: string[];
    during: string[];
    criteria: string;
    safetyInfo: {
      equipment: string;
      materials: string;
      environment: string;
      history: string;
    };
    risks: Array<{
      hazard: string;
      level: "HIGH" | "MID" | "LOW";
      allowable: "yes" | "no";
      measure: string;
      responsibleId: string;
      dueDate: string;
    }>;
    participantIds: string[];
  } | null;
};

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactElement<{ id?: string }>;
}) {
  const id = useId();
  return (
    <div className="wo-field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, { id })}
    </div>
  );
}
function mergeStandardIntoDraft(
  base: WorkDraft,
  prefill: NonNullable<StandardPickerOption["prefill"]>,
): WorkDraft {
  return {
    ...base,
    name: prefill.name || base.name,
    method: prefill.method || base.method,
    ptwRequired: prefill.ptw_required,
    criteria: prefill.criteria,
    safetyInfo: prefill.safetyInfo,
    risks:
      prefill.risks.length > 0
        ? prefill.risks.map((r) => ({
            hazard: r.hazard,
            level: r.level,
            allowable: r.allowable,
            measure: r.measure,
            responsibleId: r.responsibleId,
            dueDate: r.dueDate,
          }))
        : base.risks,
    participantIds:
      prefill.participantIds.length > 0
        ? [...new Set(prefill.participantIds)]
        : base.participantIds,
    tbm: prefill.tbm.length > 0 ? prefill.tbm : base.tbm,
    during: prefill.during.length > 0 ? prefill.during : base.during,
  };
}

export type LocationOption = { id: string; label: string };

export function WorkOrderForm({
  id,
  revision,
  initial,
  members,
  standards = [],
  initialStandardId = null,
  locations = [],
}: {
  id: string;
  revision: number;
  initial: WorkDraft;
  members: MemberOption[];
  standards?: StandardPickerOption[];
  initialStandardId?: string | null;
  locations?: LocationOption[];
}) {
  const [data, setData] = useState<WorkDraft>(() => {
    if (initialStandardId) {
      const s = standards.find((x) => x.id === initialStandardId);
      if (s?.prefill) {
        return {
          ...mergeStandardIntoDraft(initial, s.prefill),
          standardId: initialStandardId,
        };
      }
    }
    return { ...initial, standardId: initial.standardId ?? null };
  });
  const [standardId, setStandardId] = useState<string | null>(
    initialStandardId,
  );
  // 명시적 "간이 위험성평가로 대체" 선택 여부. false = 아직 방식 미선택 (idle).
  const [simpleOverride, setSimpleOverride] = useState<boolean>(
    () => Boolean(initial?.name) && !initialStandardId,
  );
  const mode: "idle" | "standard" | "simple" = standardId
    ? "standard"
    : simpleOverride
      ? "simple"
      : "idle";
  const [step, setStep] = useState(0);
  const [state, action, pending] = useActionState(saveOrderAction, undefined);
  const [issuePending, startIssue] = useTransition();
  const [issueError, setIssueError] = useState<string | null>(null);
  const submitIssue = () => {
    if (
      !confirm(
        "지금 발급하시겠어요? 저장 → 위험성평가 승인(본인) → 발급 → 배정 인원에게 링크 전송이 순차 진행되고, 발급 후 내용이 고정됩니다.",
      )
    )
      return;
    setIssueError(null);
    const form = new FormData();
    form.set("id", id);
    form.set("revision", String(revision));
    form.set("payload", JSON.stringify(data));
    startIssue(async () => {
      const result = await saveAndIssueAction(undefined, form);
      if (result?.error) setIssueError(result.error);
    });
  };
  const set = <K extends keyof WorkDraft>(key: K, value: WorkDraft[K]) =>
    setData((d) => ({ ...d, [key]: value }));
  const toggle = (key: "participantIds" | "assigneeIds", id: string) =>
    set(
      key,
      data[key].includes(id)
        ? data[key].filter((x) => x !== id)
        : [...data[key], id],
    );
  const applyStandard = (nextId: string) => {
    const s = standards.find((x) => x.id === nextId);
    if (!s?.prefill) return;
    setData((d) => ({
      ...mergeStandardIntoDraft(d, s.prefill!),
      standardId: nextId,
    }));
    setStandardId(nextId);
    setSimpleOverride(false);
  };
  const chooseSimple = () => {
    setStandardId(null);
    setData((d) => ({ ...d, standardId: null }));
    setSimpleOverride(true);
  };
  const resetChoice = () => {
    setStandardId(null);
    setSimpleOverride(false);
    setData((d) => ({ ...d, standardId: null }));
  };
  const minutes = shiftMinutes(data.startTime, data.endTime);
  const pickedStandard =
    standardId != null ? standards.find((s) => s.id === standardId) : null;
  return (
    <form action={action} className="wo-editor">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="revision" value={revision} />
      <input type="hidden" name="payload" value={JSON.stringify(data)} />
      <nav className="wo-steps" aria-label="작성 단계">
        {["작업 정보", "위험성평가", "일정·인원", "체크리스트·검토"].map(
          (title, i) => (
            <button
              type="button"
              key={title}
              aria-current={step === i ? "step" : undefined}
              onClick={() => setStep(i)}
            >
              <span>{i + 1}</span>
              {title}
            </button>
          ),
        )}
      </nav>
      <div className="wo-editor-grid">
        <div className="wo-section">
          {state?.error && (
            <p role="alert" className="form-error">
              {state.error}
            </p>
          )}
          {step === 0 && (
            <>
              <section className="wo-std-picker">
                <h2>이 지시서의 위험성평가</h2>
                {standards.length > 0 ? (
                  <>
                    <p className="wo-muted">
                      표준서를 선택하면 그 표준서의 승인된 위험성평가·작업방법·
                      체크리스트가 자동으로 딸려갑니다. 등록된 표준서가 없는
                      1회성 작업만 예외적으로 &lsquo;간이 위험성평가로
                      대체&rsquo; 를 사용하세요.
                    </p>
                    <ul className="wo-std-list" role="list">
                      {standards.map((s) => {
                        const active = standardId === s.id;
                        return (
                          <li key={s.id}>
                            <button
                              type="button"
                              className={`wo-std-option${active ? " is-active" : ""}`}
                              onClick={() => applyStandard(s.id)}
                            >
                              <span className="wo-std-option-icon">
                                {active ? (
                                  <CheckCircle2 size={16} />
                                ) : (
                                  <ShieldCheck size={16} />
                                )}
                              </span>
                              <span className="wo-std-option-copy">
                                <strong>{s.name}</strong>
                                <small>
                                  현재 승인 평가 포함
                                  {s.ptw_required ? " · PTW 필요" : ""}
                                </small>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                ) : (
                  <p className="wo-muted">
                    등록된 표준서가 없습니다. 반복 작업이면 표준서를 먼저 만드는
                    걸 권장합니다. 1회성이면 간이 위험성평가로 대체하고 계속
                    진행할 수 있습니다.
                  </p>
                )}
                <div className="wo-std-picker-actions">
                  <Link
                    href={`/standards/new?return=${encodeURIComponent("/work-orders/new")}`}
                    className={
                      standards.length === 0 ? "primary-button" : "ghost-button"
                    }
                    prefetch={false}
                  >
                    <Plus size={13} /> 새 표준서 만들기
                  </Link>
                  <button
                    type="button"
                    className={`ghost-button wo-std-exception${mode === "simple" ? " is-on" : ""}`}
                    onClick={chooseSimple}
                    aria-pressed={mode === "simple"}
                  >
                    <FileText size={13} /> 간이 위험성평가로 대체 (예외)
                  </button>
                  {mode !== "idle" && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={resetChoice}
                    >
                      다시 선택
                    </button>
                  )}
                </div>
                {mode === "standard" && pickedStandard && (
                  <p className="wo-std-note">
                    <ShieldCheck size={13} /> 선택한 표준서{" "}
                    <strong>{pickedStandard.name}</strong> 의 현재 사용 중
                    위험성평가가 아래 폼에 채워졌습니다. 필요하면 개별 항목을
                    수정할 수 있고, 발급 시 표준서 스냅샷이 함께 저장됩니다.
                  </p>
                )}
                {mode === "simple" && (
                  <p className="wo-std-note wo-std-note--warn">
                    <FileText size={13} /> 간이 위험성평가로 대체 중입니다. 같은
                    작업이 반복될 예정이면 이번 지시서 발급 후 표준서로 등록해
                    재사용하세요.
                  </p>
                )}
                {mode === "idle" && (
                  <p className="wo-std-note wo-std-note--warn">
                    <FileText size={13} /> 위에서 표준서를 선택하거나
                    &lsquo;간이 위험성평가로 대체&rsquo; 를 눌러야 작업 정보를
                    입력할 수 있습니다.
                  </p>
                )}
              </section>

              {mode === "idle" ? null : (
                <>
                  <h2>
                    {mode === "standard"
                      ? "작업 정보 (표준서 값 채워짐)"
                      : "간이 위험성평가 작업 정보"}
                  </h2>
                  <p className="wo-muted">
                    {mode === "standard"
                      ? "표준서에서 가져온 값이 채워져 있습니다. 이번 작업에 맞게 수정할 수 있고, 발급 시 원본 표준서 스냅샷은 그대로 함께 저장됩니다."
                      : "간이평가도 위험요인·대책·참여자 기록과 승인이 필요합니다. 다음 단계에서 위험요인·대책·참여자를 입력합니다."}
                  </p>
                </>
              )}
              {mode !== "idle" && (
                <>
                  <Field label="작업명">
                    <input
                      value={data.name}
                      maxLength={120}
                      onChange={(e) => set("name", e.target.value)}
                    />
                  </Field>
                  <Field label="작업 단계·방법">
                    <textarea
                      rows={6}
                      value={data.method}
                      maxLength={4000}
                      onChange={(e) => set("method", e.target.value)}
                      placeholder="실제 작업 순서와 방법을 작성하세요."
                    />
                  </Field>
                  <Field label="조 이름 (선택)">
                    <input
                      value={data.groupLabel}
                      maxLength={40}
                      onChange={(e) => set("groupLabel", e.target.value)}
                      placeholder="주간조 / 야간조"
                    />
                  </Field>
                  <div className="wo-field">
                    <span className="wo-field-label">
                      PTW(위험작업허가) 필요 여부
                      <HelpTip title="위험작업허가 (PTW)">
                        <PtwHelp />
                      </HelpTip>
                    </span>
                    <select
                      value={data.ptwRequired ? "yes" : "no"}
                      onChange={(e) =>
                        set("ptwRequired", e.target.value === "yes")
                      }
                    >
                      <option value="no">불필요</option>
                      <option value="yes">필요</option>
                    </select>
                  </div>
                  {data.ptwRequired && (
                    <p className="wo-notice">
                      PTW가 필요한 작업은 저장 후 지시서 상세에서 허가를
                      신청하세요. 승인되면 자동 발급됩니다. 필요로 저장한 뒤에는
                      불필요로 내릴 수 없습니다.
                    </p>
                  )}
                </>
              )}
            </>
          )}
          {step === 1 && (
            <>
              <h2>현장 위험요인과 대책</h2>
              <p className="wo-muted">
                기본값으로 위험을 판단하지 않습니다. 현장에서 확인한 수준과 허용
                여부를 직접 선택하세요.
              </p>
              <div className="wo-columns">
                <Field label="실시 구분">
                  <select
                    value={data.assessmentKind}
                    onChange={(e) =>
                      set(
                        "assessmentKind",
                        e.target.value as WorkDraft["assessmentKind"],
                      )
                    }
                  >
                    <option value="FIRST">최초</option>
                    <option value="PERIODIC">정기</option>
                    <option value="AD_HOC">수시</option>
                    <option value="CONTINUOUS">상시</option>
                  </select>
                </Field>
                <Field label="평가 실시일">
                  <input
                    type="date"
                    value={data.performedOn}
                    onChange={(e) => set("performedOn", e.target.value)}
                  />
                </Field>
              </div>
              <Field label="적용한 위험성 수준 판단 기준">
                <textarea
                  rows={3}
                  value={data.criteria}
                  onChange={(e) => set("criteria", e.target.value)}
                  maxLength={4000}
                  placeholder="회사가 정한 상·중·하 기준과 허용 가능한 수준을 적어 주세요."
                />
              </Field>
              {data.risks.map((risk, i) => {
                const update = (key: keyof typeof risk, value: string) =>
                  set(
                    "risks",
                    data.risks.map((r, index) =>
                      index === i ? { ...r, [key]: value } : r,
                    ),
                  );
                return (
                  <fieldset className="wo-risk" key={i}>
                    <legend>위험요인 {i + 1}</legend>
                    <Field label="유해·위험요인">
                      <textarea
                        value={risk.hazard}
                        onChange={(e) => update("hazard", e.target.value)}
                        maxLength={4000}
                      />
                    </Field>
                    <div className="wo-columns">
                      <Field label="위험성 수준">
                        <select
                          value={risk.level}
                          onChange={(e) => update("level", e.target.value)}
                        >
                          <option value="">선택하세요</option>
                          <option value="HIGH">상</option>
                          <option value="MID">중</option>
                          <option value="LOW">하</option>
                        </select>
                      </Field>
                      <Field label="허용 가능 여부">
                        <select
                          value={risk.allowable}
                          onChange={(e) => update("allowable", e.target.value)}
                        >
                          <option value="">선택하세요</option>
                          <option value="yes">허용 가능</option>
                          <option value="no">허용 불가 · 조치 필요</option>
                        </select>
                      </Field>
                    </div>
                    <Field label="감소대책">
                      <textarea
                        value={risk.measure}
                        onChange={(e) => update("measure", e.target.value)}
                        maxLength={4000}
                      />
                    </Field>
                    <div className="wo-columns">
                      <Field label="조치 담당자">
                        <select
                          value={risk.responsibleId}
                          onChange={(e) =>
                            update("responsibleId", e.target.value)
                          }
                        >
                          <option value="">선택하세요</option>
                          {members.map((m) => (
                            <option key={m.user_id} value={m.user_id}>
                              {m.display_name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="조치 예정일">
                        <input
                          type="date"
                          value={risk.dueDate}
                          onChange={(e) => update("dueDate", e.target.value)}
                        />
                      </Field>
                    </div>
                    {data.risks.length > 1 && (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() =>
                          set(
                            "risks",
                            data.risks.filter((_, n) => n !== i),
                          )
                        }
                      >
                        위험요인 {i + 1} 삭제
                      </button>
                    )}
                  </fieldset>
                );
              })}
              <button
                type="button"
                className="btn-secondary"
                disabled={data.risks.length >= 50}
                onClick={() =>
                  set("risks", [
                    ...data.risks,
                    {
                      hazard: "",
                      level: "",
                      allowable: "",
                      measure: "",
                      responsibleId: "",
                      dueDate: "",
                    },
                  ])
                }
              >
                <Plus size={14} />
                위험요인 추가
              </button>
              <h3>사전조사한 안전보건정보</h3>
              {(
                [
                  ["equipment", "기계·기구·설비 사양"],
                  ["materials", "취급 유해물질·MSDS 정보"],
                  ["environment", "공정·작업 주변 환경"],
                  ["history", "과거 재해·아차사고 이력"],
                ] as const
              ).map(([key, label]) => (
                <Field key={key} label={label}>
                  <textarea
                    value={data.safetyInfo[key]}
                    maxLength={4000}
                    onChange={(e) =>
                      set("safetyInfo", {
                        ...data.safetyInfo,
                        [key]: e.target.value,
                      })
                    }
                    placeholder="확인한 내용을 입력하세요. 해당사항이 없으면 그 사실을 적어 주세요."
                  />
                </Field>
              ))}
              <fieldset className="wo-people">
                <legend>평가에 실제 참여한 근로자</legend>
                {members.map((m) => (
                  <label key={m.user_id}>
                    <input
                      type="checkbox"
                      checked={data.participantIds.includes(m.user_id)}
                      onChange={() => toggle("participantIds", m.user_id)}
                    />
                    {m.display_name}
                  </label>
                ))}
              </fieldset>
            </>
          )}
          {step === 2 && (
            <>
              <h2>일정과 배정 인원</h2>
              <p className="wo-muted">
                한국시간 기준입니다. 종료시간이 시작시간보다 이르면 다음 날
                종료하는 야간작업으로 계산합니다. 매일 같은 시간에 작업하며,
                주·야간조는 지시서를 따로 작성하세요.
              </p>
              <div className="wo-columns">
                <Field label="작업 시작일">
                  <input
                    type="date"
                    value={data.startDate}
                    onChange={(e) => set("startDate", e.target.value)}
                  />
                </Field>
                <Field label="작업 종료일">
                  <input
                    type="date"
                    value={data.endDate}
                    onChange={(e) => set("endDate", e.target.value)}
                  />
                </Field>
                <Field label="시작시간">
                  <input
                    type="time"
                    value={data.startTime}
                    onChange={(e) => set("startTime", e.target.value)}
                  />
                </Field>
                <Field label="종료시간">
                  <input
                    type="time"
                    value={data.endTime}
                    onChange={(e) => set("endTime", e.target.value)}
                  />
                </Field>
              </div>
              <p className="wo-muted">
                하루 작업시간: {Math.floor(minutes / 60)}시간 {minutes % 60}분 ·
                최대 16시간
              </p>
              <Field label="작업 장소">
                <input
                  value={data.location}
                  maxLength={200}
                  onChange={(e) => set("location", e.target.value)}
                  placeholder={
                    locations.length > 0
                      ? "회사 등록 장소 중 선택하거나 직접 입력"
                      : "직접 입력 (회사 장소관리는 준비 중)"
                  }
                  list={locations.length > 0 ? "wo-location-list" : undefined}
                  autoComplete="off"
                />
              </Field>
              {locations.length > 0 && (
                <datalist id="wo-location-list">
                  {locations.map((l) => (
                    <option key={l.id} value={l.label} />
                  ))}
                </datalist>
              )}
              <fieldset className="wo-people">
                <legend>작업자 배정 ({data.assigneeIds.length}명)</legend>
                {members.map((m) => (
                  <label key={m.user_id}>
                    <input
                      type="checkbox"
                      checked={data.assigneeIds.includes(m.user_id)}
                      onChange={() => toggle("assigneeIds", m.user_id)}
                    />
                    {m.display_name}
                  </label>
                ))}
              </fieldset>
              <Link
                href="/company/members"
                target="_blank"
                rel="noopener"
                className="text-button"
              >
                구성원 초대 (새 탭)
              </Link>
              <p className="wo-muted">
                새 구성원이 합류한 뒤에는 먼저 임시저장하고 편집 화면을 다시
                열어 주세요.
              </p>
            </>
          )}
          {step === 3 && (
            <>
              <h2>체크리스트 확인</h2>
              <p className="wo-muted">
                임시저장 후 상세 화면에서 평가 승인과 발급을 진행합니다. 평가
                내용을 수정하면 기존 승인 연결이 해제됩니다.
              </p>
              {(
                [
                  ["tbm", "TBM · 작업 전"],
                  ["during", "작업 중"],
                ] as const
              ).map(([key, title]) => (
                <fieldset className="wo-risk" key={key}>
                  <legend>{title}</legend>
                  {data[key].map((value, i) => (
                    <div className="wo-check-edit" key={i}>
                      <Field label={title + " 항목 " + (i + 1)}>
                        <input
                          maxLength={500}
                          value={value}
                          onChange={(e) =>
                            set(
                              key,
                              data[key].map((v, n) =>
                                n === i ? e.target.value : v,
                              ),
                            )
                          }
                        />
                      </Field>
                      {data[key].length > 1 && (
                        <button
                          type="button"
                          className="btn-secondary"
                          aria-label={title + " 항목 " + (i + 1) + " 삭제"}
                          onClick={() =>
                            set(
                              key,
                              data[key].filter((_, n) => n !== i),
                            )
                          }
                        >
                          삭제
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={data[key].length >= 50}
                    onClick={() => set(key, [...data[key], ""])}
                  >
                    <Plus size={14} />
                    항목 추가
                  </button>
                </fieldset>
              ))}
              <p className="wo-notice">
                발급 후 작업 내용·평가·체크리스트는 고정됩니다. 변경이 필요하면
                취소 후 복사해 재발급하세요. TBM·작업 중 점검 결과 입력은 아직
                제공하지 않습니다.
              </p>
              {issueError && (
                <p role="alert" className="form-error">
                  {issueError}
                </p>
              )}
              <div className="wo-issue-cta">
                <button
                  type="button"
                  className="btn-primary wo-issue-button"
                  onClick={submitIssue}
                  disabled={issuePending || pending || data.ptwRequired}
                >
                  <Send size={14} />
                  {issuePending ? "발급 중..." : "지금 발급하기"}
                </button>
                <p className="wo-muted">
                  저장 → 평가 승인(본인) → 지시서 발급 → 배정 인원 이메일 전송을
                  한 번에 처리합니다. PTW 필요 작업은 저장 후 허가를 신청하세요.
                </p>
              </div>
            </>
          )}
          <div className="wo-actions">
            {step > 0 && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setStep(step - 1)}
              >
                <ArrowLeft size={14} />
                이전
              </button>
            )}
            {step < 3 && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setStep(step + 1)}
              >
                다음
                <ArrowRight size={14} />
              </button>
            )}
            <button
              type="submit"
              className="btn-secondary"
              disabled={pending || issuePending}
            >
              <Save size={14} />
              {pending ? "저장 중…" : "임시저장"}
            </button>
          </div>
        </div>
        <aside className="wo-summary">
          <h2>작성 중인 작업</h2>
          <strong>{data.name || "작업명을 입력하세요"}</strong>
          <dl>
            <dt>장소</dt>
            <dd>{data.location || "미입력"}</dd>
            <dt>기간</dt>
            <dd>
              {data.startDate || "미선택"} ~ {data.endDate || "미선택"}
            </dd>
            <dt>배정</dt>
            <dd>{data.assigneeIds.length}명</dd>
            <dt>평가 참여</dt>
            <dd>{data.participantIds.length}명</dd>
            <dt>PTW</dt>
            <dd>{data.ptwRequired ? "필요 · 발급 차단" : "불필요"}</dd>
          </dl>
          <p className="wo-muted">
            단계 이동 시 입력값은 유지됩니다. 페이지를 나가기 전에는
            임시저장하세요.
          </p>
        </aside>
      </div>
    </form>
  );
}

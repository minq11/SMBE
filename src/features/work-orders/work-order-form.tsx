"use client";
import {
  cloneElement,
  useActionState,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactElement,
  type ReactNode,
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
import { PageHeader } from "@/components/ui/page-header";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { PeoplePicker } from "@/components/ui/people-picker";
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
    // criteria 는 회사 기준을 따르므로 표준서가 덮어쓰지 않는다.
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

const STEPS = ["작업 정보", "위험성평가", "일정·인원", "체크리스트·검토"];

/** 화면이 처음 열릴 때의 폼 값. 표준서가 물려 있으면 그 값이 초안 위에 얹힌다. */
function openingDraft(
  initial: WorkDraft,
  standards: StandardPickerOption[],
  initialStandardId: string | null,
): WorkDraft {
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
}

/**
 * 작성·편집 폼. 제목과 단계 탭은 좁은 화면에서 위에 고정되고, 이전·다음·임시저장은
 * 아래에 고정된다 (work-orders.css .wo-editor-head / .wo-actions). 긴 단계를
 * 내려가다가도 어느 단계인지, 다음으로 갈 버튼이 어디인지 찾지 않게 하려는 것.
 *
 * `review` 는 저장된 초안에만 있는 검토·발급 명령(다른 관리자 승인 흐름)이다.
 * 이 명령은 마지막 임시저장본에 작동하므로, 고치고 아직 저장하지 않았으면 잠근다.
 * 명령마다 제 폼을 갖고 있어 편집 폼 안에 넣을 수 없고(form 중첩), 폼 뒤에 둔다.
 */
export function WorkOrderForm({
  id,
  revision,
  initial,
  members,
  standards = [],
  initialStandardId = null,
  locations = [],
  title,
  description,
  notice,
  review,
  footer,
}: {
  id: string;
  revision: number;
  initial: WorkDraft;
  members: MemberOption[];
  standards?: StandardPickerOption[];
  initialStandardId?: string | null;
  locations?: LocationOption[];
  /** 작업명이 비어 있을 때 머리말에 보일 제목 */
  title: string;
  description?: ReactNode;
  /** 머리말 아래에 띄울 알림 (발급 실패 배너 등) */
  notice?: ReactNode;
  /** 마지막 단계 폼 뒤에 붙는 검토·발급 명령 */
  review?: ReactNode;
  /** 폼 전체 아래에 붙는 것 (초안 삭제, 변경 이력) */
  footer?: ReactNode;
}) {
  const [data, setData] = useState<WorkDraft>(() =>
    openingDraft(initial, standards, initialStandardId),
  );
  // 저장 뒤에는 서버가 새 initial 을 내려보내므로, 이 값과 같으면 저장할 게 없다.
  const saved = useMemo(
    () => JSON.stringify(openingDraft(initial, standards, initialStandardId)),
    [initial, standards, initialStandardId],
  );
  const dirty = JSON.stringify(data) !== saved;
  const [standardId, setStandardId] = useState<string | null>(
    initialStandardId,
  );
  // 명시적 "표준서 없이 진행" 선택 여부. false = 아직 방식 미선택 (idle).
  const [simpleOverride, setSimpleOverride] = useState<boolean>(
    () => Boolean(initial?.name) && !initialStandardId,
  );
  const mode: "idle" | "standard" | "simple" = standardId
    ? "standard"
    : simpleOverride
      ? "simple"
      : "idle";
  const [step, setStep] = useState(0);
  // 좁은 화면에서 단계 탭은 한 줄로 옆으로 밀린다. 현재 단계가 잘려 있지 않게 끌어온다.
  const stepsRef = useRef<HTMLElement>(null);
  useEffect(() => {
    // scrollIntoView 는 조상 스크롤 영역(본문·문서)까지 밀어 버린다. 띠만 민다.
    const nav = stepsRef.current;
    const active = nav?.querySelector<HTMLElement>("[aria-current]");
    if (!nav || !active) return;
    const left = active.offsetLeft - 16;
    const right = active.offsetLeft + active.offsetWidth + 16;
    if (left < nav.scrollLeft) nav.scrollTo({ left });
    else if (right > nav.scrollLeft + nav.clientWidth)
      nav.scrollTo({ left: right - nav.clientWidth });
  }, [step]);
  // 단계가 바뀌면 새 단계의 머리부터 보여 준다. 아래 고정 바에서 '다음' 을 눌렀을 때
  // 스크롤이 지난 단계의 바닥에 남아 있으면 무엇이 바뀌었는지 알 수 없다.
  const goTo = (next: number) => {
    setStep(next);
    // 좁은 화면에서는 본문(main)이 스크롤 영역이고, 넓은 화면에서는 문서다.
    document.getElementById("main")?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  };
  const [state, action, pending] = useActionState(saveOrderAction, undefined);
  const [issuePending, startIssue] = useTransition();
  const [issueError, setIssueError] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  /**
   * 저장하지 않은 입력의 보관.
   *
   * 현장에서는 뒤로 스와이프, 앱 전환 중 종료, 전화 수신으로 화면이 사라진다.
   * 고친 내용을 이 기기에 잠시 보관했다가, 같은 초안을 다시 열면 이어서 쓸지
   * 묻는다. 서버에 저장하면(임시저장·발급) 보관본은 지운다 — 실패하면 아래
   * effect 가 다시 보관한다. 새 지시서는 아직 id 가 없으므로 한 자리를 쓴다.
   */
  const backupKey = "smbe.wo-draft." + (revision === 0 ? "new" : id);
  const [backup, setBackup] = useState<{
    at: string;
    data: WorkDraft;
  } | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(backupKey);
      if (!raw) return;
      const stored = JSON.parse(raw) as { at: string; data: WorkDraft };
      if (JSON.stringify(stored.data) === saved) {
        localStorage.removeItem(backupKey);
        return;
      }
      const timer = setTimeout(() => setBackup(stored), 0);
      return () => clearTimeout(timer);
    } catch {
      /* 보관본이 깨졌으면 없는 것으로 */
    }
    // 처음 열릴 때 한 번만 본다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backupKey]);
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          backupKey,
          JSON.stringify({ at: new Date().toISOString(), data }),
        );
      } catch {
        /* 저장소가 막혀 있으면 보관하지 않는다 */
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [backupKey, data, dirty, state]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const clearBackup = () => {
    try {
      localStorage.removeItem(backupKey);
    } catch {
      /* ignore */
    }
  };
  const restoreBackup = () => {
    if (!backup) return;
    setData({ ...backup.data, standardId: backup.data.standardId ?? null });
    setStandardId(backup.data.standardId ?? null);
    setSimpleOverride(Boolean(backup.data.name) && !backup.data.standardId);
    setBackup(null);
  };
  const discardBackup = () => {
    clearBackup();
    setBackup(null);
  };
  const submitSave = (form: FormData) => {
    clearBackup();
    action(form);
  };

  const submitIssue = async () => {
    if (
      !(await confirm(
        "저장 → 위험성평가 승인(본인) → 발급 → 배정 인원에게 링크 전송이 순차 진행되고, 발급 후 내용이 고정됩니다.",
        { title: "지금 발급할까요?", confirmLabel: "발급" },
      ))
    )
      return;
    setIssueError(null);
    const form = new FormData();
    form.set("id", id);
    form.set("revision", String(revision));
    form.set("payload", JSON.stringify(data));
    clearBackup();
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
    <div className="wo-editor">
      <div className="wo-editor-head">
        <PageHeader title={data.name || title} />
        <nav className="wo-steps" aria-label="작성 단계" ref={stepsRef}>
          {STEPS.map((label, i) => (
            <button
              type="button"
              key={label}
              aria-current={step === i ? "step" : undefined}
              data-state={i < step ? "done" : i === step ? "current" : "todo"}
              onClick={() => goTo(i)}
            >
              <span className="wo-doc-tab-no" aria-hidden="true">
                {i + 1}
              </span>
              <span className="wo-doc-tab-label">{label}</span>
            </button>
          ))}
        </nav>
      </div>
      {notice}
      {backup && (
        <div className="wo-restore" role="status">
          <p>
            <strong>저장하지 않은 입력이 있습니다.</strong>{" "}
            {new Date(backup.at).toLocaleString("ko-KR", {
              timeZone: "Asia/Seoul",
              month: "numeric",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
            에 이 기기에서 쓰던 내용
            {backup.data.name ? ` (${backup.data.name})` : ""}
            입니다.
          </p>
          <div className="wo-restore-actions">
            <button
              type="button"
              className="btn-primary"
              onClick={restoreBackup}
            >
              이어서 작성
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={discardBackup}
            >
              버리기
            </button>
          </div>
        </div>
      )}
      {description && <p className="wo-editor-lead">{description}</p>}
      <div className="wo-editor-grid">
        <div className="wo-section">
          <form action={submitSave} className="wo-editor-form">
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="revision" value={revision} />
            <input type="hidden" name="payload" value={JSON.stringify(data)} />
            {state?.error && (
              <p role="alert" className="form-error">
                {state.error}
              </p>
            )}
            {step === 0 && (
              <>
                <section className="wo-std-picker">
                  <h2>이 지시서의 작업표준서</h2>
                  {standards.length > 0 ? (
                    <>
                      <p className="wo-muted">
                        작업표준서를 선택하면 그 표준서에 승인된 위험성평가와
                        작업방법·체크리스트가 함께 딸려옵니다. 등록된 표준서가
                        없는 1회성 작업만 예외적으로 &lsquo;표준서 없이
                        진행&rsquo; 을 사용하세요.
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
                      등록된 작업표준서가 없습니다. 반복 작업이면 표준서를 먼저
                      만드는 걸 권장합니다. 1회성이면 표준서 없이 진행할 수
                      있으며, 위험성평가는 다음 단계에서 직접 입력합니다.
                    </p>
                  )}
                  <div className="wo-std-picker-actions">
                    <Link
                      href={`/standards/new?return=${encodeURIComponent("/work-orders/new")}`}
                      className={
                        standards.length === 0
                          ? "primary-button"
                          : "ghost-button"
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
                      <FileText size={13} /> 표준서 없이 진행 (예외)
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
                      <ShieldCheck size={13} /> 선택한 작업표준서{" "}
                      <strong>{pickedStandard.name}</strong> 의 현재 사용 중
                      위험성평가가 아래 폼에 채워졌습니다. 필요하면 개별 항목을
                      수정할 수 있고, 발급 시 표준서 스냅샷이 함께 저장됩니다.
                    </p>
                  )}
                  {mode === "simple" && (
                    <p className="wo-std-note wo-std-note--warn">
                      <FileText size={13} /> 표준서 없이 진행 중입니다.
                      위험성평가는 다음 단계에서 직접 입력합니다. 같은 작업이
                      반복될 예정이면 이번 지시서 발급 후 표준서로 등록해
                      재사용하세요.
                    </p>
                  )}
                  {mode === "idle" && (
                    <p className="wo-std-note wo-std-note--warn">
                      <FileText size={13} /> 위에서 작업표준서를 선택하거나
                      &lsquo;표준서 없이 진행&rsquo; 을 눌러야 작업 정보를
                      입력할 수 있습니다.
                    </p>
                  )}
                </section>

                {mode === "idle" ? null : (
                  <>
                    <h2>
                      {mode === "standard"
                        ? "작업 정보 (표준서 값 채워짐)"
                        : "작업 정보 (표준서 없이 작성)"}
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
                        신청하세요. 승인되면 자동 발급됩니다. 필요로 저장한
                        뒤에는 불필요로 내릴 수 없습니다.
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
                  기본값으로 위험을 판단하지 않습니다. 현장에서 확인한 수준과
                  허용 여부를 직접 선택하세요.
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
                {/* 판단 기준은 회사가 한 번 정하는 값이다. 평가마다 다시 쓰지 않고
                  회사 기준을 그대로 보여 주며, 저장 시 사본으로 함께 보관된다. */}
                <section className="wo-criteria">
                  <h3>적용한 위험성 수준 판단 기준</h3>
                  <pre className="criteria-readonly">{data.criteria}</pre>
                  <p className="wo-muted">
                    회사가 정한 기준이 그대로 적용됩니다. 바꾸려면{" "}
                    <Link href="/company/criteria">
                      회사정보 &gt; 위험성 판단 기준
                    </Link>{" "}
                    에서 수정하세요. 이미 승인된 평가는 영향을 받지 않습니다.
                  </p>
                </section>
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
                            onChange={(e) =>
                              update("allowable", e.target.value)
                            }
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
                <PeoplePicker
                  legend="평가에 실제 참여한 근로자"
                  members={members}
                  selected={data.participantIds}
                  onToggle={(id) => toggle("participantIds", id)}
                />
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
                  하루 작업시간: {Math.floor(minutes / 60)}시간 {minutes % 60}분
                  · 최대 16시간
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
                <PeoplePicker
                  legend={`작업자 배정 (${data.assigneeIds.length}명)`}
                  members={members}
                  selected={data.assigneeIds}
                  onToggle={(id) => toggle("assigneeIds", id)}
                />
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
                  아래에서 바로 발급할 수 있습니다. 다른 관리자의 검토가
                  필요하면 임시저장한 뒤 이 단계의 검토·발급에서 요청하세요.
                  평가 내용을 수정하면 기존 승인 연결이 해제됩니다.
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
                  발급 후 작업 내용·평가·체크리스트는 고정됩니다. 변경이
                  필요하면 취소 후 복사해 재발급하세요. TBM·작업 중 점검 결과
                  입력은 아직 제공하지 않습니다.
                </p>
                {issueError && (
                  <p role="alert" className="form-error">
                    {issueError}
                  </p>
                )}
                <div className="wo-issue-cta">
                  <p className="wo-muted">
                    아래 <strong>지금 발급하기</strong>는 저장 → 평가 승인(본인)
                    → 지시서 발급 → 배정 인원 이메일 전송을 한 번에 처리합니다.
                    PTW 필요 작업은 저장 후 허가를 신청하세요.
                  </p>
                </div>
              </>
            )}
            {/* 이전·임시저장·다음(마지막 단계에선 발급). 좁은 화면에서 아래 고정.
              주된 다음 행동 하나만 채워진 버튼이라 엄지가 갈 곳이 정해진다. */}
            <div className="wo-actions">
              {step > 0 && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => goTo(step - 1)}
                >
                  <ArrowLeft size={14} />
                  이전
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
              {step < 3 ? (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => goTo(step + 1)}
                >
                  다음
                  <ArrowRight size={14} />
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={submitIssue}
                  disabled={issuePending || pending || data.ptwRequired}
                >
                  <Send size={14} />
                  {issuePending ? "발급 중..." : "지금 발급하기"}
                </button>
              )}
            </div>
          </form>
          {step === 3 && review && (
            <fieldset className="wo-review" disabled={dirty}>
              {dirty && (
                <p className="wo-notice" role="status">
                  고친 내용이 아직 저장되지 않았습니다. 아래 검토·발급은 마지막
                  임시저장본에 적용되므로 먼저 임시저장하세요.
                </p>
              )}
              {review}
            </fieldset>
          )}
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
      {footer}
      {dialog}
    </div>
  );
}

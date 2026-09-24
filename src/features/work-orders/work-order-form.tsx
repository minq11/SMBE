"use client";
import type { RiskCriteria } from "@/features/company/risk-criteria";
import {
  cloneElement,
  useActionState,
  useEffect,
  useId,
  useMemo,
  useState,
  useTransition,
  type ReactElement,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  CheckCircle2,
  FileText,
  Plus,
  Save,
  Send,
  ShieldCheck,
  Search,
  X,
} from "lucide-react";
import { FormErrorDialog } from "@/components/ui/form-error-dialog";
import { HelpDialog } from "@/components/ui/help-dialog";
import { JumpNav } from "@/components/ui/jump-nav";
import { PageHeader } from "@/components/ui/page-header";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { PeoplePicker } from "@/components/ui/people-picker";
import { PickerDialog } from "@/components/ui/picker-dialog";
import { RiskItemCard } from "@/features/assessments/risk-item-card";
import { Segmented } from "@/features/assessments/risk-level-picker";
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
    revisionId: string | null;
    revisionNo: number | null;
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
      currentControl: string;
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
    standardRevisionId: prefill.revisionId,
    method: prefill.method || base.method,
    ptwRequired: prefill.ptw_required,
    safetyInfo: prefill.safetyInfo,
    risks:
      prefill.risks.length > 0
        ? prefill.risks.map((r) => ({
            hazard: r.hazard,
            currentControl: r.currentControl,
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

const PARTS = [
  { id: "wo-info", label: "작업 정보" },
  { id: "wo-risk", label: "위험성평가" },
  { id: "wo-schedule", label: "일정·인원" },
  { id: "wo-check", label: "체크리스트" },
  { id: "wo-issue", label: "발급" },
];
const PTW_OPTIONS = [
  { value: "no", label: "불필요" },
  { value: "yes", label: "필요", tone: "warn" },
] as const;

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
 * 작성·편집 폼. 한 장이다: 작업 정보 → 위험성평가 → 일정·인원 → 체크리스트 →
 * 발급. 위의 구간 칩(JumpNav)이 좁은 화면에서 위에 붙고, 임시저장·발급은 아래에
 * 붙는다 (work-orders.css .wo-actions). 단계 마법사였을 때는 뒤 단계가 숨어
 * "위험요인 몇 개였지" 를 보러 이전을 두 번 눌러야 했고, 표준서에서 뭐가
 * 채워졌는지도 못 봤다.
 *
 * 표준서를 고르면 위험성평가·체크리스트는 채워진 채 접힌다. 고칠 일이 드물고,
 * 펼치면 그대로 고칠 수 있다. 표준서 없이 가는 간이평가만 처음부터 펼친다.
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
  criteria,
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
  /** 회사의 위험성 판단 기준 (읽기만). 초안에 싣지 않는다 — 서버가 평가 때 회사 값을 사본으로 남긴다. */
  criteria: RiskCriteria;
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
    setData((d) => ({ ...d, standardId: null, standardRevisionId: null }));
    setSimpleOverride(true);
  };
  const resetChoice = () => {
    setStandardId(null);
    setSimpleOverride(false);
    setData((d) => ({ ...d, standardId: null, standardRevisionId: null }));
  };
  const minutes = shiftMinutes(data.startTime, data.endTime);
  const pickedStandard =
    standardId != null ? standards.find((s) => s.id === standardId) : null;
  // 표준서가 많아질 수 있어 목록은 팝업에서 고른다 ("작업표준서 찾기").
  const [stdOpen, setStdOpen] = useState(false);
  const [stdQuery, setStdQuery] = useState("");
  const stdNeedle = stdQuery.trim().toLowerCase();
  const visibleStandards = stdNeedle
    ? standards.filter((s) => s.name.toLowerCase().includes(stdNeedle))
    : standards;
  // 위험성평가·체크리스트 본문. 표준서 모드에서는 접힘 안에, 간이평가는 그대로.
  const riskBody = (
    <>
      <p className="wo-muted">
        기본값으로 위험을 판단하지 않습니다. 현장에서 본 수준과 허용 여부를 직접
        고르세요.
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
      <ol className="risk-card-list">
        {data.risks.map((risk, i) => (
          <li key={i}>
            <RiskItemCard
              index={i}
              value={risk}
              members={members}
              criteria={criteria}
              onChange={(v) =>
                set(
                  "risks",
                  data.risks.map((r, index) => (index === i ? v : r)),
                )
              }
              onRemove={
                data.risks.length > 1
                  ? () =>
                      set(
                        "risks",
                        data.risks.filter((_, n) => n !== i),
                      )
                  : undefined
              }
            />
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="btn-secondary"
        disabled={data.risks.length >= 50}
        onClick={() =>
          set("risks", [
            ...data.risks,
            {
              hazard: "",
              currentControl: "",
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
              set("safetyInfo", { ...data.safetyInfo, [key]: e.target.value })
            }
            placeholder="확인한 내용을 적으세요. 해당 없음도 그렇게 적습니다."
          />
        </Field>
      ))}
      <Field label="근로자 의견 (선택)">
        <textarea
          rows={2}
          maxLength={2000}
          value={data.workerOpinion}
          onChange={(e) => set("workerOpinion", e.target.value)}
          placeholder="위험요인을 찾을 때 작업자가 말한 것"
        />
      </Field>
      {/* 판단 기준은 회사가 한 번 정하는 값이다. 위험요인 카드의 수준 옆
          물음표가 보여 주고, 저장 시 사본으로 함께 보관된다. */}
      <PeoplePicker
        legend="평가에 실제 참여한 근로자"
        members={members}
        selected={data.participantIds}
        onToggle={(id) => toggle("participantIds", id)}
      />
    </>
  );
  const checkBody = (
    <>
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
                      data[key].map((v, n) => (n === i ? e.target.value : v)),
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
    </>
  );
  const riskCount = data.risks.filter((r) => r.hazard.trim()).length;
  return (
    <div className="wo-editor">
      <PageHeader title={data.name || title} />
      {mode !== "idle" && <JumpNav items={PARTS} />}
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
            <FormErrorDialog message={state?.error} nonce={state} />
            <section className="wo-part" id="wo-info">
              <h2>작업 정보</h2>
              <div className="wo-std-picker">
                <h3 className="wo-std-picker-title">이 지시서의 작업표준서</h3>
                {mode === "standard" && pickedStandard ? (
                  // 고른 표준서 한 장. × 로 취소하면 아래 단추들이 다시 나온다.
                  <div className="wo-std-picked" role="group" aria-label="선택한 작업표준서">
                    <span className="wo-std-option-icon is-active">
                      <CheckCircle2 size={16} />
                    </span>
                    <span className="wo-std-option-copy">
                      <strong>
                        {pickedStandard.name}
                        {pickedStandard.prefill?.revisionNo
                          ? ` ${pickedStandard.prefill.revisionNo}판`
                          : ""}
                      </strong>
                      <small>
                        현재 승인 위험성평가 포함
                        {pickedStandard.ptw_required ? " · PTW 필요" : ""}
                      </small>
                    </span>
                    <button
                      type="button"
                      className="wo-std-clear"
                      aria-label="표준서 선택 취소"
                      onClick={resetChoice}
                    >
                      <X size={18} />
                    </button>
                  </div>
                ) : (
                  <>
                    {standards.length > 0 ? (
                      <p className="wo-muted">
                        표준서를 고르면 승인된 위험성평가와 작업방법·체크리스트가
                        함께 채워집니다. 표준서가 없는 1회성 작업만 &lsquo;표준서
                        없이 진행&rsquo; 을 쓰세요.
                      </p>
                    ) : (
                      <p className="wo-muted">
                        등록된 작업표준서가 없습니다. 반복 작업이면 표준서를 먼저
                        만드세요. 1회성이면 표준서 없이 진행하고 위험성평가를
                        아래에서 직접 적습니다.
                      </p>
                    )}
                    <div className="wo-std-picker-actions">
                      {standards.length > 0 && (
                        <button
                          type="button"
                          className="primary-button"
                          onClick={() => setStdOpen(true)}
                        >
                          <Search size={13} /> 작업표준서 찾기
                        </button>
                      )}
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
                      {mode === "simple" && (
                        <button
                          type="button"
                          className="text-button"
                          onClick={resetChoice}
                        >
                          다시 선택
                        </button>
                      )}
                    </div>
                  </>
                )}
                <PickerDialog
                  open={stdOpen}
                  onClose={() => setStdOpen(false)}
                  title="작업표준서 찾기"
                  query={stdQuery}
                  onQuery={setStdQuery}
                  searchLabel="표준서 이름 검색"
                  searchPlaceholder="표준서 이름 검색"
                >
                  <ul className="wo-std-list wo-std-list--dialog" role="list">
                    {visibleStandards.map((s) => {
                      const active = standardId === s.id;
                      return (
                        <li key={s.id}>
                          <button
                            type="button"
                            className={`wo-std-option${active ? " is-active" : ""}`}
                            onClick={() => {
                              applyStandard(s.id);
                              setStdOpen(false);
                            }}
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
                                현재 승인 위험성평가 포함
                                {s.prefill?.revisionNo
                                  ? ` · ${s.prefill.revisionNo}판`
                                  : ""}
                                {s.ptw_required ? " · PTW 필요" : ""}
                              </small>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                    {visibleStandards.length === 0 && (
                      <li className="wo-muted">
                        &lsquo;{stdQuery}&rsquo; 에 맞는 표준서가 없습니다.
                      </li>
                    )}
                  </ul>
                </PickerDialog>
                {mode === "simple" && (
                  <p className="wo-std-note wo-std-note--warn">
                    <FileText size={13} /> 표준서 없이 진행합니다. 위험성평가를
                    아래에서 직접 적고 승인합니다. 같은 작업이 반복되면 발급 뒤
                    표준서로 등록해 두세요.
                  </p>
                )}
                {mode === "idle" && (
                  <p className="wo-std-note wo-std-note--warn">
                    <FileText size={13} /> 표준서를 고르거나 &lsquo;표준서 없이
                    진행&rsquo; 을 눌러야 작업 정보를 적을 수 있습니다.
                  </p>
                )}
              </div>
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
                  <div className="wo-ptw">
                    <Segmented
                      label="위험작업허가(PTW)"
                      value={data.ptwRequired ? "yes" : "no"}
                      options={PTW_OPTIONS}
                      onChange={(v) => set("ptwRequired", v === "yes")}
                    />
                    <HelpDialog
                      title="위험작업허가(PTW)"
                      trigger="어떤 작업이 PTW 대상인가요?"
                    >
                      <PtwHelp />
                    </HelpDialog>
                  </div>
                  {data.ptwRequired && (
                    <p className="wo-notice">
                      PTW가 필요한 작업은 저장 후 지시서 화면에서 허가를
                      신청하세요. 승인되면 자동 발급됩니다. 필요로 저장한 뒤에는
                      불필요로 내릴 수 없습니다.
                    </p>
                  )}
                </>
              )}
            </section>

            {mode !== "idle" && (
              <>
                <section className="wo-part" id="wo-risk">
                  <h2>위험성평가</h2>
                  {mode === "standard" ? (
                    <details className="std-fold wo-fold" key={standardId}>
                      <summary>
                        표준서 평가 {riskCount}건이 채워졌습니다
                        <small>펼쳐서 확인·수정</small>
                      </summary>
                      {riskBody}
                    </details>
                  ) : (
                    riskBody
                  )}
                </section>

                <section className="wo-part" id="wo-schedule">
                  <h2>일정·인원</h2>
                  <p className="wo-muted">
                    한국시간 기준입니다. 종료시간이 시작시간보다 이르면 다음 날
                    끝나는 야간작업으로 봅니다. 주·야간조는 지시서를 따로
                    만드세요.
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
                    하루 작업시간: {Math.floor(minutes / 60)}시간 {minutes % 60}
                    분 · 최대 16시간
                  </p>
                  <Field label="작업 장소">
                    <input
                      value={data.location}
                      maxLength={200}
                      onChange={(e) => set("location", e.target.value)}
                      placeholder={
                        locations.length > 0
                          ? "회사 등록 장소 중 선택하거나 직접 입력"
                          : "직접 입력"
                      }
                      list={
                        locations.length > 0 ? "wo-location-list" : undefined
                      }
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
                    새 구성원이 합류하면 임시저장하고 이 화면을 다시 여세요.
                  </p>
                </section>

                <section className="wo-part" id="wo-check">
                  <h2>체크리스트</h2>
                  {mode === "standard" ? (
                    <details className="std-fold wo-fold" key={standardId}>
                      <summary>
                        TBM {data.tbm.length}개 · 작업 중 {data.during.length}
                        개가 채워졌습니다
                        <small>펼쳐서 확인·수정</small>
                      </summary>
                      {checkBody}
                    </details>
                  ) : (
                    checkBody
                  )}
                </section>

                <section className="wo-part" id="wo-issue">
                  <h2>발급</h2>
                  <p className="wo-muted">
                    <strong>지금 발급하기</strong>는 저장 → 평가 승인(본인) →
                    발급 → 배정 인원에게 링크 전송을 한 번에 합니다. 다른
                    관리자의 검토가 필요하면 임시저장한 뒤 아래 검토·발급에서
                    요청하세요.
                  </p>
                  <p className="wo-notice">
                    발급 후 작업 내용·평가·체크리스트는 고정됩니다. 바꾸려면
                    취소 후 복사해 다시 발급하세요.
                    {data.ptwRequired
                      ? " PTW 필요 작업은 저장 후 허가를 신청하면 승인과 함께 발급됩니다."
                      : ""}
                  </p>
                  <FormErrorDialog message={issueError} nonce={issueError} />
                </section>
              </>
            )}
            {/* 임시저장·발급. 좁은 화면에서 아래 고정. 주된 행동 하나만 채워진
              버튼이라 엄지가 갈 곳이 정해진다. */}
            {mode !== "idle" && (
              <div className="wo-actions">
                <button
                  type="submit"
                  className="btn-secondary"
                  disabled={pending || issuePending}
                >
                  <Save size={14} />
                  {pending ? "저장 중…" : "임시저장"}
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={submitIssue}
                  disabled={issuePending || pending || data.ptwRequired}
                >
                  <Send size={14} />
                  {issuePending ? "발급 중..." : "지금 발급하기"}
                </button>
              </div>
            )}
          </form>
          {review && (
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
            입력은 이 기기에 잠시 보관됩니다. 화면을 나가기 전에 임시저장하세요.
          </p>
        </aside>
      </div>
      {footer}
      {dialog}
    </div>
  );
}

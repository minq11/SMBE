"use client";
import type { RiskCriteria } from "@/features/company/risk-criteria";
import {
  useActionState,
  useEffect,
  useId,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  CheckCircle2,
  FileText,
  History,
  Plus,
  Save,
  Send,
  ShieldCheck,
  Search,
  X,
} from "lucide-react";
import {
  FloatField,
  FloatSelect,
  FloatTextarea,
} from "@/components/ui/float-field";
import { FormErrorDialog } from "@/components/ui/form-error-dialog";
import { HelpDialog } from "@/components/ui/help-dialog";
import { JumpNav } from "@/components/ui/jump-nav";
import { PageHeader } from "@/components/ui/page-header";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  PeoplePicker,
  PeoplePickerDialog,
} from "@/components/ui/people-picker";
import { PermitFields } from "./permit-fields";
import { SessionEditor } from "./session-editor";
import { PickerDialog } from "@/components/ui/picker-dialog";
import { RiskItemCard } from "@/features/assessments/risk-item-card";
import { Segmented } from "@/features/assessments/risk-level-picker";
import { PtwHelp } from "@/features/standards/ptw-help";
import { saveOrderAction, saveAndIssueAction } from "./actions";
import {
  blankPermit,
  generateSessions,
  permitProblem,
  withSessionRange,
  type WorkDraft,
  type MemberOption,
} from "./model";

/** 이전 지시서 불러오기 창의 한 줄 (server/work-orders.ts listOrdersForCopy) */
export type PastOrderOption = {
  id: string;
  name: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  location: string;
  standard_name: string | null;
};
export type StandardPickerOption = {
  id: string;
  name: string;
  ptw_required: boolean;
  /** 고를 수 있나. 위험성평가가 없거나 만료면 목록에는 보이되 못 고른다. */
  usable: boolean;
  blockedReason: string | null;
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
  { id: "wo-schedule", label: "일정·인원·장소" },
  { id: "wo-check", label: "체크리스트" },
];
const NEW_STANDARD_HREF = `/standards/new?return=${encodeURIComponent("/work-orders/new")}`;
const CUSTOM_LOCATION = "__custom__";
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
  // 옛 초안(허가 항목·회차 목록이 생기기 전)은 permit 과 sessions 가 없다. 회차는
  // 그때의 기간(매일)에서 만든다. 새 초안은 빈 목록으로 시작한다.
  const base: WorkDraft = {
    ...initial,
    permit: initial.permit ?? blankPermit(),
    sessions:
      initial.sessions ??
      generateSessions(
        initial.startDate,
        initial.endDate,
        initial.startTime,
        initial.endTime,
      ),
  };
  if (initialStandardId) {
    const s = standards.find((x) => x.id === initialStandardId);
    if (s?.prefill) {
      return {
        ...mergeStandardIntoDraft(base, s.prefill),
        standardId: initialStandardId,
      };
    }
  }
  return { ...base, standardId: base.standardId ?? null };
}

/**
 * 작성·편집 폼. 한 장이다: 작업 정보 → 위험성평가 → 일정·인원·장소 → 체크리스트.
 * 위의 구간 칩(JumpNav)이 좁은 화면에서 위에 붙고, 임시저장·발급은 아래에
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
  pastOrders = [],
  criteria,
  title,
  description,
  notice,
  review,
  footer,
  deleteButton,
  userId,
}: {
  id: string;
  revision: number;
  initial: WorkDraft;
  members: MemberOption[];
  standards?: StandardPickerOption[];
  initialStandardId?: string | null;
  locations?: LocationOption[];
  /** 비어 있으면 "이전 지시서 불러오기" 단추를 그리지 않는다 (편집 화면, 복사할 것이 없는 회사). */
  pastOrders?: PastOrderOption[];
  /** 회사의 위험성 판단 기준 (읽기만). 초안에 싣지 않는다 — 서버가 평가 때 회사 값을 사본으로 남긴다. */
  criteria: RiskCriteria;
  /** 작업명이 비어 있을 때 머리말에 보일 제목 */
  title: string;
  description?: ReactNode;
  /** 머리말 아래에 띄울 알림 (발급 실패 배너 등) */
  notice?: ReactNode;
  /** 마지막 단계 폼 뒤에 붙는 검토·발급 명령 */
  review?: ReactNode;
  /** 허가 승인자·작업책임자의 기본값(본인) */
  userId?: string;
  /** 폼 전체 아래에 붙는 것 (변경 이력) */
  footer?: ReactNode;
  /** 아래 띠의 임시저장 왼쪽에 붙는 초안 삭제 단추 */
  deleteButton?: ReactNode;
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
  // 등록 장소에 없는 값이면 직접 입력 칸을 연다 (예전 초안·복사본).
  const [locationCustom, setLocationCustom] = useState(
    () =>
      locations.length > 0 &&
      initial.location !== "" &&
      !locations.some((l) => l.label === initial.location),
  );
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

  const formDomId = useId();
  const submitIssue = async () => {
    setIssueError(null);
    // PTW 필요면 허가 항목이 채워져야 신청까지 간다. 서버가 다시 검사한다.
    if (data.ptwRequired) {
      const problem = permitProblem(data.permit ?? blankPermit());
      if (problem) {
        setIssueError(problem);
        return;
      }
    }
    const selfApprove =
      data.ptwRequired && !!userId && data.permit.approverId === userId;
    const approverName = members.find(
      (m) => m.user_id === data.permit.approverId,
    )?.display_name;
    const message = !data.ptwRequired
      ? "저장 → 위험성평가 승인(본인) → 발급 → 배정 인원에게 링크 전송이 순차 진행되고, 발급 후 내용이 고정됩니다."
      : selfApprove
        ? "저장 → 위험성평가 승인(본인) → 위험작업허가 신청·승인(본인, 자가 승인 이력이 남습니다) → 발급 → 배정 인원에게 링크 전송이 순차 진행되고, 발급 후 내용이 고정됩니다."
        : `저장 → 위험성평가 승인(본인) → 위험작업허가 신청까지 진행됩니다. 승인자(${approverName ?? "지정 관리자"})가 허가를 승인하면 발급되고 링크가 전송됩니다.`;
    if (
      !(await confirm(message, {
        title: data.ptwRequired
          ? "허가 신청과 함께 발급할까요?"
          : "지금 발급할까요?",
        confirmLabel: data.ptwRequired && !selfApprove ? "허가 신청" : "발급",
      }))
    )
      return;
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
    if (!s?.prefill || !s.usable) return;
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
  const pickedStandard =
    standardId != null ? standards.find((s) => s.id === standardId) : null;
  // 표준서가 많아질 수 있어 목록은 팝업에서 고른다 ("작업표준서 찾기").
  const [stdOpen, setStdOpen] = useState(false);
  const [stdQuery, setStdQuery] = useState("");
  const stdNeedle = stdQuery.trim().toLowerCase();
  const visibleStandards = stdNeedle
    ? standards.filter((s) => s.name.toLowerCase().includes(stdNeedle))
    : standards;
  // 이전 지시서 불러오기 창. 표준서 찾기와 같은 문법 — 전체가 보이고 검색하면 거른다.
  const [pastOpen, setPastOpen] = useState(false);
  const [pastQuery, setPastQuery] = useState("");
  const pastNeedle = pastQuery.trim().toLowerCase();
  const visiblePast = pastNeedle
    ? pastOrders.filter((o) => o.name.toLowerCase().includes(pastNeedle))
    : pastOrders;
  // 위험성평가·체크리스트 본문. 표준서 모드에서는 접힘 안에, 간이평가는 그대로.
  const riskBody = (
    <>
      <p className="wo-muted">
        기본값으로 위험을 판단하지 않습니다. 현장에서 본 수준과 허용 여부를 직접
        고르세요.
      </p>
      <div className="wo-columns">
        <FloatSelect
          id="wo-assessment-kind"
          label="실시 구분"
          value={data.assessmentKind}
          onChange={(e) =>
            set("assessmentKind", e.target.value as WorkDraft["assessmentKind"])
          }
        >
          <option value="FIRST">최초</option>
          <option value="PERIODIC">정기</option>
          <option value="AD_HOC">수시</option>
          <option value="CONTINUOUS">상시</option>
        </FloatSelect>
        <FloatField
          id="wo-performed-on"
          label="평가 실시일"
          type="date"
          value={data.performedOn}
          onChange={(e) => set("performedOn", e.target.value)}
        />
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
        <FloatTextarea
          key={key}
          id={"wo-safety-" + key}
          label={label}
          value={data.safetyInfo[key]}
          maxLength={4000}
          onChange={(e) =>
            set("safetyInfo", { ...data.safetyInfo, [key]: e.target.value })
          }
          hint="확인한 내용을 적으세요. 해당 없음도 그렇게 적습니다."
        />
      ))}
      <FloatTextarea
        id="wo-worker-opinion"
        label="근로자 의견 (선택)"
        rows={2}
        maxLength={2000}
        value={data.workerOpinion}
        onChange={(e) => set("workerOpinion", e.target.value)}
        hint="위험요인을 찾을 때 작업자가 말한 것"
      />
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
              <FloatField
                id={`wo-${key}-item-${i}`}
                className="float-field--flush"
                label={title + " 항목 " + (i + 1)}
                maxLength={500}
                value={value}
                onChange={(e) =>
                  set(
                    key,
                    data[key].map((v, n) => (n === i ? e.target.value : v)),
                  )
                }
              />
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
      {(description || pastOrders.length > 0) && (
        <div className="wo-editor-intro">
          {description && <p className="wo-editor-lead">{description}</p>}
          {pastOrders.length > 0 && (
            <button
              type="button"
              className="btn-secondary wo-past-open"
              onClick={() => setPastOpen(true)}
            >
              <History size={14} /> 이전 지시서 불러오기
            </button>
          )}
        </div>
      )}
      {pastOrders.length > 0 && (
        <PickerDialog
          open={pastOpen}
          onClose={() => setPastOpen(false)}
          title="이전 지시서 불러오기"
          query={pastQuery}
          onQuery={setPastQuery}
          searchLabel="작업명 검색"
          searchPlaceholder="작업명 검색"
          done={false}
        >
          <ul className="wo-std-list wo-std-list--dialog" role="list">
            {visiblePast.map((o) => (
              <li key={o.id}>
                {/* 고르면 그 지시서를 채운 새 작성 화면으로 간다 (?copy=). 작업일·발급
                    정보는 비운 채 온다 — 그래서 "복사 후 재발행" 이다. */}
                <Link
                  href={"/work-orders/new?copy=" + o.id}
                  className="wo-std-option"
                  prefetch={false}
                >
                  <span className="wo-std-option-icon">
                    <History size={16} />
                  </span>
                  <span className="wo-std-option-copy">
                    <strong>{o.name}</strong>
                    <small>
                      {o.start_date
                        ? o.start_date +
                          (o.end_date && o.end_date !== o.start_date
                            ? " ~ " + o.end_date
                            : "")
                        : "일정 없음"}
                      {o.location ? " · " + o.location : ""}
                      {o.standard_name ? " · 표준서 " + o.standard_name : ""}
                    </small>
                  </span>
                </Link>
              </li>
            ))}
            {visiblePast.length === 0 && (
              <li className="wo-muted">
                &lsquo;{pastQuery}&rsquo; 에 맞는 지시서가 없습니다.
              </li>
            )}
          </ul>
        </PickerDialog>
      )}
      <div className="wo-editor-grid">
        <div className="wo-section">
          <form id={formDomId} action={submitSave} className="wo-editor-form">
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
                  <div
                    className="wo-std-picked"
                    role="group"
                    aria-label="선택한 작업표준서"
                  >
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
                        표준서를 고르면 승인된 위험성평가와
                        작업방법·체크리스트가 함께 채워집니다. 표준서가 없는
                        1회성 작업만 &lsquo;표준서 없이 진행&rsquo; 을 쓰세요.
                      </p>
                    ) : (
                      <p className="wo-muted">
                        등록된 작업표준서가 없습니다. 반복 작업이면 표준서를
                        먼저 만드세요. 1회성이면 표준서 없이 진행하고
                        위험성평가를 아래에서 직접 적습니다.
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
                      {/* 표준서가 하나라도 있으면 새로 만들기는 찾기 창 안에만 있다 —
                          찾아보고 없을 때 만드는 순서라서. */}
                      {standards.length === 0 && (
                        <Link
                          href={NEW_STANDARD_HREF}
                          className="primary-button"
                          prefetch={false}
                        >
                          <Plus size={13} /> 새 표준서 만들기
                        </Link>
                      )}
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
                  done={false}
                  extra={
                    <Link
                      href={NEW_STANDARD_HREF}
                      className="text-button"
                      prefetch={false}
                    >
                      <Plus size={14} /> 새 표준서 만들기
                    </Link>
                  }
                >
                  <ul className="wo-std-list wo-std-list--dialog" role="list">
                    {visibleStandards.map((s) => {
                      const active = standardId === s.id;
                      return (
                        <li key={s.id}>
                          <button
                            type="button"
                            className={`wo-std-option${active ? " is-active" : ""}${s.usable ? "" : " is-blocked"}`}
                            disabled={!s.usable}
                            aria-disabled={!s.usable}
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
                                {s.usable
                                  ? "현재 승인 위험성평가 포함"
                                  : s.blockedReason}
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
                  <FloatField
                    id="wo-name"
                    label="작업명"
                    value={data.name}
                    maxLength={120}
                    onChange={(e) => set("name", e.target.value)}
                  />
                  <FloatTextarea
                    id="wo-method"
                    label="작업 단계·방법"
                    rows={6}
                    value={data.method}
                    maxLength={4000}
                    onChange={(e) => set("method", e.target.value)}
                    hint="실제 작업 순서와 방법을 작성하세요."
                  />
                  <FloatField
                    id="wo-group-label"
                    label="조 이름 (선택)"
                    value={data.groupLabel}
                    maxLength={40}
                    onChange={(e) => set("groupLabel", e.target.value)}
                    hint="주간조 / 야간조"
                  />
                  <div className="wo-ptw">
                    <Segmented
                      label="위험작업허가(PTW)"
                      value={data.ptwRequired ? "yes" : "no"}
                      options={PTW_OPTIONS}
                      onChange={(v) => {
                        const on = v === "yes";
                        setData((d) => ({
                          ...d,
                          ptwRequired: on,
                          permit:
                            on && userId
                              ? {
                                  ...(d.permit ?? blankPermit()),
                                  approverId: d.permit?.approverId || userId,
                                  responsibleId:
                                    d.permit?.responsibleId || userId,
                                }
                              : (d.permit ?? blankPermit()),
                        }));
                      }}
                    />
                    <HelpDialog
                      title="위험작업허가(PTW)"
                      trigger="어떤 작업이 PTW 대상인가요?"
                    >
                      <PtwHelp />
                    </HelpDialog>
                  </div>
                  {data.ptwRequired && (
                    <PermitFields
                      value={data.permit ?? blankPermit()}
                      onChange={(permit) => set("permit", permit)}
                      members={members}
                      locations={locations}
                      userId={userId}
                    />
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
                  <h2>일정·인원·장소</h2>
                  <p className="wo-muted">
                    회차는 날짜마다 하나입니다. 주·야간조는 지시서를 따로
                    만드세요.
                  </p>
                  <SessionEditor
                    value={data.sessions ?? []}
                    onChange={(sessions) =>
                      setData((d) => withSessionRange({ ...d, sessions }))
                    }
                  />
                  {/* 작업 회차·작업자 배정과 같은 소제목. 장소 칸만 이름 없이 있으면
                      회차 목록의 꼬리로 읽힌다. */}
                  <div className="wo-sub-head">작업 장소</div>
                  {/* 등록 장소는 고르는 칸으로. datalist 는 아이폰에서 목록이 안 열리고
                      값이 있으면 목록을 걸러 버려, 고를 수 있는 칸으로 안 보였다. */}
                  {locations.length > 0 && (
                    <FloatSelect
                      id="wo-location-pick"
                      label="장소 선택"
                      value={locationCustom ? CUSTOM_LOCATION : data.location}
                      onChange={(e) => {
                        const custom = e.target.value === CUSTOM_LOCATION;
                        setLocationCustom(custom);
                        set("location", custom ? "" : e.target.value);
                      }}
                    >
                      <option value="">장소 선택</option>
                      {locations.map((l) => (
                        <option key={l.id} value={l.label}>
                          {l.label}
                        </option>
                      ))}
                      <option value={CUSTOM_LOCATION}>직접 입력…</option>
                    </FloatSelect>
                  )}
                  {(locations.length === 0 || locationCustom) && (
                    <FloatField
                      id="wo-location"
                      label={locations.length > 0 ? "장소 직접 입력" : "장소"}
                      value={data.location}
                      maxLength={200}
                      onChange={(e) => set("location", e.target.value)}
                      autoComplete="off"
                    />
                  )}
                  <PeoplePickerDialog
                    legend="작업자 배정"
                    buttonLabel="작업자 선택"
                    members={members}
                    selected={data.assigneeIds}
                    onToggle={(id) => toggle("assigneeIds", id)}
                    inviteHref="/company/members"
                  />
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
              </>
            )}
          </form>
          {/* 다른 관리자 검토 흐름과 삭제·이력은 접어 둔다. 보통은 위 폼과 아래
              단추 두 개면 끝나고, 저장 뒤에 글이 늘어나 헷갈린다는 지적이 있었다. */}
          {review && (
            <details className="std-fold wo-fold wo-review-fold">
              <summary>
                다른 관리자에게 검토·승인 맡기기 (선택)
                <small>펼쳐서 요청</small>
              </summary>
              <fieldset className="wo-review" disabled={dirty}>
                {dirty && (
                  <p className="wo-muted" role="status">
                    고친 내용은 임시저장해야 여기에 반영됩니다.
                  </p>
                )}
                {review}
              </fieldset>
            </details>
          )}
          {footer}
          {/* 임시저장·발급. 좁은 화면에서 아래 고정. 폼 밖(칸의 맨 끝)에 두어야
              검토·이력이 뒤에 붙어도 띠가 화면 바닥에 남는다 — 단추는 form 속성으로
              위 폼을 제출한다. */}
          {mode !== "idle" && (
            <div className="wo-actions">
              {deleteButton}
              <button
                type="submit"
                form={formDomId}
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
                disabled={issuePending || pending}
              >
                <Send size={14} />
                {issuePending ? "발급 중..." : "지금 발급하기"}
              </button>
            </div>
          )}
          {/* 발급 오류는 창으로 뜬다 — 전에 있던 "발급" 구간은 이 설명과 이 창의
              자리였을 뿐이라 뺐다. 무엇을 하는지는 발급 확인 창이 말한다. */}
          <FormErrorDialog message={issueError} nonce={issueError} />
        </div>
        <aside className="wo-summary">
          <h2>작성 중인 작업</h2>
          <strong>{data.name || "작업명을 입력하세요"}</strong>
          <dl>
            <dt>장소</dt>
            <dd>{data.location || "미입력"}</dd>
            <dt>기간</dt>
            <dd data-tone={data.sessions?.length ? undefined : "warn"}>
              {data.sessions?.length
                ? `${data.startDate} ~ ${data.endDate} · ${data.sessions.length}회차`
                : "회차 없음"}
            </dd>
            <dt>배정</dt>
            <dd>{data.assigneeIds.length}명</dd>
            <dt>평가 참여</dt>
            <dd>{data.participantIds.length}명</dd>
            <dt>PTW</dt>
            <dd>{data.ptwRequired ? "필요 · 발급 시 허가 신청" : "불필요"}</dd>
          </dl>
          <p className="wo-muted">
            입력은 이 기기에 잠시 보관됩니다. 화면을 나가기 전에 임시저장하세요.
          </p>
        </aside>
      </div>
      {dialog}
    </div>
  );
}

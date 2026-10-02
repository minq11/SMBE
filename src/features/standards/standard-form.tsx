"use client";
import type { RiskCriteria } from "@/features/company/risk-criteria";
import { PeoplePickerDialog } from "@/components/ui/people-picker";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Save, Trash2, X, ListChecks } from "lucide-react";
import { RiskItemCard } from "@/features/assessments/risk-item-card";
import { FormErrorDialog } from "@/components/ui/form-error-dialog";
import { FloatField, FloatTextarea } from "@/components/ui/float-field";
import { HelpDialog } from "@/components/ui/help-dialog";
import { JumpNav } from "@/components/ui/jump-nav";
import { SAFETY_INFO_HINTS } from "@/features/assessments/model";
import { PtwHelp } from "./ptw-help";
import { PpePicker } from "./ppe-picker";
import { BasicHelp, ChecklistHelp, MethodHelp, RiskHelp } from "./section-help";

// 빈칸의 예시. 처음 쓰는 사장님이 "뭘 적지" 하지 않게.
const STEP_HINTS = [
  "예: 전원 차단 후 잠금장치 걸기",
  "예: 금형 고정 볼트 풀기",
];
const TBM_HINTS = [
  "예: 보호구(장갑·보안경) 착용 확인",
  "예: 잠금장치 걸림 확인",
];
const DURING_HINTS = ["예: 회전부 덮개 유지", "예: 작업 구역 출입 통제"];
const hint = (list: string[], i: number, fallback: string) =>
  list[i] ?? fallback;
import { createStandardAction, type StandardActionState } from "./actions";

type Risk = {
  hazard: string;
  current_control: string;
  initial_risk_level: "" | "HIGH" | "MID" | "LOW";
  initial_allowable: "" | "yes" | "no";
  reduction_measure: string;
  responsible_user_id: string;
  planned_completion_date: string;
};

type Draft = {
  name: string;
  ptw_required: boolean;
  ppe: string[];
  caution: string;
  performed_on: string;
  work_method: string;
  steps: string[];
  checklist_tbm: string[];
  checklist_during: string[];
  safety_info: {
    equipment: string;
    materials: string;
    environment: string;
    history: string;
  };
  risks: Risk[];
  worker_opinion: string;
  participant_user_ids: string[];
};

type Member = { user_id: string; display_name: string; role: string };

function blankDraft(): Draft {
  const today = new Date(new Date().getTime() + 9 * 3600_000)
    .toISOString()
    .slice(0, 10);
  return {
    name: "",
    ptw_required: false,
    ppe: [],
    caution: "",
    performed_on: today,
    work_method: "",
    // 단계·체크리스트는 두 칸씩. 한 칸이면 "하나만 쓰면 되나" 로 읽힌다.
    steps: ["", ""],
    checklist_tbm: ["", ""],
    checklist_during: ["", ""],
    safety_info: { equipment: "", materials: "", environment: "", history: "" },
    risks: [
      {
        hazard: "",
        current_control: "",
        initial_risk_level: "",
        initial_allowable: "",
        reduction_measure: "",
        responsible_user_id: "",
        planned_completion_date: "",
      },
    ],
    worker_opinion: "",
    participant_user_ids: [],
  };
}

export function StandardForm({
  criteria,
  members,
  returnHref,
  isPro,
}: {
  /** 회사의 위험성 판단 기준 (읽기만) */
  criteria: RiskCriteria;
  members: Member[];
  returnHref?: string;
  /** 유료면 저장 뒤 단계마다 사진을 붙일 수 있다. */
  isPro: boolean;
}) {
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [state, formAction, pending] = useActionState<
    StandardActionState,
    FormData
  >(createStandardAction, undefined);

  // 미저장 입력은 이 기기에 보관했다가 다시 열면 묻는다 (헌법 5장).
  // 표준서는 작업 단계·체크리스트까지 한 화면에서 길게 쓰는 폼이라, 다른 메뉴에
  // 다녀오면 전부 빈칸이 되는 것이 가장 아픈 자리였다. 작업지시 폼과 같은 방식.
  const BACKUP_KEY = "smbe.std-draft.new";
  const empty = useMemo(() => JSON.stringify(blankDraft()), []);
  const dirty = JSON.stringify(draft) !== empty;
  const [backup, setBackup] = useState<{ at: string; data: Draft } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(BACKUP_KEY);
      if (!raw) return;
      const stored = JSON.parse(raw) as { at: string; data: Draft };
      if (JSON.stringify(stored.data) === empty) {
        localStorage.removeItem(BACKUP_KEY);
        return;
      }
      const timer = setTimeout(() => setBackup(stored), 0);
      return () => clearTimeout(timer);
    } catch {
      /* 보관본이 깨졌으면 없는 것으로 */
    }
    // 처음 열릴 때 한 번만 본다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          BACKUP_KEY,
          JSON.stringify({ at: new Date().toISOString(), data: draft }),
        );
      } catch {
        /* 저장소가 막혀 있으면 보관하지 않는다 */
      }
    }, 400);
    return () => clearTimeout(timer);
    // state 가 깨어 있어야 한다: 저장이 막혀 오류가 돌아오면 폼은 그대로 남는데
    // 제출 때 보관본을 지웠으므로, 여기서 다시 보관해 두지 않으면 그 뒤에 나갈 때
    // 전부 날아간다.
  }, [draft, dirty, state]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const clearBackup = () => {
    try {
      localStorage.removeItem(BACKUP_KEY);
    } catch {
      /* ignore */
    }
  };

  const setField = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const updateStringList = (
    key: "steps" | "checklist_tbm" | "checklist_during",
    idx: number,
    value: string,
  ) => {
    setDraft((d) => {
      const next = [...d[key]];
      next[idx] = value;
      return { ...d, [key]: next };
    });
  };

  const addStringItem = (key: "steps" | "checklist_tbm" | "checklist_during") =>
    setDraft((d) => ({ ...d, [key]: [...d[key], ""] }));

  const removeStringItem = (
    key: "steps" | "checklist_tbm" | "checklist_during",
    idx: number,
  ) =>
    setDraft((d) => {
      if (d[key].length <= 1) return d;
      return { ...d, [key]: d[key].filter((_, i) => i !== idx) };
    });

  const addRisk = () =>
    setDraft((d) => ({
      ...d,
      risks: [
        ...d.risks,
        {
          hazard: "",
          current_control: "",
          initial_risk_level: "",
          initial_allowable: "",
          reduction_measure: "",
          responsible_user_id: "",
          planned_completion_date: "",
        },
      ],
    }));

  const removeRisk = (idx: number) =>
    setDraft((d) => {
      if (d.risks.length <= 1) return d;
      return { ...d, risks: d.risks.filter((_, i) => i !== idx) };
    });

  const toggleParticipant = (userId: string) =>
    setDraft((d) => ({
      ...d,
      participant_user_ids: d.participant_user_ids.includes(userId)
        ? d.participant_user_ids.filter((id) => id !== userId)
        : [...d.participant_user_ids, userId],
    }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // 새 스키마: 표준서 필드 + first_assessment 로 중첩
    const cleaned = {
      name: draft.name.trim(),
      ptw_required: draft.ptw_required,
      ppe: draft.ppe,
      caution: draft.caution.trim(),
      // 편집 폼과 같은 모양({ id?, text }). 새 표준서라 id 는 없다.
      steps: draft.steps
        .map((s) => s.trim())
        .filter(Boolean)
        .map((text) => ({ text })),
      checklist_tbm: draft.checklist_tbm.map((s) => s.trim()).filter(Boolean),
      checklist_during: draft.checklist_during
        .map((s) => s.trim())
        .filter(Boolean),
      first_assessment: {
        performed_on:
          draft.performed_on ||
          new Date(new Date().getTime() + 9 * 3600_000)
            .toISOString()
            .slice(0, 10),
        work_method: draft.work_method.trim(),
        safety_info: {
          equipment: draft.safety_info.equipment.trim(),
          materials: draft.safety_info.materials.trim(),
          environment: draft.safety_info.environment.trim(),
          history: draft.safety_info.history.trim(),
        },
        worker_opinion: draft.worker_opinion.trim(),
        risks: draft.risks.map((r) => ({
          hazard: r.hazard.trim(),
          current_control: r.current_control.trim(),
          initial_risk_level: r.initial_risk_level as "HIGH" | "MID" | "LOW",
          initial_allowable: r.initial_allowable === "yes",
          reduction_measure: r.reduction_measure.trim(),
          responsible_user_id: r.responsible_user_id || null,
          planned_completion_date: r.planned_completion_date || null,
        })),
        participant_user_ids: draft.participant_user_ids,
      },
    };
    const form = new FormData(e.target as HTMLFormElement);
    form.set("payload", JSON.stringify(cleaned));
    // 저장이 막히면(검증 실패) 폼은 그대로 남으므로 보관본도 그대로 둔다.
    // 성공하면 다른 화면으로 넘어가며 이 컴포넌트가 사라진다 — 그때 보관본이
    // 남아 있으면 다음에 새 표준서를 쓸 때 지난 내용이 되살아난다.
    clearBackup();
    formAction(form);
  };

  return (
    <form action={formAction} onSubmit={handleSubmit} className="std-form">
      <Link
        href={returnHref ?? "/standards"}
        className="text-button std-back-link"
      >
        <ArrowLeft size={13} /> {returnHref ? "지시서 작성으로" : "표준서 목록"}
      </Link>

      <header className="std-form-hero">
        <h1>새 표준서 만들기</h1>
        <p>
          작업방법 · 체크리스트 · 위험성평가를 한 번에 등록합니다. 저장하면 바로
          지시서에 쓸 수 있습니다. 나중에 바뀌면 상세 화면의 수정으로 고치고,
          작업이 크게 바뀌면 수시 위험성평가 회차를 추가하세요.
        </p>
      </header>

      <FormErrorDialog message={state?.error} nonce={state} />

      {backup && (
        <div className="draft-restore" role="status">
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
          <div className="draft-restore-actions">
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setDraft(backup.data);
                setBackup(null);
              }}
            >
              이어서 작성
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                clearBackup();
                setBackup(null);
              }}
            >
              버리기
            </button>
          </div>
        </div>
      )}

      {/* 긴 폼이라 구간으로 바로 간다. 좁은 화면에서는 위에 붙는다 (globals.css). */}
      {/* 표준서는 네 구간을 순서대로 채운다 — 칩과 머리에 번호가 있다. 위험성평가는
          번호 없이 따로 온다(별도 문서). */}
      <JumpNav
        items={[
          { id: "std-basic", label: "1 기본 정보" },
          { id: "std-method-section", label: "2 작업 방법" },
          { id: "std-caution", label: "3 주의사항" },
          { id: "std-checklist", label: "4 체크리스트" },
          { id: "std-risk", label: "위험성평가" },
        ]}
      />

      <section className="std-form-section" id="std-basic">
        <div className="std-section-head">
          <h2>
            <span className="std-step-no">1</span>기본 정보
          </h2>
          <HelpDialog title="기본 정보" variant="icon">
            <BasicHelp />
          </HelpDialog>
        </div>
        <FloatField
          className="float-field--flush"
          id="std-name"
          label="표준서명"
          name="name-display"
          value={draft.name}
          onChange={(e) => setField("name", e.target.value)}
          required
          maxLength={120}
          hint="예: 프레스 설비 정기 점검"
        />
        <div className="std-ptw">
          <label className="std-checkbox">
            <input
              type="checkbox"
              checked={draft.ptw_required}
              onChange={(e) => setField("ptw_required", e.target.checked)}
            />
            <span>이 작업은 위험작업허가(PTW)가 필요합니다</span>
          </label>
          <HelpDialog
            title="위험작업허가(PTW)"
            trigger="어떤 작업이 PTW 대상인가요?"
          >
            <PtwHelp />
          </HelpDialog>
        </div>
        <PpePicker value={draft.ppe} onChange={(ppe) => setField("ppe", ppe)} />
      </section>

      <section className="std-form-section" id="std-method-section">
        <div className="std-section-head">
          <h2>
            <span className="std-step-no">2</span>작업 방법
          </h2>
          <HelpDialog title="작업 방법" variant="icon">
            <MethodHelp />
          </HelpDialog>
        </div>
        <FloatTextarea
          className="float-field--flush"
          id="std-method"
          label="작업방법 요약"
          rows={3}
          maxLength={4000}
          value={draft.work_method}
          onChange={(e) => setField("work_method", e.target.value)}
          hint="이 작업의 전체 개요를 짧게 요약합니다."
        />
        <div className="form-field">
          <label>작업 단계</label>
          <ol className="std-list">
            {draft.steps.map((s, i) => (
              <li key={i}>
                <span className="std-list-number">{i + 1}</span>
                {/* 헌법 3장 예외: 번호가 붙은 목록 줄이라 칸마다 라벨이 없다 (빈칸 예시가 곧 안내) */}
                <input
                  type="text"
                  value={s}
                  onChange={(e) => updateStringList("steps", i, e.target.value)}
                  maxLength={500}
                  placeholder={hint(STEP_HINTS, i, `${i + 1}단계`)}
                />
                {/* 사진은 저장된 단계에만 붙는다 (첨부의 대상 id). 여기서는
                    클립이 그 사실을 말한다. */}
                <HelpDialog title="단계 사진" variant="icon" icon="clip">
                  {isPro ? (
                    <p>
                      표준서를 저장하면 단계마다 사진을 붙일 수 있습니다. 저장
                      뒤 상세 화면이나 수정 화면에서 이 단계의 클립을 누르세요.
                    </p>
                  ) : (
                    <p>
                      유료 요금제에서 단계마다 사진을 붙일 수 있습니다. 사진이
                      있으면 신입도 그대로 따라 합니다.
                    </p>
                  )}
                </HelpDialog>
                <button
                  type="button"
                  className="icon-button std-list-remove"
                  onClick={() => removeStringItem("steps", i)}
                  aria-label="이 단계 삭제"
                  disabled={draft.steps.length <= 1}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="ghost-button std-add-button"
            onClick={() => addStringItem("steps")}
          >
            <Plus size={13} /> 단계 추가
          </button>
        </div>
      </section>

      <section className="std-form-section" id="std-caution">
        <div className="std-section-head">
          <h2>
            <span className="std-step-no">3</span>주의사항
          </h2>
        </div>
        <FloatTextarea
          className="float-field--flush"
          id="std-caution-text"
          label="주의사항 (선택)"
          rows={3}
          maxLength={2000}
          value={draft.caution}
          onChange={(e) => setField("caution", e.target.value)}
          hint="예: 안전블록 없이 금형 밑에 손 넣지 않기. 우천 시 야외 작업 중지. 사고 시 관리감독자 010-0000-0000"
        />
      </section>

      <section className="std-form-section" id="std-checklist">
        <div className="std-section-head">
          <h2>
            <span className="std-step-no">4</span>안전/품질 체크리스트
          </h2>
          <HelpDialog title="안전/품질 체크리스트" variant="icon">
            <ChecklistHelp />
          </HelpDialog>
        </div>
        <ChecklistBlock
          title="작업 전 (TBM)"
          hints={TBM_HINTS}
          items={draft.checklist_tbm}
          onChange={(i, v) => updateStringList("checklist_tbm", i, v)}
          onAdd={() => addStringItem("checklist_tbm")}
          onRemove={(i) => removeStringItem("checklist_tbm", i)}
        />
        <ChecklistBlock
          title="작업 중 (순회점검)"
          hints={DURING_HINTS}
          items={draft.checklist_during}
          onChange={(i, v) => updateStringList("checklist_during", i, v)}
          onAdd={() => addStringItem("checklist_during")}
          onRemove={(i) => removeStringItem("checklist_during", i)}
        />
      </section>

      {/* 여기부터는 표준서가 아니라 함께 등록되는 별도 문서(위험성평가 1회차)다.
          같은 흰 카드로 이어지면 표준서의 한 구간으로 읽혀서, 띠와 색으로 가른다. */}
      <div className="std-form-divider" aria-hidden="true">
        <span>여기부터 위험성평가</span>
      </div>
      <section
        className="std-form-section std-form-section--assessment"
        id="std-risk"
        aria-label="최초 위험성평가"
      >
        <div className="std-assessment-head">
          <span className="std-assessment-icon">
            <ListChecks size={18} />
          </span>
          <div className="std-assessment-title">
            <p className="std-assessment-eyebrow">
              별도 문서 · 표준서와 함께 등록
            </p>
            <div className="std-section-head">
              <h2>최초 위험성평가</h2>
              <HelpDialog title="위험성평가" variant="icon">
                <RiskHelp />
              </HelpDialog>
            </div>
          </div>
        </div>
        <p className="std-form-note">
          표준서를 확정하면 이 평가가 위험성평가 1회차로 같이 등록되고,
          위험성평가 메뉴에 회차로 보입니다. 이후 정기·수시 평가는 표준서
          상세에서 회차를 추가합니다.
        </p>

        <FloatField
          className="float-field--flush"
          id="std-performed-on"
          label="위험성평가 실시일"
          type="date"
          value={draft.performed_on}
          onChange={(e) => setField("performed_on", e.target.value)}
          required
        />

        {/* 판단 기준은 회사가 한 번 정하는 값이다. 여기서 다시 쓰지 않고, 위험
            요인 카드의 수준 옆 물음표가 보여 준다. */}
        <h3 className="std-sub-head">사전조사 안전보건정보</h3>
        <div className="std-safety-grid">
          {(
            [
              ["equipment", "설비"],
              ["materials", "물질"],
              ["environment", "주변 환경"],
              ["history", "재해·아차사고 정보"],
            ] as const
          ).map(([key, label]) => (
            <FloatTextarea
              key={key}
              className="float-field--flush"
              id={`std-safety-${key}`}
              label={label}
              rows={2}
              maxLength={2000}
              value={draft.safety_info[key]}
              onChange={(e) =>
                setField("safety_info", {
                  ...draft.safety_info,
                  [key]: e.target.value,
                })
              }
              hint={SAFETY_INFO_HINTS[key]}
            />
          ))}
        </div>

        <FloatTextarea
          className="float-field--flush"
          id="std-worker-opinion"
          label="근로자 의견 (선택)"
          rows={2}
          maxLength={2000}
          value={draft.worker_opinion}
          onChange={(e) => setField("worker_opinion", e.target.value)}
          hint="위험요인을 찾을 때 작업자가 말한 것. 예: 야간엔 조명이 어둡다"
        />

        <div className="form-field">
          <h3 className="std-sub-head">위험요인 · 감소대책</h3>
          <ol className="risk-card-list">
            {draft.risks.map((r, i) => (
              <li key={i}>
                <RiskItemCard
                  index={i}
                  value={{
                    hazard: r.hazard,
                    currentControl: r.current_control,
                    level: r.initial_risk_level,
                    allowable: r.initial_allowable,
                    measure: r.reduction_measure,
                    responsibleId: r.responsible_user_id,
                    dueDate: r.planned_completion_date,
                  }}
                  members={members}
                  criteria={criteria}
                  onChange={(v) =>
                    setDraft((d) => {
                      const next = [...d.risks];
                      next[i] = {
                        hazard: v.hazard,
                        current_control: v.currentControl,
                        initial_risk_level: v.level,
                        initial_allowable: v.allowable,
                        reduction_measure: v.measure,
                        responsible_user_id: v.responsibleId,
                        planned_completion_date: v.dueDate,
                      };
                      return { ...d, risks: next };
                    })
                  }
                  onRemove={
                    draft.risks.length > 1 ? () => removeRisk(i) : undefined
                  }
                />
              </li>
            ))}
          </ol>
          <button type="button" className="btn-secondary" onClick={addRisk}>
            <Plus size={13} /> 위험요인 추가
          </button>
        </div>

        <div className="form-field">
          <h3 className="std-sub-head">참여자</h3>
          <p className="std-form-note">
            실제 위험성평가에 참여한 근로자를 선택합니다.
          </p>
          <PeoplePickerDialog
            legend="위험성평가 참여자"
            members={members}
            selected={draft.participant_user_ids}
            onToggle={toggleParticipant}
          />
        </div>
      </section>

      <div className="std-form-actions sticky-actions">
        <Link href={returnHref ?? "/standards"} className="ghost-button">
          <X size={13} /> 취소
        </Link>
        <button type="submit" className="primary-button" disabled={pending}>
          <Save size={14} />
          {pending ? "저장 중..." : "표준서 저장 · 확정"}
        </button>
      </div>
    </form>
  );
}

function ChecklistBlock({
  title,
  hints,
  items,
  onChange,
  onAdd,
  onRemove,
}: {
  title: string;
  hints: string[];
  items: string[];
  onChange: (idx: number, value: string) => void;
  onAdd: () => void;
  onRemove: (idx: number) => void;
}) {
  return (
    <div className="form-field">
      <label>{title}</label>
      <ol className="std-list">
        {items.map((s, i) => (
          <li key={i}>
            <span className="std-list-number">{i + 1}</span>
            {/* 헌법 3장 예외: 번호가 붙은 목록 줄이라 칸마다 라벨이 없다 (빈칸 예시가 곧 안내) */}
            <input
              type="text"
              value={s}
              onChange={(e) => onChange(i, e.target.value)}
              maxLength={500}
              placeholder={hint(hints, i, "점검 항목")}
            />
            <button
              type="button"
              className="icon-button std-list-remove"
              onClick={() => onRemove(i)}
              aria-label="이 항목 삭제"
              disabled={items.length <= 1}
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="ghost-button std-add-button"
        onClick={onAdd}
      >
        <Plus size={13} /> 항목 추가
      </button>
    </div>
  );
}

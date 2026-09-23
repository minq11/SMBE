"use client";
import type { RiskCriteria } from "@/features/company/risk-criteria";
import { PeoplePicker } from "@/components/ui/people-picker";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Save, Trash2, X } from "lucide-react";
import { RiskItemCard } from "@/features/assessments/risk-item-card";
import { FormErrorDialog } from "@/components/ui/form-error-dialog";
import { HelpDialog } from "@/components/ui/help-dialog";
import { JumpNav } from "@/components/ui/jump-nav";
import { PtwHelp } from "./ptw-help";
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
  initial_risk_level: "" | "HIGH" | "MID" | "LOW";
  initial_allowable: "" | "yes" | "no";
  reduction_measure: string;
  responsible_user_id: string;
  planned_completion_date: string;
};

type Draft = {
  name: string;
  ptw_required: boolean;
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
        initial_risk_level: "",
        initial_allowable: "",
        reduction_measure: "",
        responsible_user_id: "",
        planned_completion_date: "",
      },
    ],
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
        risks: draft.risks.map((r) => ({
          hazard: r.hazard.trim(),
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
          작업이 크게 바뀌면 수시평가 회차를 추가하세요.
        </p>
      </header>

      <FormErrorDialog message={state?.error} nonce={state} />

      {/* 긴 폼이라 구간으로 바로 간다. 좁은 화면에서는 위에 붙는다 (globals.css). */}
      <JumpNav
        items={[
          { id: "std-basic", label: "기본 정보" },
          { id: "std-method-section", label: "작업 방법" },
          { id: "std-checklist", label: "안전/품질 체크리스트" },
          { id: "std-risk", label: "위험성평가" },
        ]}
      />

      <section className="std-form-section" id="std-basic">
        <div className="std-section-head">
          <h2>기본 정보</h2>
          <HelpDialog title="기본 정보" variant="icon">
            <BasicHelp />
          </HelpDialog>
        </div>
        <div className="form-field">
          <label htmlFor="std-name">표준서명</label>
          <input
            id="std-name"
            name="name-display"
            value={draft.name}
            onChange={(e) => setField("name", e.target.value)}
            required
            maxLength={120}
            placeholder="예: 프레스 설비 정기 점검"
          />
        </div>
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
      </section>

      <section className="std-form-section" id="std-method-section">
        <div className="std-section-head">
          <h2>작업 방법</h2>
          <HelpDialog title="작업 방법" variant="icon">
            <MethodHelp />
          </HelpDialog>
        </div>
        <div className="form-field">
          <label htmlFor="std-method">작업방법 요약</label>
          <textarea
            id="std-method"
            rows={3}
            maxLength={4000}
            value={draft.work_method}
            onChange={(e) => setField("work_method", e.target.value)}
            placeholder="이 작업의 전체 개요를 짧게 요약합니다."
          />
        </div>
        <div className="form-field">
          <label>작업 단계</label>
          <ol className="std-list">
            {draft.steps.map((s, i) => (
              <li key={i}>
                <span className="std-list-number">{i + 1}</span>
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

      <section className="std-form-section" id="std-checklist">
        <div className="std-section-head">
          <h2>안전/품질 체크리스트</h2>
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

      <section className="std-form-section" id="std-risk">
        <div className="std-section-head">
          <h2>위험성평가 (최초평가)</h2>
          <HelpDialog title="위험성평가" variant="icon">
            <RiskHelp />
          </HelpDialog>
        </div>
        <p className="std-form-note">
          이 표준서를 사용하는 지시서에 대한 최초 위험성 평가입니다. 이후
          정기·수시평가는 표준서 상세 화면에서 회차별로 추가합니다.
        </p>

        <div className="form-field">
          <label htmlFor="std-performed-on">평가 실시일</label>
          <input
            id="std-performed-on"
            type="date"
            value={draft.performed_on}
            onChange={(e) => setField("performed_on", e.target.value)}
            required
          />
        </div>

        {/* 판단 기준은 회사가 한 번 정하는 값이다. 여기서 다시 쓰지 않고, 위험
            요인 카드의 수준 옆 물음표가 보여 준다. */}
        <div className="std-safety-grid">
          {(
            [
              ["equipment", "설비"],
              ["materials", "물질"],
              ["environment", "주변 환경"],
              ["history", "재해·아차사고 정보"],
            ] as const
          ).map(([key, label]) => (
            <div className="form-field" key={key}>
              <label htmlFor={`std-safety-${key}`}>{label}</label>
              <textarea
                id={`std-safety-${key}`}
                rows={2}
                maxLength={2000}
                value={draft.safety_info[key]}
                onChange={(e) =>
                  setField("safety_info", {
                    ...draft.safety_info,
                    [key]: e.target.value,
                  })
                }
                placeholder="해당사항이 없으면 '해당없음'으로 적어주세요."
              />
            </div>
          ))}
        </div>

        <div className="form-field">
          <label>위험요인 · 감소대책</label>
          <ol className="risk-card-list">
            {draft.risks.map((r, i) => (
              <li key={i}>
                <RiskItemCard
                  index={i}
                  value={{
                    hazard: r.hazard,
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
          <p className="std-form-note">
            실제 평가에 참여한 근로자를 선택합니다.
          </p>
          <PeoplePicker
            legend="평가 참여자"
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
          {pending ? "저장 중..." : "표준서 저장 · 승인"}
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

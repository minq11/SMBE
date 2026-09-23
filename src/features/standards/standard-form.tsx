"use client";
import { PeoplePicker } from "@/components/ui/people-picker";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Save, Trash2, X } from "lucide-react";
import { RiskItemCard } from "@/features/assessments/risk-item-card";
import { HelpDialog } from "@/components/ui/help-dialog";
import { JumpNav } from "@/components/ui/jump-nav";
import { PtwHelp } from "./ptw-help";
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
    steps: [""],
    checklist_tbm: [""],
    checklist_during: [""],
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
}: {
  /** 회사의 위험성 판단 기준 (읽기만) */
  criteria: string;
  members: Member[];
  returnHref?: string;
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
      steps: draft.steps.map((s) => s.trim()).filter(Boolean),
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
          작업방법 · 체크리스트 · 위험성평가를 한 흐름으로 등록합니다. 저장 시
          곧바로 승인·사용 가능한 상태가 됩니다. 나중에 변경이 필요하면 폐기 후
          새로 등록하세요 (개정 기능은 후속 지원).
        </p>
      </header>

      {state?.error && <div className="form-error">{state.error}</div>}

      {/* 긴 폼이라 구간으로 바로 간다. 좁은 화면에서는 위에 붙는다 (globals.css). */}
      <JumpNav
        items={[
          { id: "std-basic", label: "기본 정보" },
          { id: "std-method-section", label: "작업 방법" },
          { id: "std-checklist", label: "체크리스트" },
          { id: "std-risk", label: "위험성평가" },
        ]}
      />

      <section className="std-form-section" id="std-basic">
        <h2>기본 정보</h2>
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
            trigger="어떤 작업이 해당되나요?"
          >
            <PtwHelp />
          </HelpDialog>
        </div>
      </section>

      <section className="std-form-section" id="std-method-section">
        <h2>작업 방법</h2>
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
                  placeholder={`${i + 1}단계`}
                />
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
        <h2>체크리스트</h2>
        <ChecklistBlock
          title="작업 전 (TBM)"
          items={draft.checklist_tbm}
          onChange={(i, v) => updateStringList("checklist_tbm", i, v)}
          onAdd={() => addStringItem("checklist_tbm")}
          onRemove={(i) => removeStringItem("checklist_tbm", i)}
        />
        <ChecklistBlock
          title="작업 중 (순회점검)"
          items={draft.checklist_during}
          onChange={(i, v) => updateStringList("checklist_during", i, v)}
          onAdd={() => addStringItem("checklist_during")}
          onRemove={(i) => removeStringItem("checklist_during", i)}
        />
      </section>

      <section className="std-form-section" id="std-risk">
        <h2>위험성평가 (최초평가)</h2>
        <p className="std-form-note">
          이 표준서를 사용하는 지시서에 자동으로 딸려가는 최초 회차 평가입니다.
          이후 정기·수시평가는 표준서 상세 화면에서 회차별로 추가합니다.
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

        {/* 판단 기준은 회사가 한 번 정하는 값이다. 여기서 다시 쓰지 않는다. */}
        <details className="std-fold">
          <summary>적용하는 위험성 판단 기준 (회사 기준)</summary>
          <pre className="criteria-readonly">{criteria}</pre>
          <p className="std-form-note">
            바꾸려면{" "}
            <Link href="/company/criteria">회사정보 &gt; 위험성 판단 기준</Link>{" "}
            에서 수정하세요.
          </p>
        </details>

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
                placeholder="해당사항이 없으면 그 사실을 적어주세요."
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
  items,
  onChange,
  onAdd,
  onRemove,
}: {
  title: string;
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
              placeholder="점검 항목"
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

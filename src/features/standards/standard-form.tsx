"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
import { HelpTip } from "@/components/ui/help-tip";
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
  criteria: string;
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
    criteria: "",
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
  members,
  returnHref,
}: {
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

  const updateRisk = <K extends keyof Risk>(idx: number, key: K, value: Risk[K]) =>
    setDraft((d) => {
      const next = [...d.risks];
      next[idx] = { ...next[idx], [key]: value };
      return { ...d, risks: next };
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
        criteria: draft.criteria.trim(),
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

      <section className="std-form-section">
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
        <label className="std-checkbox">
          <input
            type="checkbox"
            checked={draft.ptw_required}
            onChange={(e) => setField("ptw_required", e.target.checked)}
          />
          <span>이 작업은 위험작업허가(PTW)가 필요합니다</span>
          <HelpTip title="위험작업허가 (PTW)">
            <PtwHelp />
          </HelpTip>
        </label>
      </section>

      <section className="std-form-section">
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

      <section className="std-form-section">
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

      <section className="std-form-section">
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

        <div className="form-field">
          <label htmlFor="std-criteria">위험성 판단 기준</label>
          <textarea
            id="std-criteria"
            rows={3}
            maxLength={2000}
            value={draft.criteria}
            onChange={(e) => setField("criteria", e.target.value)}
            placeholder="예: 심각도(경상·중상·사망) × 발생가능성(낮음·보통·높음) 기준으로 상·중·하 판정."
          />
        </div>

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
          <ol className="std-risk-list">
            {draft.risks.map((r, i) => (
              <li key={i} className="std-risk-item">
                <div className="std-risk-head">
                  <span className="std-list-number">{i + 1}</span>
                  <input
                    type="text"
                    value={r.hazard}
                    onChange={(e) => updateRisk(i, "hazard", e.target.value)}
                    maxLength={500}
                    placeholder="위험요인 (예: 프레스 하강 중 손 끼임)"
                    className="std-risk-hazard"
                  />
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => removeRisk(i)}
                    aria-label="이 위험요인 삭제"
                    disabled={draft.risks.length <= 1}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="std-risk-grid">
                  <label className="std-risk-field">
                    <span>위험성 수준</span>
                    <select
                      value={r.initial_risk_level}
                      onChange={(e) =>
                        updateRisk(
                          i,
                          "initial_risk_level",
                          e.target.value as Risk["initial_risk_level"],
                        )
                      }
                    >
                      <option value="">선택</option>
                      <option value="HIGH">상</option>
                      <option value="MID">중</option>
                      <option value="LOW">하</option>
                    </select>
                  </label>
                  <label className="std-risk-field">
                    <span>허용 가능</span>
                    <select
                      value={r.initial_allowable}
                      onChange={(e) =>
                        updateRisk(
                          i,
                          "initial_allowable",
                          e.target.value as Risk["initial_allowable"],
                        )
                      }
                    >
                      <option value="">선택</option>
                      <option value="yes">예</option>
                      <option value="no">아니오</option>
                    </select>
                  </label>
                  <label className="std-risk-field std-risk-field--full">
                    <span>감소대책</span>
                    <textarea
                      rows={2}
                      maxLength={1000}
                      value={r.reduction_measure}
                      onChange={(e) =>
                        updateRisk(i, "reduction_measure", e.target.value)
                      }
                      placeholder="위험을 줄이기 위한 구체적 조치"
                    />
                  </label>
                  <label className="std-risk-field">
                    <span>조치 담당</span>
                    <select
                      value={r.responsible_user_id}
                      onChange={(e) =>
                        updateRisk(i, "responsible_user_id", e.target.value)
                      }
                    >
                      <option value="">선택 (선택 사항)</option>
                      {members.map((m) => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.display_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="std-risk-field">
                    <span>완료 예정일</span>
                    <input
                      type="date"
                      value={r.planned_completion_date}
                      onChange={(e) =>
                        updateRisk(i, "planned_completion_date", e.target.value)
                      }
                    />
                  </label>
                </div>
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="ghost-button std-add-button"
            onClick={addRisk}
          >
            <Plus size={13} /> 위험요인 추가
          </button>
        </div>

        <div className="form-field">
          <label>평가 참여자</label>
          <p className="std-form-note">
            실제 평가에 참여한 근로자를 선택합니다.
          </p>
          <div className="std-participant-grid">
            {members.length === 0 && (
              <p className="std-form-note">
                구성원이 없어요. 인원관리에서 초대해 주세요.
              </p>
            )}
            {members.map((m) => {
              const on = draft.participant_user_ids.includes(m.user_id);
              return (
                <button
                  key={m.user_id}
                  type="button"
                  className={`std-participant${on ? " is-on" : ""}`}
                  onClick={() => toggleParticipant(m.user_id)}
                >
                  <span className="std-participant-check">
                    {on ? "✓" : ""}
                  </span>
                  {m.display_name}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <div className="std-form-actions">
        <Link
          href={returnHref ?? "/standards"}
          className="ghost-button"
        >
          취소
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

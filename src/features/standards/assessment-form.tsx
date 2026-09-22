"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Save, Trash2, X } from "lucide-react";
import { addAssessmentAction, type StandardActionState } from "./actions";

type Risk = {
  hazard: string;
  initial_risk_level: "" | "HIGH" | "MID" | "LOW";
  initial_allowable: "" | "yes" | "no";
  reduction_measure: string;
  responsible_user_id: string;
  planned_completion_date: string;
};

type Draft = {
  kind: "FIRST" | "PERIODIC" | "AD_HOC" | "CONTINUOUS";
  performed_on: string;
  work_method: string;
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

const KIND_OPTIONS: Array<{ key: Draft["kind"]; label: string; note: string }> =
  [
    {
      key: "PERIODIC",
      label: "정기평가",
      note: "매년 1회 · 산안법 시행규칙",
    },
    {
      key: "AD_HOC",
      label: "수시평가",
      note: "시설·물질·인력 변경, 사고 발생 시",
    },
    {
      key: "CONTINUOUS",
      label: "상시평가",
      note: "정기평가를 상시적 활동으로 대체",
    },
    { key: "FIRST", label: "최초평가", note: "이례적으로 재실시" },
  ];

function blankDraft(seed?: Partial<Draft>): Draft {
  const today = new Date(new Date().getTime() + 9 * 3600_000)
    .toISOString()
    .slice(0, 10);
  return {
    kind: "PERIODIC",
    performed_on: today,
    work_method: "",
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
    ...seed,
  };
}

export function AssessmentForm({
  standardId,
  standardName,
  members,
  seed,
}: {
  standardId: string;
  standardName: string;
  members: Member[];
  seed?: Partial<Draft>;
}) {
  const [draft, setDraft] = useState<Draft>(() => blankDraft(seed));
  const [state, formAction, pending] = useActionState<
    StandardActionState,
    FormData
  >(addAssessmentAction, undefined);

  const setField = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const updateRisk = <K extends keyof Risk>(
    idx: number,
    key: K,
    value: Risk[K],
  ) =>
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
    const cleaned = {
      kind: draft.kind,
      performed_on: draft.performed_on,
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
    };
    const form = new FormData(e.target as HTMLFormElement);
    form.set("standard_id", standardId);
    form.set("payload", JSON.stringify(cleaned));
    formAction(form);
  };

  return (
    <form action={formAction} onSubmit={handleSubmit} className="std-form">
      <Link href={`/standards/${standardId}`} className="text-button std-back-link">
        <ArrowLeft size={13} /> {standardName}
      </Link>

      <header className="std-form-hero">
        <h1>위험성평가 회차 추가</h1>
        <p>
          <strong>{standardName}</strong> 에 대한 새 평가 회차를 등록합니다.
          기존 평가는 이력으로 보존되며, 저장된 새 회차가 이후 지시서 발급의
          기준 스냅샷이 됩니다.
        </p>
      </header>

      {state?.error && <div className="form-error">{state.error}</div>}

      <section className="std-form-section">
        <h2>실시 정보</h2>
        <div className="form-field">
          <label>평가 유형</label>
          <div className="std-kind-choices">
            {KIND_OPTIONS.map((opt) => {
              const active = draft.kind === opt.key;
              return (
                <button
                  type="button"
                  key={opt.key}
                  className={`std-kind-choice${active ? " is-active" : ""}`}
                  onClick={() => setField("kind", opt.key)}
                >
                  <strong>{opt.label}</strong>
                  <small>{opt.note}</small>
                </button>
              );
            })}
          </div>
        </div>
        <div className="form-field">
          <label htmlFor="asmt-performed-on">평가 실시일</label>
          <input
            id="asmt-performed-on"
            type="date"
            value={draft.performed_on}
            onChange={(e) => setField("performed_on", e.target.value)}
            required
          />
        </div>
      </section>

      <section className="std-form-section">
        <h2>평가 내용</h2>
        <div className="form-field">
          <label htmlFor="asmt-method">작업방법 요약</label>
          <textarea
            id="asmt-method"
            rows={3}
            maxLength={4000}
            value={draft.work_method}
            onChange={(e) => setField("work_method", e.target.value)}
          />
        </div>
        <div className="form-field">
          <label htmlFor="asmt-criteria">위험성 판단 기준</label>
          <textarea
            id="asmt-criteria"
            rows={3}
            maxLength={2000}
            value={draft.criteria}
            onChange={(e) => setField("criteria", e.target.value)}
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
              <label htmlFor={`asmt-${key}`}>{label}</label>
              <textarea
                id={`asmt-${key}`}
                rows={2}
                maxLength={2000}
                value={draft.safety_info[key]}
                onChange={(e) =>
                  setField("safety_info", {
                    ...draft.safety_info,
                    [key]: e.target.value,
                  })
                }
              />
            </div>
          ))}
        </div>
      </section>

      <section className="std-form-section">
        <h2>위험요인 · 감소대책</h2>
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
                  placeholder="위험요인"
                  className="std-risk-hazard"
                />
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => removeRisk(i)}
                  aria-label="삭제"
                  disabled={draft.risks.length <= 1}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="std-risk-grid">
                <label className="std-risk-field">
                  <span>수준</span>
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
                  />
                </label>
                <label className="std-risk-field">
                  <span>담당</span>
                  <select
                    value={r.responsible_user_id}
                    onChange={(e) =>
                      updateRisk(i, "responsible_user_id", e.target.value)
                    }
                  >
                    <option value="">선택 (선택)</option>
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
      </section>

      <section className="std-form-section">
        <h2>평가 참여자</h2>
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
                <span className="std-participant-check">{on ? "✓" : ""}</span>
                {m.display_name}
              </button>
            );
          })}
        </div>
      </section>

      <div className="std-form-actions sticky-actions">
        <Link href={`/standards/${standardId}`} className="ghost-button">
          <X size={13} /> 취소
        </Link>
        <button type="submit" className="primary-button" disabled={pending}>
          <Save size={14} />
          {pending ? "저장 중..." : "평가 회차 저장"}
        </button>
      </div>
    </form>
  );
}

"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
import { updateStandardAction, type StandardActionState } from "./actions";

type Draft = {
  name: string;
  ptw_required: boolean;
  steps: string[];
  checklist_tbm: string[];
  checklist_during: string[];
};

export function StandardEditForm({
  standardId,
  initial,
}: {
  standardId: string;
  initial: Draft;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [state, formAction, pending] = useActionState<
    StandardActionState,
    FormData
  >(updateStandardAction, undefined);

  const setField = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const updateList = (
    key: "steps" | "checklist_tbm" | "checklist_during",
    idx: number,
    value: string,
  ) =>
    setDraft((d) => {
      const next = [...d[key]];
      next[idx] = value;
      return { ...d, [key]: next };
    });

  const addItem = (key: "steps" | "checklist_tbm" | "checklist_during") =>
    setDraft((d) => ({ ...d, [key]: [...d[key], ""] }));

  const removeItem = (
    key: "steps" | "checklist_tbm" | "checklist_during",
    idx: number,
  ) =>
    setDraft((d) => {
      if (d[key].length <= 1) return d;
      return { ...d, [key]: d[key].filter((_, i) => i !== idx) };
    });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = {
      name: draft.name.trim(),
      ptw_required: draft.ptw_required,
      steps: draft.steps.map((s) => s.trim()).filter(Boolean),
      checklist_tbm: draft.checklist_tbm.map((s) => s.trim()).filter(Boolean),
      checklist_during: draft.checklist_during
        .map((s) => s.trim())
        .filter(Boolean),
    };
    const form = new FormData(e.target as HTMLFormElement);
    form.set("standard_id", standardId);
    form.set("payload", JSON.stringify(cleaned));
    formAction(form);
  };

  return (
    <form action={formAction} onSubmit={handleSubmit} className="std-form">
      <Link href={`/standards/${standardId}`} className="text-button std-back-link">
        <ArrowLeft size={13} /> 표준서 상세
      </Link>

      <header className="std-form-hero">
        <h1>표준서 수정</h1>
        <p>
          작업방법·체크리스트·PTW 설정을 수정합니다. 저장 시 즉시 반영되며 변경
          이력은 감사 로그에 남습니다. 위험성평가를 새로 실시하려면 상세 화면
          에서 <strong>정기평가·수시평가 추가</strong> 를 사용하세요.
        </p>
      </header>

      {state?.error && <div className="form-error">{state.error}</div>}

      <section className="std-form-section">
        <h2>기본 정보</h2>
        <div className="form-field">
          <label htmlFor="std-edit-name">표준서명</label>
          <input
            id="std-edit-name"
            value={draft.name}
            onChange={(e) => setField("name", e.target.value)}
            required
            maxLength={120}
          />
        </div>
        <label className="std-checkbox">
          <input
            type="checkbox"
            checked={draft.ptw_required}
            onChange={(e) => setField("ptw_required", e.target.checked)}
          />
          <span>이 작업은 위험작업허가(PTW)가 필요합니다</span>
        </label>
      </section>

      <section className="std-form-section">
        <h2>작업 단계</h2>
        <div className="form-field">
          <ol className="std-list">
            {draft.steps.map((s, i) => (
              <li key={i}>
                <span className="std-list-number">{i + 1}</span>
                <input
                  type="text"
                  value={s}
                  onChange={(e) => updateList("steps", i, e.target.value)}
                  maxLength={500}
                  placeholder={`${i + 1}단계`}
                />
                <button
                  type="button"
                  className="icon-button std-list-remove"
                  onClick={() => removeItem("steps", i)}
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
            onClick={() => addItem("steps")}
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
          onChange={(i, v) => updateList("checklist_tbm", i, v)}
          onAdd={() => addItem("checklist_tbm")}
          onRemove={(i) => removeItem("checklist_tbm", i)}
        />
        <ChecklistBlock
          title="작업 중 (순회점검)"
          items={draft.checklist_during}
          onChange={(i, v) => updateList("checklist_during", i, v)}
          onAdd={() => addItem("checklist_during")}
          onRemove={(i) => removeItem("checklist_during", i)}
        />
      </section>

      <div className="std-form-actions">
        <Link href={`/standards/${standardId}`} className="ghost-button">
          취소
        </Link>
        <button type="submit" className="primary-button" disabled={pending}>
          <Save size={14} />
          {pending ? "저장 중..." : "변경사항 저장"}
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

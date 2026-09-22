"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
import { HelpTip } from "@/components/ui/help-tip";
import { PtwHelp } from "./ptw-help";
import { AttachmentUploader } from "@/features/attachments/attachment-uploader";
import {
  AttachmentList,
  type AttachmentItem,
} from "@/features/attachments/attachment-list";
import { updateStandardAction, type StandardActionState } from "./actions";

type StepDraft = { id?: string; text: string };

type Draft = {
  name: string;
  ptw_required: boolean;
  steps: StepDraft[];
  checklist_tbm: string[];
  checklist_during: string[];
};

export type StandardEditInitial = Draft;

export type StepAttachmentMap = Record<string, AttachmentItem[]>;

export function StandardEditForm({
  standardId,
  initial,
  isPro,
  stepAttachments = {},
}: {
  standardId: string;
  initial: Draft;
  isPro: boolean;
  stepAttachments?: StepAttachmentMap;
}) {
  const invalidatePath = `/standards/${standardId}/edit`;
  const [draft, setDraft] = useState<Draft>(initial);
  const [state, formAction, pending] = useActionState<
    StandardActionState,
    FormData
  >(updateStandardAction, undefined);

  const setField = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const updateStepText = (idx: number, value: string) =>
    setDraft((d) => {
      const next = [...d.steps];
      next[idx] = { ...next[idx], text: value };
      return { ...d, steps: next };
    });

  const updateChecklist = (
    key: "checklist_tbm" | "checklist_during",
    idx: number,
    value: string,
  ) =>
    setDraft((d) => {
      const next = [...d[key]];
      next[idx] = value;
      return { ...d, [key]: next };
    });

  const addStep = () =>
    setDraft((d) => ({ ...d, steps: [...d.steps, { text: "" }] }));

  const addChecklist = (key: "checklist_tbm" | "checklist_during") =>
    setDraft((d) => ({ ...d, [key]: [...d[key], ""] }));

  const removeStep = (idx: number) =>
    setDraft((d) => {
      if (d.steps.length <= 1) return d;
      return { ...d, steps: d.steps.filter((_, i) => i !== idx) };
    });

  const removeChecklist = (
    key: "checklist_tbm" | "checklist_during",
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
      steps: draft.steps
        .map((s) => ({ id: s.id, text: s.text.trim() }))
        .filter((s) => s.text.length > 0),
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
      <Link
        href={`/standards/${standardId}`}
        className="text-button std-back-link"
      >
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

      <nav className="std-jump" aria-label="구간 이동">
        <a href="#std-basic">기본 정보</a>
        <a href="#std-steps">작업 단계</a>
        <a href="#std-checklist">체크리스트</a>
      </nav>

      <section className="std-form-section" id="std-basic">
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
          <HelpTip title="위험작업허가 (PTW)">
            <PtwHelp />
          </HelpTip>
        </label>
      </section>

      <section className="std-form-section" id="std-steps">
        <h2>작업 단계</h2>
        <div className="form-field">
          <ol className="std-list std-list--with-attach">
            {draft.steps.map((s, i) => (
              <li key={s.id ?? `new-${i}`}>
                <div className="std-list-row">
                  <span className="std-list-number">{i + 1}</span>
                  <input
                    type="text"
                    value={s.text}
                    onChange={(e) => updateStepText(i, e.target.value)}
                    maxLength={500}
                    placeholder={`${i + 1}단계`}
                  />
                  <button
                    type="button"
                    className="icon-button std-list-remove"
                    onClick={() => removeStep(i)}
                    aria-label="이 단계 삭제"
                    disabled={draft.steps.length <= 1}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {s.id ? (
                  <div className="std-step-attach">
                    <AttachmentList
                      items={stepAttachments[s.id] ?? []}
                      invalidatePath={invalidatePath}
                      emptyLabel=""
                      compact
                    />
                    {isPro ? (
                      <AttachmentUploader
                        targetType="standard_step"
                        targetId={s.id}
                        invalidatePath={invalidatePath}
                        label="단계 사진 추가"
                      />
                    ) : (
                      <p className="attach-uploader-hint">
                        유료 요금제에서 작업 단계 사진을 첨부할 수 있습니다.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="attach-uploader-hint">
                    저장 후 이 단계에 사진을 첨부할 수 있습니다.
                  </p>
                )}
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="ghost-button std-add-button"
            onClick={addStep}
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
          onChange={(i, v) => updateChecklist("checklist_tbm", i, v)}
          onAdd={() => addChecklist("checklist_tbm")}
          onRemove={(i) => removeChecklist("checklist_tbm", i)}
        />
        <ChecklistBlock
          title="작업 중 (순회점검)"
          items={draft.checklist_during}
          onChange={(i, v) => updateChecklist("checklist_during", i, v)}
          onAdd={() => addChecklist("checklist_during")}
          onRemove={(i) => removeChecklist("checklist_during", i)}
        />
      </section>

      <div className="std-form-actions sticky-actions">
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

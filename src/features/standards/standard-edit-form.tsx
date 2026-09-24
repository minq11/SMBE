"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
import { FormErrorDialog } from "@/components/ui/form-error-dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { HelpDialog } from "@/components/ui/help-dialog";
import { BasicHelp, ChecklistHelp, MethodHelp } from "./section-help";
import { JumpNav } from "@/components/ui/jump-nav";
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
  change_note: string;
};

export type StandardEditInitial = Draft;

export type StepAttachmentMap = Record<string, AttachmentItem[]>;

export function StandardEditForm({
  standardId,
  revisionNo,
  initial,
  isPro,
  stepAttachments = {},
}: {
  standardId: string;
  /** 지금 고치는 개정 초안의 판 번호 */
  revisionNo: number;
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
  const { confirm, dialog } = useConfirm();
  // 확정까지 갈지는 누른 단추가 정한다. submit 핸들러가 읽는다.
  const approveRef = useRef(false);

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

  const submit = (approve: boolean) => {
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
      change_note: draft.change_note.trim(),
    };
    const form = new FormData();
    form.set("standard_id", standardId);
    form.set("payload", JSON.stringify(cleaned));
    if (approve) form.set("approve", "1");
    formAction(form);
  };
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit(approveRef.current);
    approveRef.current = false;
  };
  const saveAndApprove = async () => {
    if (
      !(await confirm(
        `${revisionNo}판으로 확정합니다. 확정된 판은 고칠 수 없고, 이후 지시서와 위험성평가는 이 판을 가리킵니다.`,
        { title: "개정 확정", confirmLabel: "확정" },
      ))
    )
      return;
    submit(true);
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
        <h1>{revisionNo}판 개정</h1>
        <p>
          확정된 판은 고치지 않습니다. 지금 보는 것은 현재 판을 그대로 복사한
          초안입니다. 고친 뒤 확정하면 새 판이 되고, 그 뒤 지시서와 위험성평가는
          새 판을 가리킵니다. 작업이 크게 바뀌었으면 확정 뒤 수시 위험성평가를 추가하세요.
        </p>
      </header>

      <FormErrorDialog message={state?.error} nonce={state} />
      {dialog}

      <JumpNav
        items={[
          { id: "std-basic", label: "기본 정보" },
          { id: "std-steps", label: "작업 단계" },
          { id: "std-checklist", label: "안전/품질 체크리스트" },
          { id: "std-note", label: "개정 사유" },
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
          <label htmlFor="std-edit-name">표준서명</label>
          <input
            id="std-edit-name"
            value={draft.name}
            onChange={(e) => setField("name", e.target.value)}
            required
            maxLength={120}
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

      <section className="std-form-section" id="std-steps">
        <div className="std-section-head">
          <h2>작업 단계</h2>
          <HelpDialog title="작업 방법" variant="icon">
            <MethodHelp />
          </HelpDialog>
        </div>
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
                        label="사진 붙이기"
                        icon="clip"
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
        <div className="std-section-head">
          <h2>안전/품질 체크리스트</h2>
          <HelpDialog title="안전/품질 체크리스트" variant="icon">
            <ChecklistHelp />
          </HelpDialog>
        </div>
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

      <section className="std-form-section" id="std-note">
        <h2>개정 사유</h2>
        <div className="form-field">
          <label htmlFor="std-change-note">무엇을 왜 바꿨나요</label>
          <textarea
            id="std-change-note"
            rows={2}
            maxLength={1000}
            value={draft.change_note}
            onChange={(e) => setField("change_note", e.target.value)}
            placeholder="예: 신형 프레스 도입으로 금형 고정 방식 변경"
          />
        </div>
      </section>

      <div className="std-form-actions sticky-actions">
        <Link href={`/standards/${standardId}`} className="ghost-button">
          취소
        </Link>
        <button type="submit" className="btn-secondary" disabled={pending}>
          <Save size={14} />
          {pending ? "저장 중..." : "초안 저장"}
        </button>
        <button
          type="button"
          className="primary-button"
          disabled={pending}
          onClick={saveAndApprove}
        >
          {pending ? "저장 중..." : "저장하고 확정"}
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

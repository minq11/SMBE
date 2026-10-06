"use client";

import { useActionState, useId, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Send, ArrowLeft } from "lucide-react";
import { FloatField, FloatTextarea } from "@/components/ui/float-field";
import { FormErrorDialog } from "@/components/ui/form-error-dialog";
import { Segmented } from "@/features/assessments/risk-level-picker";
import { AttachmentUploader } from "@/features/attachments/attachment-uploader";
import { reportIncidentAction } from "./actions";
import type { IncidentKind } from "./model";

/**
 * 작업자 신고 — 세 칸(무슨 일 · 어디 · 사진). 보내면 관리자에게 푸시가 가고 화면은
 * "접수됐습니다" 로 바뀐다. 사진은 접수된 뒤에 붙인다(첨부는 id 가 있어야 한다).
 * 이름은 붙는다 (사장님 결정: 기명). 은폐를 막는 흔적이자 근로자 참여의 기록이다.
 */
export function WorkerReportForm({
  backHref,
  backLabel,
  defaultLocation = "",
}: {
  backHref: string;
  backLabel: string;
  /** 링크 화면이면 그 지시서의 장소를 미리 넣는다. */
  defaultLocation?: string;
}) {
  const uid = useId();
  const [kind, setKind] = useState<IncidentKind | "">("");
  const [state, action, pending] = useActionState(
    reportIncidentAction,
    undefined,
  );

  if (state?.id)
    return (
      <section className="inc-report-done" role="status">
        <span className="inc-report-done-icon">
          <CheckCircle2 size={28} />
        </span>
        <h2>접수됐습니다</h2>
        <p>관리자에게 알렸습니다. 다친 사람이 있으면 먼저 치료부터 받으세요.</p>
        {state.canAttach ? (
          <div className="inc-report-photos">
            <p className="wo-muted">현장 사진이 있으면 지금 붙이세요.</p>
            <AttachmentUploader
              targetType="incident"
              targetId={state.id}
              label="사진 붙이기"
            />
          </div>
        ) : null}
        <Link href={backHref} className="go-link">
          <ArrowLeft size={14} /> {backLabel}
        </Link>
      </section>
    );

  return (
    <form action={action} className="inc-report-form">
      <FormErrorDialog
        message={state?.error}
        nonce={state}
        title="보내지 못했습니다"
      />
      <input type="hidden" name="kind" value={kind} />
      <Segmented<IncidentKind>
        label="무슨 일인가요?"
        value={kind}
        options={[
          { value: "NEAR_MISS", label: "다칠 뻔했다" },
          { value: "INJURY", label: "다쳤다" },
        ]}
        onChange={setKind}
      />
      <FloatTextarea
        id={`${uid}-description`}
        name="description"
        label="무슨 일"
        rows={4}
        maxLength={2000}
        hint="예: 지게차가 후진하다 나를 못 봤다"
        required
      />
      <FloatField
        id={`${uid}-location`}
        name="location"
        label="어디"
        hint="예: 2공장 출하장 앞"
        maxLength={200}
        defaultValue={defaultLocation}
        required
      />
      <div className="wo-actions">
        <button
          type="submit"
          className="btn-primary"
          disabled={pending || !kind}
        >
          <Send size={14} /> {pending ? "보내는 중…" : "신고 보내기"}
        </button>
      </div>
    </form>
  );
}

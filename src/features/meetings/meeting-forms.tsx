"use client";
import { useActionState } from "react";
import { CalendarPlus, CheckCircle2, Save } from "lucide-react";
import {
  openMeetingAction,
  saveMeetingItemAction,
  completeMeetingAction,
} from "./actions";

type Member = { user_id: string; display_name: string };

function Feedback({
  state,
}: {
  state: { error?: string; message?: string } | undefined;
}) {
  return (
    <>
      {state?.error && (
        <p role="alert" className="wo-error">
          {state.error}
        </p>
      )}
      {state?.message && <p role="status">{state.message}</p>}
    </>
  );
}

export function OpenMeetingButton({
  week,
  label = "회의 열기",
}: {
  week: string;
  label?: string;
}) {
  const [state, action, pending] = useActionState(openMeetingAction, undefined);
  return (
    <form action={action} className="meeting-open">
      <input type="hidden" name="week" value={week} />
      <Feedback state={state} />
      <button className="btn-secondary" disabled={pending}>
        <CalendarPlus size={14} />
        {pending ? "여는 중…" : label}
      </button>
    </form>
  );
}

/** 항목별 이행 확인·비고. 원본을 종결시키지 않는다 — 회의의 장부다. */
export function MeetingItemForm({
  week,
  item,
  readOnly,
}: {
  week: string;
  item: { id: string; reviewed: boolean; note: string };
  readOnly: boolean;
}) {
  const [state, action, pending] = useActionState(
    saveMeetingItemAction,
    undefined,
  );
  if (readOnly)
    return (
      <p className="wo-muted">
        {item.reviewed ? "이행 확인" : "미확인"}
        {item.note ? ` · ${item.note}` : ""}
      </p>
    );
  return (
    <form action={action} className="meeting-item-form">
      <input type="hidden" name="itemId" value={item.id} />
      <input type="hidden" name="week" value={week} />
      <Feedback state={state} />
      <label className="meeting-check">
        <input
          type="checkbox"
          name="reviewed"
          defaultChecked={item.reviewed}
          disabled={pending}
        />
        이행 확인
      </label>
      <label className="wo-field">
        비고
        <input
          name="note"
          maxLength={1000}
          defaultValue={item.note}
          disabled={pending}
        />
      </label>
      <button className="btn-secondary" disabled={pending}>
        <Save size={14} />
        {pending ? "저장 중…" : "저장"}
      </button>
    </form>
  );
}

export function CompleteMeetingForm({
  week,
  members,
  attendees,
  discussion,
  unreviewed,
}: {
  week: string;
  members: Member[];
  attendees: string[];
  discussion: string;
  unreviewed: number;
}) {
  const [state, action, pending] = useActionState(
    completeMeetingAction,
    undefined,
  );
  return (
    <form action={action} className="account-form">
      <input type="hidden" name="week" value={week} />
      <Feedback state={state} />
      {unreviewed > 0 && (
        <p className="wo-notice">
          아직 확인하지 않은 항목이 {unreviewed}건 있습니다. 그대로 완료할 수도
          있으며, 미확인 건수는 기록에 남습니다.
        </p>
      )}
      <fieldset className="meeting-attendees">
        <legend>참석자 (1명 이상)</legend>
        {members.map((m) => (
          <label key={m.user_id} className="meeting-check">
            <input
              type="checkbox"
              name="attendeeIds"
              value={m.user_id}
              defaultChecked={attendees.includes(m.user_id)}
              disabled={pending}
            />
            {m.display_name}
          </label>
        ))}
      </fieldset>
      <label className="wo-field">
        논의 내용 (선택)
        <textarea
          name="discussion"
          maxLength={4000}
          defaultValue={discussion}
          disabled={pending}
          placeholder="확인 위주로 짧게 적어도 됩니다."
        />
      </label>
      <div className="form-actions sticky-actions">
        <button className="btn-primary" disabled={pending}>
          <CheckCircle2 size={14} />
          {pending ? "저장 중…" : "회의 완료"}
        </button>
      </div>
    </form>
  );
}

"use client";
import { useActionState, useRef, useState, useEffect } from "react";
import { CheckCircle2, Save } from "lucide-react";
import { submitInspectionAction, resolveFindingAction } from "./actions";
import { RESULT_LABEL, type InspectionInput } from "./model";

export function InspectionForm({
  orderId,
  sessionId,
  category,
  path,
  checklist,
  managers,
  previousActions,
}: {
  orderId: string;
  sessionId: string;
  category: "TBM" | "DURING_WORK";
  path: "WEB" | "QR" | "LINK";
  checklist: Array<{ id: string; text: string }>;
  managers: Array<{ user_id: string; display_name: string }>;
  previousActions: Array<{
    id: string;
    item_text: string;
    resolution: string | null;
  }>;
}) {
  const [state, action, pending] = useActionState(
    submitInspectionAction,
    undefined,
  );
  const [requestId] = useState(() => crypto.randomUUID());
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [reviewed, setReviewed] = useState(previousActions.length === 0);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (previousActions.length && !reviewed && !dialog.current?.open)
      dialog.current?.showModal();
  }, [previousActions.length, reviewed]);
  const send = (form: FormData) => {
    const data: InspectionInput = {
      id: requestId,
      orderId,
      sessionId,
      category,
      entryPath: path,
      confirmed: form.get("confirmed") === "on",
      results: checklist.map((c) => ({
        itemId: c.id,
        result: form.get(
          "result-" + c.id,
        ) as InspectionInput["results"][number]["result"],
        comment: String(form.get("comment-" + c.id) ?? ""),
        managerId: String(form.get("manager-" + c.id) ?? ""),
      })),
    };
    const payload = new FormData();
    payload.set("payload", JSON.stringify(data));
    action(payload);
  };
  return (
    <>
      {previousActions.length > 0 && (
        <dialog
          ref={dialog}
          className="inspection-dialog"
          onCancel={(event) => event.preventDefault()}
          aria-labelledby="previous-actions-title"
        >
          <h2 id="previous-actions-title">이전 회차 부적합 조치 내용</h2>
          {previousActions.map((a) => (
            <div key={a.id}>
              <h3>{a.item_text}</h3>
              <p className="wo-detail-text">{a.resolution}</p>
            </div>
          ))}
          <button
            className="btn-primary"
            type="button"
            onClick={() => {
              setReviewed(true);
              dialog.current?.close();
            }}
          >
            <CheckCircle2 size={14} /> 조치 내용 확인
          </button>
        </dialog>
      )}
      <form action={send} className="inspection-form">
        {state?.error && (
          <p role="alert" className="wo-error">
            {state.error}
          </p>
        )}
        {checklist.map((c, index) => (
          <fieldset className="wo-risk" key={c.id}>
            <legend>
              {index + 1}. {c.text}
            </legend>
            <div className="inspection-options">
              {Object.entries(RESULT_LABEL).map(([value, label]) => (
                <label key={value}>
                  <input
                    type="radio"
                    name={"result-" + c.id}
                    value={value}
                    required
                    disabled={pending}
                    onChange={() =>
                      setAnswers((old) => ({ ...old, [c.id]: value }))
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
            <label className="wo-field">
              코멘트
              <textarea
                name={"comment-" + c.id}
                maxLength={2000}
                disabled={pending}
              />
            </label>
            {answers[c.id] === "FAIL" && (
              <label className="wo-field">
                알림 대상 관리자
                <select
                  name={"manager-" + c.id}
                  defaultValue=""
                  required
                  disabled={pending}
                >
                  <option value="" disabled>
                    담당 관리자 선택
                  </option>
                  {managers.map((m) => (
                    <option value={m.user_id} key={m.user_id}>
                      {m.display_name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </fieldset>
        ))}
        {category === "TBM" && (
          <label className="inspection-confirm">
            <input
              type="checkbox"
              name="confirmed"
              required
              disabled={pending}
            />
            위험요인·감소대책과 점검 내용을 확인했으며, 본인 계정으로 TBM 참여를
            기록합니다.
          </label>
        )}
        <p className="wo-muted">
          로그인한 본인 이름·역할·실제 저장 시각·진입경로가 기록됩니다. 부적합은
          선택한 관리자의 안전점검 알림함에 등록됩니다. 사진 첨부·저장 후 수정은
          아직 지원하지 않습니다.
        </p>
        <button
          className="btn-primary"
          disabled={pending || !reviewed || checklist.length === 0}
        >
          <Save size={14} />
          {pending
            ? "저장 중…"
            : category === "TBM"
              ? "TBM 확인 저장"
              : "작업 중 점검 저장"}
        </button>
      </form>
    </>
  );
}

export function FindingResolution({ id }: { id: string }) {
  const [state, action, pending] = useActionState(
    resolveFindingAction,
    undefined,
  );
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <label className="wo-field">
        조치 내용
        <textarea
          name="resolution"
          required
          maxLength={4000}
          disabled={pending}
        />
      </label>
      {state?.error && (
        <p role="alert" className="wo-error">
          {state.error}
        </p>
      )}
      {state?.message && <p role="status">{state.message}</p>}
      <button className="btn-primary" disabled={pending}>
        <CheckCircle2 size={14} />
        {pending ? "저장 중…" : "조치완료"}
      </button>
    </form>
  );
}

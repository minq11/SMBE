"use client";
import { useActionState, useState } from "react";
import { History, Save, UserPlus } from "lucide-react";
import { backfillInspectionAction, reviseInspectionAction } from "./actions";
import { FloatSelect, FloatTextarea } from "@/components/ui/float-field";
import { RESULT_LABEL } from "./model";

type Member = { user_id: string; display_name: string };
type Item = { id: string; text: string };

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

/**
 * 관리자 대리 입력.
 *
 * 현장 폼과 입력 항목은 같고 "누구의 점검인가"를 고르는 칸이 하나 더 붙는다.
 * 이 화면에서 만든 기록은 사후 입력으로 표시되며 현장 입력과 섞이지 않는다.
 */
export function BackfillForm({
  orderId,
  sessionId,
  candidates,
  managers,
  checklist,
}: {
  orderId: string;
  sessionId: string;
  candidates: Member[];
  managers: Member[];
  checklist: { TBM: Item[]; DURING_WORK: Item[] };
}) {
  const [state, action, pending] = useActionState(
    backfillInspectionAction,
    undefined,
  );
  const [category, setCategory] = useState<"TBM" | "DURING_WORK">("TBM");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const items = checklist[category];
  const send = (form: FormData) => {
    const payload = new FormData();
    payload.set(
      "payload",
      JSON.stringify({
        id: crypto.randomUUID(),
        orderId,
        sessionId,
        inspectorId: String(form.get("inspectorId") ?? ""),
        category,
        entryPath: "WEB",
        confirmed: true,
        results: items.map((c) => ({
          itemId: c.id,
          result: form.get("bf-result-" + c.id),
          comment: String(form.get("bf-comment-" + c.id) ?? ""),
          managerId: String(form.get("bf-manager-" + c.id) ?? ""),
        })),
      }),
    );
    action(payload);
  };
  return (
    <form action={send} className="inspection-form wo-backfill">
      <Feedback state={state} />
      <p className="wo-muted">
        현장에서 기록하지 못한 회차를 대신 입력합니다. 저장하면{" "}
        <strong>누가 실제로 입력했는지와 사후 입력이라는 사실</strong>이 함께
        남고, 저장 시각은 지금 시각으로 기록됩니다. 과거 현장 입력으로 보이게
        만들 수 없습니다.
      </p>
      <FloatSelect
        id="bf-inspector"
        label="누구의 점검인가"
        name="inspectorId"
        required
        defaultValue=""
        disabled={pending}
      >
        <option value="" disabled>
          대상 선택
        </option>
        {candidates.map((m) => (
          <option key={m.user_id} value={m.user_id}>
            {m.display_name}
          </option>
        ))}
      </FloatSelect>
      <FloatSelect
        id="bf-category"
        label="점검 구분"
        value={category}
        disabled={pending}
        onChange={(e) => {
          setCategory(e.target.value as "TBM" | "DURING_WORK");
          setAnswers({});
        }}
      >
        <option value="TBM">TBM · 작업 전</option>
        <option value="DURING_WORK">작업 중</option>
      </FloatSelect>
      {items.map((c, index) => (
        <fieldset className="wo-risk" key={c.id}>
          <legend>
            {index + 1}. {c.text}
          </legend>
          <div className="inspection-options">
            {Object.entries(RESULT_LABEL).map(([value, label]) => (
              <label key={value}>
                <input
                  type="radio"
                  name={"bf-result-" + c.id}
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
          <FloatTextarea
            id={"bf-comment-" + c.id}
            label="코멘트"
            name={"bf-comment-" + c.id}
            maxLength={2000}
            disabled={pending}
          />
          {answers[c.id] === "FAIL" && (
            <FloatSelect
              id={"bf-manager-" + c.id}
              label="알림 대상 관리자"
              name={"bf-manager-" + c.id}
              defaultValue=""
              required
              disabled={pending}
            >
              <option value="" disabled>
                담당 관리자 선택
              </option>
              {managers.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.display_name}
                </option>
              ))}
            </FloatSelect>
          )}
        </fieldset>
      ))}
      <button className="btn-primary" disabled={pending || !items.length}>
        <UserPlus size={14} />
        {pending ? "저장 중…" : "사후 입력으로 저장"}
      </button>
    </form>
  );
}

/**
 * 저장된 결과 수정. 사유가 필수이고 수정 전·후가 통째로 남는다.
 * 이미 조치완료된 부적합을 되돌리는 것은 서버가 거부한다.
 */
export function ReviseForm({
  inspectionId,
  results,
  managers,
}: {
  inspectionId: string;
  results: Array<{
    result_id: string;
    item_text: string;
    result: string;
    comment: string;
    assigned_manager_id: string | null;
  }>;
  managers: Member[];
}) {
  const [state, action, pending] = useActionState(
    reviseInspectionAction,
    undefined,
  );
  const [answers, setAnswers] = useState<Record<string, string>>(
    Object.fromEntries(results.map((r) => [r.result_id, r.result])),
  );
  const send = (form: FormData) => {
    const payload = new FormData();
    payload.set(
      "payload",
      JSON.stringify({
        inspectionId,
        reason: String(form.get("reason") ?? ""),
        results: results.map((r) => ({
          resultId: r.result_id,
          result: form.get("rv-result-" + r.result_id),
          comment: String(form.get("rv-comment-" + r.result_id) ?? ""),
          managerId: String(form.get("rv-manager-" + r.result_id) ?? ""),
        })),
      }),
    );
    action(payload);
  };
  return (
    <form action={send} className="inspection-form wo-revise-form">
      <Feedback state={state} />
      {results.map((r) => (
        <fieldset className="wo-risk" key={r.result_id}>
          <legend>{r.item_text}</legend>
          <div className="inspection-options">
            {Object.entries(RESULT_LABEL).map(([value, label]) => (
              <label key={value}>
                <input
                  type="radio"
                  name={"rv-result-" + r.result_id}
                  value={value}
                  required
                  defaultChecked={r.result === value}
                  disabled={pending}
                  onChange={() =>
                    setAnswers((old) => ({ ...old, [r.result_id]: value }))
                  }
                />
                {label}
              </label>
            ))}
          </div>
          <FloatTextarea
            id={"rv-comment-" + r.result_id}
            label="코멘트"
            name={"rv-comment-" + r.result_id}
            maxLength={2000}
            defaultValue={r.comment}
            disabled={pending}
          />
          {answers[r.result_id] === "FAIL" && (
            <FloatSelect
              id={"rv-manager-" + r.result_id}
              label="알림 대상 관리자"
              name={"rv-manager-" + r.result_id}
              defaultValue={r.assigned_manager_id ?? ""}
              required
              disabled={pending}
            >
              <option value="" disabled>
                담당 관리자 선택
              </option>
              {managers.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.display_name}
                </option>
              ))}
            </FloatSelect>
          )}
        </fieldset>
      ))}
      <FloatTextarea
        id={"rv-reason-" + inspectionId}
        label="수정 사유 (필수)"
        name="reason"
        required
        maxLength={500}
        disabled={pending}
        hint="예) 현장에서 항목을 잘못 눌러 적합으로 저장됨"
      />
      <button className="btn-primary" disabled={pending}>
        <Save size={14} />
        {pending ? "저장 중…" : "수정하고 이력 남기기"}
      </button>
    </form>
  );
}

/** 수정 이력. 원본이 무엇이었는지가 감사에서 답해야 하는 질문이다. */
export function RevisionLog({
  items,
}: {
  items: Array<{
    id: string;
    revised_by_name: string;
    revised_at: string;
    reason: string;
    before_json: Array<{ item_text: string; result: string }>;
    after_json: Array<{ item_text: string; result: string }>;
  }>;
}) {
  if (!items.length) return <p>수정된 기록이 없습니다.</p>;
  return (
    <ul className="wo-history">
      {items.map((v) => {
        const changed = v.after_json.filter(
          (a, i) => v.before_json[i]?.result !== a.result,
        );
        return (
          <li key={v.id}>
            <time>
              {new Date(v.revised_at).toLocaleString("ko-KR", {
                timeZone: "Asia/Seoul",
              })}
            </time>
            <span>
              <History size={12} /> {v.revised_by_name} · {v.reason}
              {changed.length > 0 && (
                <>
                  {" — "}
                  {changed
                    .map((a, i) => {
                      const before = v.before_json.find(
                        (b) => b.item_text === a.item_text,
                      );
                      return `${a.item_text}: ${
                        RESULT_LABEL[
                          (before?.result ?? "") as keyof typeof RESULT_LABEL
                        ] ?? "-"
                      } → ${
                        RESULT_LABEL[a.result as keyof typeof RESULT_LABEL] ??
                        "-"
                      }${i < changed.length - 1 ? "," : ""}`;
                    })
                    .join(" ")}
                </>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

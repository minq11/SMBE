"use client";
import { useActionState, useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Camera, CheckCircle2, Save, X } from "lucide-react";
import { uploadImage } from "@/features/attachments/upload";
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
  canAttach = false,
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
  /** 유료 여부. 사진 첨부는 요금제만 가르고 역할은 보지 않는다. */
  canAttach?: boolean;
}) {
  const [state, action, pending] = useActionState(
    submitInspectionAction,
    undefined,
  );
  const router = useRouter();
  const [requestId] = useState(() => crypto.randomUUID());
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [reviewed, setReviewed] = useState(previousActions.length === 0);
  // 항목별로 고른 사진. 붙일 자리(결과 행)가 저장 후에 생기므로 그때까지 들고 있는다.
  const [photos, setPhotos] = useState<Record<string, File[]>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (previousActions.length && !reviewed && !dialog.current?.open)
      dialog.current?.showModal();
  }, [previousActions.length, reviewed]);

  // 저장 성공 → 들고 있던 사진을 항목별 결과 행에 올리고 → 이동.
  // 사진이 실패해도 점검 기록은 이미 저장됐으므로 이동은 막지 않는다.
  const saved = state?.saved;
  useEffect(() => {
    if (!saved) return;
    let alive = true;
    (async () => {
      const queue = saved.items.flatMap((item) =>
        (photos[item.itemId] ?? []).map((file) => ({
          resultId: item.resultId,
          file,
        })),
      );
      for (let i = 0; i < queue.length; i++) {
        if (!alive) return;
        setUploading(`사진 ${i + 1}/${queue.length} 올리는 중…`);
        try {
          await uploadImage(
            { targetType: "inspection_result", targetId: queue[i].resultId },
            queue[i].file,
          );
        } catch (error) {
          if (!alive) return;
          setUploadError(
            (error instanceof Error ? error.message : "사진 업로드 실패") +
              " — 점검 기록은 저장되었습니다.",
          );
          break;
        }
      }
      if (!alive) return;
      setUploading(null);
      router.push(saved.next);
    })();
    return () => {
      alive = false;
    };
    // photos 는 저장 시점에 고정된 값으로 읽으면 충분하다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);
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
            {canAttach && (
              <div className="inspection-photos">
                <label className="attach-uploader-cta">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    hidden
                    disabled={pending}
                    onChange={(event) => {
                      const picked = Array.from(event.target.files ?? []).filter(
                        (f) => f.type.startsWith("image/"),
                      );
                      if (picked.length)
                        setPhotos((old) => ({
                          ...old,
                          [c.id]: [...(old[c.id] ?? []), ...picked],
                        }));
                      event.target.value = "";
                    }}
                  />
                  <Camera size={14} />
                  <span>사진 추가</span>
                </label>
                {(photos[c.id] ?? []).map((file, i) => (
                  <span className="inspection-photo-chip" key={file.name + i}>
                    {file.name}
                    <button
                      type="button"
                      aria-label={`${file.name} 빼기`}
                      disabled={pending}
                      onClick={() =>
                        setPhotos((old) => ({
                          ...old,
                          [c.id]: (old[c.id] ?? []).filter(
                            (_, index) => index !== i,
                          ),
                        }))
                      }
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
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
        {uploadError && (
          <p role="alert" className="wo-error">
            {uploadError}
          </p>
        )}
        <p className="wo-muted">
          본인 이름·역할·실제 저장 시각·진입경로가 기록됩니다. 부적합은 선택한
          관리자의 안전점검 알림함에 등록됩니다.{" "}
          {canAttach
            ? "사진은 저장할 때 항목별로 함께 올라갑니다."
            : "사진 첨부는 유료 요금제에서 이용할 수 있습니다."}{" "}
          저장 후 수정은 아직 지원하지 않습니다.
        </p>
        <button
          className="btn-primary"
          disabled={
            pending || !!saved || !reviewed || checklist.length === 0
          }
        >
          <Save size={14} />
          {uploading
            ? uploading
            : pending || saved
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

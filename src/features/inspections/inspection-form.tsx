"use client";
import {
  useActionState,
  useCallback,
  useRef,
  useState,
  useEffect,
} from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  CheckCheck,
  CheckCircle2,
  MessageSquare,
  Save,
  X,
} from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { FloatSelect, FloatTextarea } from "@/components/ui/float-field";
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
  // 코멘트 칸은 불량·해당없음일 때만 편다. 양호 열 줄에 빈 칸 열 개는 소음이다.
  const [noteOpen, setNoteOpen] = useState<Record<string, boolean>>({});
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
  // 저장 후에는 고칠 수 없으므로, 저장 전에 무엇을 저장하는지 한 번 보여 준다.
  const { confirm, dialog: confirmDialog } = useConfirm();
  const formRef = useRef<HTMLFormElement>(null);
  const confirmed = useRef(false);
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    if (confirmed.current) {
      confirmed.current = false;
      return;
    }
    event.preventDefault();
    const counts = { PASS: 0, FAIL: 0, NA: 0 } as Record<string, number>;
    for (const c of checklist)
      counts[answers[c.id] ?? ""] = (counts[answers[c.id] ?? ""] ?? 0) + 1;
    const overall = String(
      new FormData(event.currentTarget).get("overall") ?? "",
    ).trim();
    const summary =
      `${RESULT_LABEL.PASS} ${counts.PASS}건 · ${RESULT_LABEL.FAIL} ${counts.FAIL}건 · ${RESULT_LABEL.NA} ${counts.NA}건` +
      (overall ? "\n종합의견: " + overall : "") +
      (counts.FAIL > 0 ? "\n불량은 선택한 관리자의 알림함에 등록됩니다." : "") +
      "\n저장 후에는 수정할 수 없습니다.";
    void confirm(summary, {
      title:
        category === "TBM"
          ? "TBM 확인을 저장할까요?"
          : "작업 중 점검을 저장할까요?",
      confirmLabel: "저장",
    }).then((ok) => {
      if (!ok) return;
      confirmed.current = true;
      formRef.current?.requestSubmit();
    });
  };
  // 현장에서는 대부분 전부 양호이다. 항목마다 누르게 하면 그만큼 빠뜨린다.
  const markAllPass = () =>
    setAnswers(Object.fromEntries(checklist.map((c) => [c.id, "PASS"])));

  // 저장 성공 → 들고 있던 사진을 항목별 결과 행에 올리고 → 이동.
  //
  // 사진이 실패하면 **이동하지 않는다.** 점검 기록 자체는 이미 저장됐지만,
  // 실패 문구를 띄우자마자 다음 화면으로 넘어가면 아무도 그 문구를 못 읽고
  // 사진까지 저장된 줄 안다. 현장 사진은 불량의 증거라 "올라간 줄 알았다" 가
  // 제일 나쁜 결과다. 멈춘 자리를 기억해 두고 [다시 시도] 가 그 자리부터 잇는다.
  const saved = state?.saved;
  const queueRef = useRef<Array<{ resultId: string; file: File }>>([]);
  const cursorRef = useRef(0);
  const aliveRef = useRef(true);
  useEffect(() => () => void (aliveRef.current = false), []);

  const runUploads = useCallback(async () => {
    if (!saved) return;
    setUploadError(null);
    const queue = queueRef.current;
    for (let i = cursorRef.current; i < queue.length; i++) {
      if (!aliveRef.current) return;
      cursorRef.current = i;
      setUploading(`사진 ${i + 1}/${queue.length} 올리는 중…`);
      try {
        await uploadImage(
          { targetType: "inspection_result", targetId: queue[i].resultId },
          queue[i].file,
        );
      } catch (error) {
        if (!aliveRef.current) return;
        setUploading(null);
        setUploadError(
          `사진 ${i + 1}/${queue.length} 장을 올리지 못했습니다` +
            (error instanceof Error ? ` (${error.message})` : "") +
            ". 점검 기록은 저장되었습니다 — 다시 시도하거나, 사진 없이 넘어갈 수 있습니다.",
        );
        return;
      }
    }
    cursorRef.current = queue.length;
    if (!aliveRef.current) return;
    setUploading(null);
    router.push(saved.next);
  }, [saved, router]);

  useEffect(() => {
    if (!saved) return;
    queueRef.current = saved.items.flatMap((item) =>
      (photos[item.itemId] ?? []).map((file) => ({
        resultId: item.resultId,
        file,
      })),
    );
    cursorRef.current = 0;
    // 렌더 중에 state 를 건드리지 않도록 다음 틱에 시작한다
    // (작업지시 폼의 보관본 복구와 같은 방식).
    const timer = setTimeout(() => void runUploads(), 0);
    return () => clearTimeout(timer);
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
      overallComment: String(form.get("overall") ?? ""),
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
          <h2 id="previous-actions-title">이전 회차 불량 조치 내용</h2>
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
      {confirmDialog}
      <form
        ref={formRef}
        action={send}
        onSubmit={onSubmit}
        className="inspection-form"
      >
        {state?.error && (
          <p role="alert" className="wo-error">
            {state.error}
          </p>
        )}
        {checklist.length > 1 && (
          <p className="inspection-bulk">
            <button
              type="button"
              className="btn-secondary"
              disabled={pending}
              onClick={markAllPass}
            >
              <CheckCheck size={14} /> 전부 {RESULT_LABEL.PASS}으로 표시
            </button>
          </p>
        )}
        {checklist.map((c, index) => (
          <fieldset className="wo-risk" key={c.id}>
            <legend>
              {index + 1}. {c.text}
            </legend>
            <div className="inspection-options">
              {Object.entries(RESULT_LABEL).map(([value, label]) => (
                <label key={value} data-result={value}>
                  <input
                    type="radio"
                    name={"result-" + c.id}
                    value={value}
                    required
                    disabled={pending}
                    checked={answers[c.id] === value}
                    onChange={() =>
                      setAnswers((old) => ({ ...old, [c.id]: value }))
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
            {answers[c.id] === "FAIL" ||
            answers[c.id] === "NA" ||
            noteOpen[c.id] ? (
              <FloatTextarea
                id={"inspection-comment-" + c.id}
                label="코멘트"
                name={"comment-" + c.id}
                maxLength={2000}
                disabled={pending}
              />
            ) : (
              <button
                type="button"
                className="text-button inspection-note-toggle"
                disabled={pending}
                onClick={() => setNoteOpen((old) => ({ ...old, [c.id]: true }))}
              >
                <MessageSquare size={14} /> 코멘트 쓰기
              </button>
            )}
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
                      const picked = Array.from(
                        event.target.files ?? [],
                      ).filter((f) => f.type.startsWith("image/"));
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
              <FloatSelect
                id={"inspection-manager-" + c.id}
                label="알림 대상 관리자"
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
              </FloatSelect>
            )}
          </fieldset>
        ))}
        {/* 종합의견은 선택이다. 항목 코멘트는 그 항목 얘기고, 여기는 오늘 작업 전체에
            대해 한마디 — 위험성평가에서 작업자 의견으로 모아 본다. */}
        <FloatTextarea
          id="inspection-overall"
          label="종합의견 (선택)"
          name="overall"
          rows={2}
          maxLength={2000}
          disabled={pending}
          hint="오늘 작업 전체에 대해 한마디. 예: 야간엔 통로 조명이 어둡다"
        />
        {category === "TBM" && (
          <label className="inspection-confirm">
            <input
              type="checkbox"
              name="confirmed"
              required
              disabled={pending}
            />
            위험요인·감소대책을 확인했고, 내 이름으로 TBM 참여를 기록합니다.
          </label>
        )}
        {/* 사진이 실패하면 여기서 멈춘다. 저장 단추는 이미 막혀 있으므로
            나갈 길을 같이 둔다 — 아니면 화면에 갇힌다. */}
        {uploadError && (
          <div className="inspection-upload-failed">
            <p role="alert" className="wo-error">
              {uploadError}
            </p>
            <div className="inspection-upload-failed-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={() => void runUploads()}
                disabled={!!uploading}
              >
                <Camera size={14} /> 사진 다시 올리기
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => saved && router.push(saved.next)}
                disabled={!!uploading}
              >
                사진 없이 계속
              </button>
            </div>
          </div>
        )}
        {/* 좁은 화면에서 아래에 붙는다. 항목이 많아도 저장이 보인다. */}
        <div className="inspection-form-actions">
          <button
            className="btn-primary"
            disabled={pending || !!saved || !reviewed || checklist.length === 0}
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
        </div>
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
      <FloatTextarea
        id={"finding-resolution-" + id}
        label="조치 내용"
        name="resolution"
        required
        maxLength={4000}
        disabled={pending}
      />
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

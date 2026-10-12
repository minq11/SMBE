"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { FloatField, FloatTextarea } from "@/components/ui/float-field";
import {
  FormErrorDialog,
  useFormError,
} from "@/components/ui/form-error-dialog";
import { HelpDialog } from "@/components/ui/help-dialog";
import { PeoplePickerDialog } from "@/components/ui/people-picker";
import { seoulToday } from "@/features/work-orders/model";
import {
  KIND_HINT,
  KIND_LABEL,
  TRAINING_KINDS,
  type TrainingKind,
} from "./model";
import { createTrainingAction } from "./actions";

type Member = { user_id: string; display_name: string; role: string };

/** 교육 한 번 등록. 종류 → 날짜·시간 → 내용 → 참석자. 저장하면 교육 목록으로. */
export function TrainingSessionForm({
  members,
  initialKind,
}: {
  members: Member[];
  initialKind?: TrainingKind;
}) {
  const [kind, setKind] = useState<TrainingKind>(initialKind ?? "REGULAR");
  const [heldOn, setHeldOn] = useState(seoulToday());
  const [hours, setHours] = useState("1");
  const [topic, setTopic] = useState("");
  const [instructor, setInstructor] = useState("");
  const [note, setNote] = useState("");
  const [attendees, setAttendees] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const err = useFormError();
  const router = useRouter();
  return (
    <form
      className="policy-form-page"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          err.clear();
          const result = await createTrainingAction({
            kind,
            heldOn,
            hours: Number(hours),
            topic,
            instructor,
            note,
            attendeeIds: attendees,
          });
          if (result.error) return err.show(result.error);
          router.push("/training");
          router.refresh();
        });
      }}
    >
      <fieldset className="policy-card policy-fields" disabled={pending}>
        <div className="wo-section-head">
          <h2>교육</h2>
          <HelpDialog title="안전보건교육" variant="icon">
            <dl className="help-rows">
              <dt>무엇</dt>
              <dd>
                산업안전보건법 29조의 네 가지 교육을 한 번 할 때마다 한 건
                적습니다.
              </dd>
              <dt>시간</dt>
              <dd>
                채용 시 8시간, 정기 반기 12시간(관리감독자 연 16시간), 작업내용
                변경 시 2시간, 특별 16시간 이상. 일용근로자·사무직은 더 짧은
                기준이 있습니다.
              </dd>
              <dt>TBM</dt>
              <dd>
                매일 TBM 을 하면 그 시간을 정기교육에 산입할 수 있습니다. 교육
                화면 머리의 TBM 산입에서 정합니다.
              </dd>
            </dl>
          </HelpDialog>
        </div>
        <div
          className="seg-row training-kinds"
          role="radiogroup"
          aria-label="교육 종류"
        >
          {TRAINING_KINDS.map((k) => (
            <label key={k} className="seg-option">
              <input
                type="radio"
                name="kind"
                value={k}
                checked={kind === k}
                onChange={() => setKind(k)}
              />
              <span>{KIND_LABEL[k]}</span>
            </label>
          ))}
        </div>
        <p className="wo-muted training-kind-hint">{KIND_HINT[kind]}</p>
        <div className="policy-fields-row">
          <FloatField
            id="training-held-on"
            label="교육일"
            type="date"
            value={heldOn}
            required
            onChange={(e) => setHeldOn(e.target.value)}
          />
          <FloatField
            id="training-hours"
            label="시간"
            type="number"
            inputMode="decimal"
            min={0.5}
            max={24}
            step={0.5}
            value={hours}
            required
            onChange={(e) => setHours(e.target.value)}
          />
        </div>
        <FloatField
          id="training-topic"
          label="교육 내용"
          hint="프레스 끼임 예방, 보호구 착용"
          maxLength={200}
          value={topic}
          required
          onChange={(e) => setTopic(e.target.value)}
        />
        <FloatField
          id="training-instructor"
          label="강사 (선택)"
          hint="김반장 / 외부 강사 이름"
          maxLength={100}
          value={instructor}
          onChange={(e) => setInstructor(e.target.value)}
        />
        <FloatTextarea
          id="training-note"
          label="비고 (선택)"
          rows={2}
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </fieldset>
      <fieldset className="policy-card policy-fields" disabled={pending}>
        {/* 제목은 인원 선택의 legend 가 맡는다 — 두 번 쓰지 않는다. */}
        <PeoplePickerDialog
          legend="참석자"
          members={members}
          selected={attendees}
          onToggle={(id) =>
            setAttendees((prev) =>
              prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
            )
          }
        />
      </fieldset>
      <div className="form-actions sticky-actions">
        <button type="submit" className="btn-primary" disabled={pending}>
          <Save size={14} /> {pending ? "저장 중…" : "교육 저장"}
        </button>
      </div>
      <FormErrorDialog message={err.message} nonce={err.nonce} />
    </form>
  );
}

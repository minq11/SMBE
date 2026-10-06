"use client";

import { useActionState, useEffect, useId, useMemo, useState } from "react";
import { HelpDialog } from "@/components/ui/help-dialog";
import Link from "next/link";
import { Link2, Plus, Save, Search, Trash2, X } from "lucide-react";
import {
  FloatField,
  FloatSelect,
  FloatTextarea,
} from "@/components/ui/float-field";
import { FormErrorDialog } from "@/components/ui/form-error-dialog";
import { JumpNav } from "@/components/ui/jump-nav";
import { PickerDialog } from "@/components/ui/picker-dialog";
import { Segmented } from "@/features/assessments/risk-level-picker";
import type { MemberOption } from "@/features/work-orders/model";
import type { LocationOption } from "@/features/work-orders/work-order-form";
import type { CopySourceOrder } from "@/server/work-orders";
import { seoulToday } from "@/features/work-orders/model";
import { saveIncidentAction } from "./actions";
import {
  DUTY_LABEL,
  GRADE_LABEL,
  KIND_LABEL,
  OCCURRENCE_LABEL,
  OCCURRENCE_TYPES,
  dutiesFor,
  fromOccurredAt,
  gradeOf,
  type IncidentDetail,
  type IncidentKind,
  type OccurrenceType,
} from "./model";

const PARTS = [
  { id: "inc-what", label: "무슨 일" },
  { id: "inc-victims", label: "다친 사람" },
  { id: "inc-response", label: "바로 한 조치" },
  { id: "inc-cause", label: "원인·재발방지" },
];
const CUSTOM_LOCATION = "__custom__";

type VictimDraft = {
  key: string;
  userId: string;
  bodyPart: string;
  injury: string;
  expectedLeaveDays: string;
  fatal: boolean;
  treatmentMonths: string;
  hospital: string;
};
type ActionDraft = {
  key: string;
  id?: string;
  measure: string;
  responsibleId: string;
  dueOn: string;
};
type Draft = {
  kind: IncidentKind | "";
  occurredOn: string;
  occurredTime: string;
  locationId: string;
  location: string;
  locationDetail: string;
  workOrderId: string;
  workOrderName: string;
  occurrenceType: OccurrenceType | "";
  description: string;
  immediateAction: string;
  workStopped: boolean;
  evacuated: boolean;
  cause: string;
  victims: VictimDraft[];
  actions: ActionDraft[];
};

let seq = 0;
const key = () => `k${++seq}`;
const blankVictim = (): VictimDraft => ({
  key: key(),
  userId: "",
  bodyPart: "",
  injury: "",
  expectedLeaveDays: "0",
  fatal: false,
  treatmentMonths: "0",
  hospital: "",
});
const blankAction = (): ActionDraft => ({
  key: key(),
  measure: "",
  responsibleId: "",
  dueOn: "",
});

function fromDetail(d?: IncidentDetail): Draft {
  if (!d)
    return {
      kind: "",
      occurredOn: seoulToday(),
      occurredTime: "",
      locationId: "",
      location: "",
      locationDetail: "",
      workOrderId: "",
      workOrderName: "",
      occurrenceType: "",
      description: "",
      immediateAction: "",
      workStopped: false,
      evacuated: false,
      cause: "",
      victims: [],
      actions: [blankAction()],
    };
  const { day, time } = fromOccurredAt(d.occurred_at);
  return {
    kind: d.kind,
    occurredOn: day,
    occurredTime: time,
    locationId: d.location_id ?? "",
    location: d.location,
    locationDetail: d.location_detail,
    workOrderId: d.work_order_id ?? "",
    workOrderName: d.work_order_name ?? "",
    occurrenceType: d.occurrence_type,
    description: d.description,
    immediateAction: d.immediate_action,
    workStopped: d.work_stopped,
    evacuated: d.evacuated,
    cause: d.cause,
    victims: d.victims.map((v) => ({
      key: key(),
      userId: v.user_id,
      bodyPart: v.body_part,
      injury: v.injury,
      expectedLeaveDays: String(v.expected_leave_days),
      fatal: v.fatal,
      treatmentMonths: String(v.treatment_months),
      hospital: v.hospital,
    })),
    actions: d.actions.length
      ? d.actions.map((a) => ({
          key: key(),
          id: a.id,
          measure: a.measure,
          responsibleId: a.responsible_user_id ?? "",
          dueOn: a.due_on ?? "",
        }))
      : [blankAction()],
  };
}

// 할 일 미리보기의 번호. 일곱을 넘을 일은 없다(할 일 종류가 일곱).
const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦"];

/**
 * 사고 등록·수정. 한 장, 구간 칩(헌법 1-6): 무슨 일 → 다친 사람 → 바로 한 조치 →
 * 원인·재발방지. 등급은 서버가 정하지만 같은 규칙으로 미리 보여 준다 — 저장하면
 * 어떤 할 일이 생기는지 알고 저장한다.
 */
export function IncidentForm({
  initial,
  members,
  locations,
  orders,
  scpa,
}: {
  initial?: IncidentDetail;
  members: MemberOption[];
  locations: LocationOption[];
  orders: CopySourceOrder[];
  /** 중처법 적용 회사 (5인 이상). 경영책임자 확인 할 일이 생긴다. */
  scpa: boolean;
}) {
  const uid = useId();
  const [data, setData] = useState<Draft>(() => fromDetail(initial));
  const [locationCustom, setLocationCustom] = useState(
    () =>
      Boolean(initial?.location) &&
      !initial?.location_id &&
      locations.length > 0,
  );
  const [dirty, setDirty] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [orderQuery, setOrderQuery] = useState("");
  const [state, action, pending] = useActionState(
    saveIncidentAction,
    undefined,
  );
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setData((d) => ({ ...d, [k]: v }));
    setDirty(true);
  };

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // 저장 전 미리 보는 등급과 할 일 — 서버와 같은 규칙(model.ts).
  const preview = useMemo(() => {
    if (!data.kind) return null;
    const victims = data.victims.map((v) => ({
      fatal: v.fatal,
      expectedLeaveDays: Number(v.expectedLeaveDays) || 0,
      treatmentMonths: Number(v.treatmentMonths) || 0,
    }));
    const grade = gradeOf(data.kind, victims);
    return {
      grade,
      duties: dutiesFor(grade, data.occurredOn || seoulToday(), scpa),
    };
  }, [data.kind, data.victims, data.occurredOn, scpa]);

  const payload = JSON.stringify({
    kind: data.kind,
    occurredOn: data.occurredOn,
    occurredTime: data.occurredTime,
    locationId: data.locationId || null,
    location: data.location,
    locationDetail: data.locationDetail,
    workOrderId: data.workOrderId || null,
    occurrenceType: data.occurrenceType,
    description: data.description,
    immediateAction: data.immediateAction,
    workStopped: data.workStopped,
    evacuated: data.evacuated,
    cause: data.cause,
    victims:
      data.kind === "INJURY"
        ? data.victims.map((v) => ({
            userId: v.userId,
            bodyPart: v.bodyPart,
            injury: v.injury,
            expectedLeaveDays: Number(v.expectedLeaveDays) || 0,
            fatal: v.fatal,
            treatmentMonths: Number(v.treatmentMonths) || 0,
            hospital: v.hospital,
          }))
        : [],
    actions: data.actions
      .filter((a) => a.measure.trim())
      .map((a) => ({
        id: a.id,
        measure: a.measure,
        responsibleId: a.responsibleId || null,
        dueOn: a.dueOn || null,
      })),
  });

  const filteredOrders = orders.filter(
    (o) =>
      !orderQuery.trim() ||
      o.name.includes(orderQuery.trim()) ||
      o.location.includes(orderQuery.trim()),
  );

  return (
    <div className="wo-editor">
      <JumpNav items={PARTS} />
      <div className="wo-section">
        <form
          action={action}
          className="inc-form"
          onSubmit={() => setDirty(false)}
        >
          <input type="hidden" name="id" value={initial?.id ?? ""} />
          <input type="hidden" name="payload" value={payload} />
          <FormErrorDialog message={state?.error} nonce={state} />

          <section className="wo-part" id="inc-what">
            <h2>무슨 일</h2>
            <Segmented<IncidentKind>
              label="구분"
              value={data.kind}
              options={[
                { value: "NEAR_MISS", label: "아차사고 (다친 사람 없음)" },
                { value: "INJURY", label: "재해 (부상·질병·사망)" },
              ]}
              onChange={(v) => {
                set("kind", v);
                if (v === "INJURY" && data.victims.length === 0)
                  set("victims", [blankVictim()]);
              }}
            />
            <div className="inc-row">
              <FloatField
                id={`${uid}-day`}
                label="발생일"
                type="date"
                value={data.occurredOn}
                max={seoulToday()}
                onChange={(e) => set("occurredOn", e.target.value)}
              />
              <FloatField
                id={`${uid}-time`}
                label="발생 시각"
                type="time"
                value={data.occurredTime}
                onChange={(e) => set("occurredTime", e.target.value)}
              />
            </div>
            {locations.length > 0 && (
              <FloatSelect
                id={`${uid}-location-pick`}
                label="장소 선택"
                value={
                  locationCustom
                    ? CUSTOM_LOCATION
                    : (locations.find((l) => l.id === data.locationId)?.id ??
                      "")
                }
                onChange={(e) => {
                  const custom = e.target.value === CUSTOM_LOCATION;
                  setLocationCustom(custom);
                  const picked = locations.find((l) => l.id === e.target.value);
                  setData((d) => ({
                    ...d,
                    locationId: custom ? "" : (picked?.id ?? ""),
                    location: custom ? "" : (picked?.label ?? ""),
                  }));
                  setDirty(true);
                }}
              >
                <option value="">장소 선택</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
                <option value={CUSTOM_LOCATION}>직접 입력…</option>
              </FloatSelect>
            )}
            {(locations.length === 0 || locationCustom) && (
              <FloatField
                id={`${uid}-location`}
                label={locations.length > 0 ? "장소 직접 입력" : "장소"}
                value={data.location}
                maxLength={200}
                onChange={(e) => set("location", e.target.value)}
                autoComplete="off"
              />
            )}
            <FloatField
              id={`${uid}-location-detail`}
              label="상세 위치"
              hint="예: 2호 프레스 뒤 통로"
              value={data.locationDetail}
              maxLength={200}
              onChange={(e) => set("locationDetail", e.target.value)}
            />

            {/* 지시서 연결 — 그 작업에서 난 사고면 잇는다. 이름은 사본으로 남아
                지시서가 바뀌거나 취소돼도 사고 기록은 그대로다. */}
            <div className="wo-sub-head">작업지시 연결 (선택)</div>
            {data.workOrderId ? (
              <div
                className="inc-linked"
                role="group"
                aria-label="연결한 지시서"
              >
                <Link2 size={15} />
                <strong>{data.workOrderName}</strong>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="지시서 연결 해제"
                  onClick={() => {
                    set("workOrderId", "");
                    set("workOrderName", "");
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setOrderOpen(true)}
                disabled={orders.length === 0}
              >
                <Search size={14} />{" "}
                {orders.length ? "지시서 고르기" : "발급된 지시서 없음"}
              </button>
            )}
            <PickerDialog
              open={orderOpen}
              onClose={() => setOrderOpen(false)}
              title="어느 작업에서 난 사고인가요?"
              query={orderQuery}
              onQuery={setOrderQuery}
              searchLabel="지시서 찾기"
              searchPlaceholder="작업명·장소"
            >
              <ul className="wo-std-list wo-std-list--dialog" role="list">
                {filteredOrders.slice(0, 30).map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      className="wo-std-option"
                      onClick={() => {
                        set("workOrderId", o.id);
                        set("workOrderName", o.name);
                        setOrderOpen(false);
                      }}
                    >
                      <span className="wo-std-option-icon">
                        <Link2 size={16} />
                      </span>
                      <span className="wo-std-option-copy">
                        <strong>{o.name}</strong>
                        <small>
                          {o.start_date
                            ? o.start_date +
                              (o.end_date && o.end_date !== o.start_date
                                ? " ~ " + o.end_date
                                : "")
                            : "일정 없음"}
                          {o.location ? " · " + o.location : ""}
                        </small>
                      </span>
                    </button>
                  </li>
                ))}
                {filteredOrders.length === 0 && (
                  <li className="wo-muted">맞는 지시서가 없습니다.</li>
                )}
              </ul>
            </PickerDialog>

            <fieldset className="inc-types">
              <legend>발생형태</legend>
              <div
                className="inc-types-grid"
                role="radiogroup"
                aria-label="발생형태"
              >
                {OCCURRENCE_TYPES.map((t) => (
                  <label
                    key={t}
                    className={`seg-btn${data.occurrenceType === t ? " is-on" : ""}`}
                  >
                    <input
                      type="radio"
                      name={`${uid}-type`}
                      value={t}
                      checked={data.occurrenceType === t}
                      onChange={() => set("occurrenceType", t)}
                    />
                    {OCCURRENCE_LABEL[t]}
                  </label>
                ))}
              </div>
            </fieldset>
            <FloatTextarea
              id={`${uid}-description`}
              label="사고 내용"
              rows={4}
              maxLength={4000}
              hint="누가, 무엇을 하다가, 어떻게 됐는지"
              value={data.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </section>

          <section className="wo-part" id="inc-victims">
            <div className="wo-section-head">
              <h2>다친 사람</h2>
              <HelpDialog title="다친 사람" variant="icon">
                <dl className="help-rows">
                  <dt>누구</dt>
                  <dd>구성원만. 외부인은 사고 내용에 적습니다.</dd>
                  <dt>기준</dt>
                  <dd>예상 휴업일 3일 이상이면 산업재해조사표 대상, 사망이면 중대재해.</dd>
                </dl>
              </HelpDialog>
            </div>
            {data.kind !== "INJURY" ? (
              <p className="wo-muted">
                {data.kind === "NEAR_MISS"
                  ? "아차사고는 다친 사람이 없습니다. 다친 사람이 있으면 위에서 재해로 바꾸세요."
                  : "위에서 구분을 먼저 고르세요."}
              </p>
            ) : (
              <>
                <ul className="inc-cards" role="list">
                  {data.victims.map((v, i) => (
                    <li key={v.key} className="inc-card">
                      <div className="inc-card-head">
                        <strong>다친 사람 {i + 1}</strong>
                        {data.victims.length > 1 && (
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`다친 사람 ${i + 1} 삭제`}
                            onClick={() =>
                              set(
                                "victims",
                                data.victims.filter((x) => x.key !== v.key),
                              )
                            }
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                      <FloatSelect
                        id={`${uid}-v-${v.key}-user`}
                        label="구성원"
                        value={v.userId}
                        onChange={(e) =>
                          patchVictim(v.key, { userId: e.target.value })
                        }
                      >
                        <option value="">구성원 선택</option>
                        {members.map((m) => (
                          <option key={m.user_id} value={m.user_id}>
                            {m.display_name}
                          </option>
                        ))}
                      </FloatSelect>
                      <div className="inc-row">
                        <FloatField
                          id={`${uid}-v-${v.key}-part`}
                          label="다친 부위"
                          hint="예: 오른손 검지"
                          value={v.bodyPart}
                          maxLength={100}
                          onChange={(e) =>
                            patchVictim(v.key, { bodyPart: e.target.value })
                          }
                        />
                        <FloatField
                          id={`${uid}-v-${v.key}-injury`}
                          label="부상·질병"
                          hint="예: 골절, 열상"
                          value={v.injury}
                          maxLength={200}
                          onChange={(e) =>
                            patchVictim(v.key, { injury: e.target.value })
                          }
                        />
                      </div>
                      <div className="inc-row">
                        <FloatField
                          id={`${uid}-v-${v.key}-leave`}
                          label="예상 휴업일 (일)"
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={3650}
                          value={v.expectedLeaveDays}
                          onChange={(e) =>
                            patchVictim(v.key, {
                              expectedLeaveDays: e.target.value,
                            })
                          }
                        />
                        <FloatField
                          id={`${uid}-v-${v.key}-months`}
                          label="예상 치료 기간 (개월)"
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={120}
                          value={v.treatmentMonths}
                          onChange={(e) =>
                            patchVictim(v.key, {
                              treatmentMonths: e.target.value,
                            })
                          }
                        />
                      </div>
                      <FloatField
                        id={`${uid}-v-${v.key}-hospital`}
                        label="병원 (선택)"
                        value={v.hospital}
                        maxLength={200}
                        onChange={(e) =>
                          patchVictim(v.key, { hospital: e.target.value })
                        }
                      />
                      <label className="board-check inc-check">
                        <input
                          type="checkbox"
                          checked={v.fatal}
                          onChange={(e) =>
                            patchVictim(v.key, { fatal: e.target.checked })
                          }
                        />
                        <span>
                          <strong>사망</strong>
                          <small>중대재해 · 노동부 즉시 보고</small>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() =>
                    set("victims", [...data.victims, blankVictim()])
                  }
                >
                  <Plus size={14} /> 다친 사람 추가
                </button>
              </>
            )}
            {preview && (
              <p className="inc-preview" aria-live="polite">
                등급{" "}
                <strong data-grade={preview.grade}>
                  {GRADE_LABEL[preview.grade]}
                </strong>
                {" · "}할 일{" "}
                {preview.duties.map((d, i) => (
                  <span className="inc-preview-duty" key={d.kind}>
                    {CIRCLED[i] ?? i + 1} {DUTY_LABEL[d.kind].title}
                  </span>
                ))}
              </p>
            )}
          </section>

          <section className="wo-part" id="inc-response">
            <h2>바로 한 조치</h2>
            <label className="board-check inc-check">
              <input
                type="checkbox"
                checked={data.workStopped}
                onChange={(e) => set("workStopped", e.target.checked)}
              />
              <span>
                <strong>작업을 중지했다</strong>
                <small>산안법 54조 — 사고 직후 그 작업은 멈춘다.</small>
              </span>
            </label>
            <label className="board-check inc-check">
              <input
                type="checkbox"
                checked={data.evacuated}
                onChange={(e) => set("evacuated", e.target.checked)}
              />
              <span>
                <strong>근로자를 대피시켰다</strong>
                <small>위험이 남아 있으면 자리를 비운다.</small>
              </span>
            </label>
            <FloatTextarea
              id={`${uid}-immediate`}
              label="응급조치·바로 한 일"
              rows={3}
              maxLength={2000}
              hint="예: 119 신고, 지혈 후 병원 이송, 설비 전원 차단"
              value={data.immediateAction}
              onChange={(e) => set("immediateAction", e.target.value)}
            />
          </section>

          <section className="wo-part" id="inc-cause">
            <h2>원인·재발방지</h2>
            <FloatTextarea
              id={`${uid}-cause`}
              label="원인"
              rows={3}
              maxLength={2000}
              hint="왜 일어났는지 — 설비·방법·사람·환경"
              value={data.cause}
              onChange={(e) => set("cause", e.target.value)}
            />
            <div className="wo-sub-head">재발방지대책</div>
            <ul className="inc-cards" role="list">
              {data.actions.map((a, i) => (
                <li key={a.key} className="inc-card">
                  <div className="inc-card-head">
                    <strong>대책 {i + 1}</strong>
                    {data.actions.length > 1 && (
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`대책 ${i + 1} 삭제`}
                        onClick={() =>
                          set(
                            "actions",
                            data.actions.filter((x) => x.key !== a.key),
                          )
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                  <FloatTextarea
                    id={`${uid}-a-${a.key}-measure`}
                    label="대책"
                    rows={2}
                    maxLength={1000}
                    hint="예: 프레스 광전자식 방호장치 설치"
                    value={a.measure}
                    onChange={(e) =>
                      patchAction(a.key, { measure: e.target.value })
                    }
                  />
                  <div className="inc-row">
                    <FloatSelect
                      id={`${uid}-a-${a.key}-who`}
                      label="담당"
                      value={a.responsibleId}
                      onChange={(e) =>
                        patchAction(a.key, { responsibleId: e.target.value })
                      }
                    >
                      <option value="">담당 선택</option>
                      {members.map((m) => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.display_name}
                        </option>
                      ))}
                    </FloatSelect>
                    <FloatField
                      id={`${uid}-a-${a.key}-due`}
                      label="기한"
                      type="date"
                      value={a.dueOn}
                      onChange={(e) =>
                        patchAction(a.key, { dueOn: e.target.value })
                      }
                    />
                  </div>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => set("actions", [...data.actions, blankAction()])}
            >
              <Plus size={14} /> 대책 추가
            </button>
          </section>

          <div className="wo-actions">
            {initial && (
              <Link href={`/incidents/${initial.id}`} className="btn-secondary">
                <X size={14} /> 취소
              </Link>
            )}
            <button type="submit" className="btn-primary" disabled={pending}>
              <Save size={14} />
              {pending ? "저장 중…" : initial ? "저장" : "사고 등록"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  function patchVictim(k: string, patch: Partial<VictimDraft>) {
    set(
      "victims",
      data.victims.map((v) => (v.key === k ? { ...v, ...patch } : v)),
    );
  }
  function patchAction(k: string, patch: Partial<ActionDraft>) {
    set(
      "actions",
      data.actions.map((a) => (a.key === k ? { ...a, ...patch } : a)),
    );
  }
}

export { KIND_LABEL };

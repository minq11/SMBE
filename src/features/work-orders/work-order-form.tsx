"use client";
import {
  cloneElement,
  useActionState,
  useId,
  useState,
  type ReactElement,
} from "react";
import Link from "next/link";
import { saveOrderAction } from "./actions";
import { shiftMinutes, type WorkDraft, type MemberOption } from "./model";

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactElement<{ id?: string }>;
}) {
  const id = useId();
  return (
    <div className="wo-field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, { id })}
    </div>
  );
}
export function WorkOrderForm({
  id,
  revision,
  initial,
  members,
}: {
  id: string;
  revision: number;
  initial: WorkDraft;
  members: MemberOption[];
}) {
  const [data, setData] = useState(initial);
  const [step, setStep] = useState(0);
  const [state, action, pending] = useActionState(saveOrderAction, undefined);
  const set = <K extends keyof WorkDraft>(key: K, value: WorkDraft[K]) =>
    setData((d) => ({ ...d, [key]: value }));
  const toggle = (key: "participantIds" | "assigneeIds", id: string) =>
    set(
      key,
      data[key].includes(id)
        ? data[key].filter((x) => x !== id)
        : [...data[key], id],
    );
  const minutes = shiftMinutes(data.startTime, data.endTime);
  return (
    <form action={action} className="wo-editor">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="revision" value={revision} />
      <input type="hidden" name="payload" value={JSON.stringify(data)} />
      <nav className="wo-steps" aria-label="작성 단계">
        {["작업 정보", "위험성평가", "일정·인원", "체크리스트·검토"].map(
          (title, i) => (
            <button
              type="button"
              key={title}
              aria-current={step === i ? "step" : undefined}
              onClick={() => setStep(i)}
            >
              <span>{i + 1}</span>
              {title}
            </button>
          ),
        )}
      </nav>
      <div className="wo-editor-grid">
        <div className="wo-section">
          {state?.error && (
            <p role="alert" className="form-error">
              {state.error}
            </p>
          )}
          {step === 0 && (
            <>
              <h2>표준서 없이 작업 시작</h2>
              <p className="wo-muted">
                간이평가도 위험요인·대책·참여자 기록과 승인이 필요합니다. 표준서
                연계와 검토된 업종별 템플릿은 다음 단계에서 제공됩니다.
              </p>
              <Field label="작업명">
                <input
                  value={data.name}
                  maxLength={120}
                  onChange={(e) => set("name", e.target.value)}
                />
              </Field>
              <Field label="작업 단계·방법">
                <textarea
                  rows={6}
                  value={data.method}
                  maxLength={4000}
                  onChange={(e) => set("method", e.target.value)}
                  placeholder="실제 작업 순서와 방법을 작성하세요."
                />
              </Field>
              <Field label="조 이름 (선택)">
                <input
                  value={data.groupLabel}
                  maxLength={40}
                  onChange={(e) => set("groupLabel", e.target.value)}
                  placeholder="주간조 / 야간조"
                />
              </Field>
              <Field label="PTW(위험작업허가) 필요 여부">
                <select
                  value={data.ptwRequired ? "yes" : "no"}
                  onChange={(e) => set("ptwRequired", e.target.value === "yes")}
                >
                  <option value="no">불필요</option>
                  <option value="yes">필요</option>
                </select>
              </Field>
              {data.ptwRequired && (
                <p className="wo-notice">
                  PTW가 필요한 작업은 임시저장만 가능합니다. 허가 기능 구현
                  전에는 발급이 차단됩니다. 필요로 저장한 뒤에는 불필요로 내릴
                  수 없습니다.
                </p>
              )}
            </>
          )}
          {step === 1 && (
            <>
              <h2>현장 위험요인과 대책</h2>
              <p className="wo-muted">
                기본값으로 위험을 판단하지 않습니다. 현장에서 확인한 수준과 허용
                여부를 직접 선택하세요.
              </p>
              <div className="wo-columns">
                <Field label="실시 구분">
                  <select
                    value={data.assessmentKind}
                    onChange={(e) =>
                      set(
                        "assessmentKind",
                        e.target.value as WorkDraft["assessmentKind"],
                      )
                    }
                  >
                    <option value="FIRST">최초</option>
                    <option value="PERIODIC">정기</option>
                    <option value="AD_HOC">수시</option>
                    <option value="CONTINUOUS">상시</option>
                  </select>
                </Field>
                <Field label="평가 실시일">
                  <input
                    type="date"
                    value={data.performedOn}
                    onChange={(e) => set("performedOn", e.target.value)}
                  />
                </Field>
              </div>
              <Field label="적용한 위험성 수준 판단 기준">
                <textarea
                  rows={3}
                  value={data.criteria}
                  onChange={(e) => set("criteria", e.target.value)}
                  maxLength={4000}
                  placeholder="회사가 정한 상·중·하 기준과 허용 가능한 수준을 적어 주세요."
                />
              </Field>
              {data.risks.map((risk, i) => {
                const update = (key: keyof typeof risk, value: string) =>
                  set(
                    "risks",
                    data.risks.map((r, index) =>
                      index === i ? { ...r, [key]: value } : r,
                    ),
                  );
                return (
                  <fieldset className="wo-risk" key={i}>
                    <legend>위험요인 {i + 1}</legend>
                    <Field label="유해·위험요인">
                      <textarea
                        value={risk.hazard}
                        onChange={(e) => update("hazard", e.target.value)}
                        maxLength={4000}
                      />
                    </Field>
                    <div className="wo-columns">
                      <Field label="위험성 수준">
                        <select
                          value={risk.level}
                          onChange={(e) => update("level", e.target.value)}
                        >
                          <option value="">선택하세요</option>
                          <option value="HIGH">상</option>
                          <option value="MID">중</option>
                          <option value="LOW">하</option>
                        </select>
                      </Field>
                      <Field label="허용 가능 여부">
                        <select
                          value={risk.allowable}
                          onChange={(e) => update("allowable", e.target.value)}
                        >
                          <option value="">선택하세요</option>
                          <option value="yes">허용 가능</option>
                          <option value="no">허용 불가 · 조치 필요</option>
                        </select>
                      </Field>
                    </div>
                    <Field label="감소대책">
                      <textarea
                        value={risk.measure}
                        onChange={(e) => update("measure", e.target.value)}
                        maxLength={4000}
                      />
                    </Field>
                    <div className="wo-columns">
                      <Field label="조치 담당자">
                        <select
                          value={risk.responsibleId}
                          onChange={(e) =>
                            update("responsibleId", e.target.value)
                          }
                        >
                          <option value="">선택하세요</option>
                          {members.map((m) => (
                            <option key={m.user_id} value={m.user_id}>
                              {m.display_name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="조치 예정일">
                        <input
                          type="date"
                          value={risk.dueDate}
                          onChange={(e) => update("dueDate", e.target.value)}
                        />
                      </Field>
                    </div>
                    {data.risks.length > 1 && (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() =>
                          set(
                            "risks",
                            data.risks.filter((_, n) => n !== i),
                          )
                        }
                      >
                        위험요인 {i + 1} 삭제
                      </button>
                    )}
                  </fieldset>
                );
              })}
              <button
                type="button"
                className="btn-secondary"
                disabled={data.risks.length >= 50}
                onClick={() =>
                  set("risks", [
                    ...data.risks,
                    {
                      hazard: "",
                      level: "",
                      allowable: "",
                      measure: "",
                      responsibleId: "",
                      dueDate: "",
                    },
                  ])
                }
              >
                위험요인 추가
              </button>
              <h3>사전조사한 안전보건정보</h3>
              {(
                [
                  ["equipment", "기계·기구·설비 사양"],
                  ["materials", "취급 유해물질·MSDS 정보"],
                  ["environment", "공정·작업 주변 환경"],
                  ["history", "과거 재해·아차사고 이력"],
                ] as const
              ).map(([key, label]) => (
                <Field key={key} label={label}>
                  <textarea
                    value={data.safetyInfo[key]}
                    maxLength={4000}
                    onChange={(e) =>
                      set("safetyInfo", {
                        ...data.safetyInfo,
                        [key]: e.target.value,
                      })
                    }
                    placeholder="확인한 내용을 입력하세요. 해당사항이 없으면 그 사실을 적어 주세요."
                  />
                </Field>
              ))}
              <fieldset className="wo-people">
                <legend>평가에 실제 참여한 근로자</legend>
                {members.map((m) => (
                  <label key={m.user_id}>
                    <input
                      type="checkbox"
                      checked={data.participantIds.includes(m.user_id)}
                      onChange={() => toggle("participantIds", m.user_id)}
                    />
                    {m.display_name}
                  </label>
                ))}
              </fieldset>
            </>
          )}
          {step === 2 && (
            <>
              <h2>일정과 배정 인원</h2>
              <p className="wo-muted">
                한국시간 기준입니다. 종료시간이 시작시간보다 이르면 다음 날
                종료하는 야간작업으로 계산합니다. 매일 같은 시간에 작업하며,
                주·야간조는 지시서를 따로 작성하세요.
              </p>
              <div className="wo-columns">
                <Field label="작업 시작일">
                  <input
                    type="date"
                    value={data.startDate}
                    onChange={(e) => set("startDate", e.target.value)}
                  />
                </Field>
                <Field label="작업 종료일">
                  <input
                    type="date"
                    value={data.endDate}
                    onChange={(e) => set("endDate", e.target.value)}
                  />
                </Field>
                <Field label="시작시간">
                  <input
                    type="time"
                    value={data.startTime}
                    onChange={(e) => set("startTime", e.target.value)}
                  />
                </Field>
                <Field label="종료시간">
                  <input
                    type="time"
                    value={data.endTime}
                    onChange={(e) => set("endTime", e.target.value)}
                  />
                </Field>
              </div>
              <p className="wo-muted">
                하루 작업시간: {Math.floor(minutes / 60)}시간 {minutes % 60}분 ·
                최대 16시간
              </p>
              <Field label="작업 장소">
                <input
                  value={data.location}
                  maxLength={200}
                  onChange={(e) => set("location", e.target.value)}
                  placeholder="장소를 직접 입력해도 됩니다."
                />
              </Field>
              <fieldset className="wo-people">
                <legend>작업자 배정 ({data.assigneeIds.length}명)</legend>
                {members.map((m) => (
                  <label key={m.user_id}>
                    <input
                      type="checkbox"
                      checked={data.assigneeIds.includes(m.user_id)}
                      onChange={() => toggle("assigneeIds", m.user_id)}
                    />
                    {m.display_name}
                  </label>
                ))}
              </fieldset>
              <Link
                href="/company/members"
                target="_blank"
                rel="noopener"
                className="text-button"
              >
                구성원 초대 (새 탭)
              </Link>
              <p className="wo-muted">
                새 구성원이 합류한 뒤에는 먼저 임시저장하고 편집 화면을 다시
                열어 주세요.
              </p>
            </>
          )}
          {step === 3 && (
            <>
              <h2>체크리스트 확인</h2>
              <p className="wo-muted">
                임시저장 후 상세 화면에서 평가 승인과 발급을 진행합니다. 평가
                내용을 수정하면 기존 승인 연결이 해제됩니다.
              </p>
              {(
                [
                  ["tbm", "TBM · 작업 전"],
                  ["during", "작업 중"],
                ] as const
              ).map(([key, title]) => (
                <fieldset className="wo-risk" key={key}>
                  <legend>{title}</legend>
                  {data[key].map((value, i) => (
                    <div className="wo-check-edit" key={i}>
                      <Field label={title + " 항목 " + (i + 1)}>
                        <input
                          maxLength={500}
                          value={value}
                          onChange={(e) =>
                            set(
                              key,
                              data[key].map((v, n) =>
                                n === i ? e.target.value : v,
                              ),
                            )
                          }
                        />
                      </Field>
                      {data[key].length > 1 && (
                        <button
                          type="button"
                          className="btn-secondary"
                          aria-label={title + " 항목 " + (i + 1) + " 삭제"}
                          onClick={() =>
                            set(
                              key,
                              data[key].filter((_, n) => n !== i),
                            )
                          }
                        >
                          삭제
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={data[key].length >= 50}
                    onClick={() => set(key, [...data[key], ""])}
                  >
                    항목 추가
                  </button>
                </fieldset>
              ))}
              <p className="wo-notice">
                발급 후 작업 내용·평가·체크리스트는 고정됩니다. 변경이 필요하면
                취소 후 복사해 재발급하세요. TBM·작업 중 점검 결과 입력은 아직
                제공하지 않습니다.
              </p>
            </>
          )}
          <div className="wo-actions">
            {step > 0 && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setStep(step - 1)}
              >
                이전
              </button>
            )}
            {step < 3 && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setStep(step + 1)}
              >
                다음
              </button>
            )}
            <button type="submit" className="btn-primary" disabled={pending}>
              {pending ? "저장 중…" : "임시저장"}
            </button>
          </div>
        </div>
        <aside className="wo-summary">
          <h2>작성 중인 작업</h2>
          <strong>{data.name || "작업명을 입력하세요"}</strong>
          <dl>
            <dt>장소</dt>
            <dd>{data.location || "미입력"}</dd>
            <dt>기간</dt>
            <dd>
              {data.startDate || "미선택"} ~ {data.endDate || "미선택"}
            </dd>
            <dt>배정</dt>
            <dd>{data.assigneeIds.length}명</dd>
            <dt>평가 참여</dt>
            <dd>{data.participantIds.length}명</dd>
            <dt>PTW</dt>
            <dd>{data.ptwRequired ? "필요 · 발급 차단" : "불필요"}</dd>
          </dl>
          <p className="wo-muted">
            단계 이동 시 입력값은 유지됩니다. 페이지를 나가기 전에는
            임시저장하세요.
          </p>
        </aside>
      </div>
    </form>
  );
}

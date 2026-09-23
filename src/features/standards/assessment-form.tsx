"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Plus, Save, X } from "lucide-react";
import { PeoplePicker } from "@/components/ui/people-picker";
import {
  RiskItemCard,
  blankRiskCard,
  type RiskCardValue,
} from "@/features/assessments/risk-item-card";
import { addAssessmentAction, type StandardActionState } from "./actions";

type Kind = "FIRST" | "PERIODIC" | "AD_HOC" | "CONTINUOUS";
type SafetyInfo = {
  equipment: string;
  materials: string;
  environment: string;
  history: string;
};
type Member = { user_id: string; display_name: string; role: string };

export type AssessmentSeed = {
  work_method: string;
  safety_info: SafetyInfo;
  risks: RiskCardValue[];
};

const KIND_OPTIONS: Array<{ key: Kind; label: string; note: string }> = [
  { key: "PERIODIC", label: "정기평가", note: "매년 1회" },
  { key: "AD_HOC", label: "수시평가", note: "설비·물질·인력 변경, 사고 뒤" },
  { key: "CONTINUOUS", label: "상시평가", note: "정기평가를 상시 활동으로" },
  { key: "FIRST", label: "최초평가", note: "처음부터 다시" },
];

const todayKst = () =>
  new Date(new Date().getTime() + 9 * 3600_000).toISOString().slice(0, 10);

/**
 * 평가 회차 추가. 세 덩어리 — 실시 정보, 위험요인·대책, 참여자.
 *
 * 정기평가는 지난 평가를 다시 보는 일이다. 그래서 지난 회차의 위험요인·대책·
 * 안전보건정보를 그대로 채워 두고, 바뀐 것만 고치게 한다. 판단 기준은 회사가
 * 정한 값이라 여기서 적지 않는다 (서버가 회사 기준을 사본으로 남긴다).
 */
export function AssessmentForm({
  standardId,
  standardName,
  members,
  criteria,
  seed,
}: {
  standardId: string;
  standardName: string;
  members: Member[];
  /** 회사의 위험성 판단 기준 (읽기만) */
  criteria: string;
  seed?: AssessmentSeed;
}) {
  const [kind, setKind] = useState<Kind>("PERIODIC");
  const [performedOn, setPerformedOn] = useState(todayKst());
  const [workMethod, setWorkMethod] = useState(seed?.work_method ?? "");
  const [safety, setSafety] = useState<SafetyInfo>(
    seed?.safety_info ?? {
      equipment: "",
      materials: "",
      environment: "",
      history: "",
    },
  );
  const [risks, setRisks] = useState<RiskCardValue[]>(
    seed?.risks.length ? seed.risks : [blankRiskCard()],
  );
  const [participants, setParticipants] = useState<string[]>([]);
  const [state, formAction, pending] = useActionState<
    StandardActionState,
    FormData
  >(addAssessmentAction, undefined);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      kind,
      performed_on: performedOn,
      work_method: workMethod.trim(),
      safety_info: {
        equipment: safety.equipment.trim(),
        materials: safety.materials.trim(),
        environment: safety.environment.trim(),
        history: safety.history.trim(),
      },
      risks: risks.map((r) => ({
        hazard: r.hazard.trim(),
        initial_risk_level: r.level as "HIGH" | "MID" | "LOW",
        initial_allowable: r.allowable === "yes",
        reduction_measure: r.measure.trim(),
        responsible_user_id: r.responsibleId || null,
        planned_completion_date: r.dueDate || null,
      })),
      participant_user_ids: participants,
    };
    const form = new FormData(e.target as HTMLFormElement);
    form.set("standard_id", standardId);
    form.set("payload", JSON.stringify(payload));
    formAction(form);
  };

  const seeded = Boolean(seed?.risks.length);

  return (
    <form action={formAction} onSubmit={handleSubmit} className="std-form">
      <header className="std-form-hero">
        <h1>{standardName} · 평가 회차 추가</h1>
        <p>
          {seeded
            ? "지난 회차의 위험요인과 대책이 채워져 있습니다. 바뀐 것만 고치고 저장하세요."
            : "이 표준서의 새 평가 회차를 등록합니다. 저장하면 지시서 발급의 기준이 됩니다."}
        </p>
      </header>

      <nav className="std-jump" aria-label="구간 이동">
        <a href="#asmt-info">실시 정보</a>
        <a href="#asmt-risks">위험요인</a>
        <a href="#asmt-people">참여자</a>
      </nav>

      {state?.error && (
        <div className="form-error" role="alert">
          {state.error}
        </div>
      )}

      <section className="std-form-section" id="asmt-info">
        <h2>실시 정보</h2>
        <div className="form-field">
          <label>평가 유형</label>
          <div className="std-kind-choices">
            {KIND_OPTIONS.map((opt) => (
              <button
                type="button"
                key={opt.key}
                className={`std-kind-choice${kind === opt.key ? " is-active" : ""}`}
                aria-pressed={kind === opt.key}
                onClick={() => setKind(opt.key)}
              >
                <strong>{opt.label}</strong>
                <small>{opt.note}</small>
              </button>
            ))}
          </div>
        </div>
        <div className="form-field">
          <label htmlFor="asmt-performed-on">평가 실시일</label>
          <input
            id="asmt-performed-on"
            type="date"
            value={performedOn}
            onChange={(e) => setPerformedOn(e.target.value)}
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="asmt-method">작업방법 요약</label>
          <textarea
            id="asmt-method"
            rows={2}
            maxLength={4000}
            value={workMethod}
            onChange={(e) => setWorkMethod(e.target.value)}
          />
        </div>
        <details className="std-fold" open={!seeded}>
          <summary>
            사전조사 안전보건정보 {seeded ? "(지난 회차 값 그대로)" : ""}
          </summary>
          <div className="std-safety-grid">
            {(
              [
                ["equipment", "기계·기구·설비"],
                ["materials", "취급 유해물질"],
                ["environment", "공정·주변 환경"],
                ["history", "재해·아차사고 이력"],
              ] as const
            ).map(([key, label]) => (
              <div className="form-field" key={key}>
                <label htmlFor={`asmt-${key}`}>{label}</label>
                <textarea
                  id={`asmt-${key}`}
                  rows={2}
                  maxLength={2000}
                  value={safety[key]}
                  onChange={(e) =>
                    setSafety({ ...safety, [key]: e.target.value })
                  }
                />
              </div>
            ))}
          </div>
        </details>
        <details className="std-fold">
          <summary>적용하는 위험성 판단 기준 (회사 기준)</summary>
          <pre className="criteria-readonly">{criteria}</pre>
          <p className="std-form-note">
            바꾸려면{" "}
            <Link href="/company/criteria">회사정보 &gt; 위험성 판단 기준</Link>{" "}
            에서 수정하세요. 이미 승인된 평가는 영향을 받지 않습니다.
          </p>
        </details>
      </section>

      <section className="std-form-section" id="asmt-risks">
        <h2>위험요인 · 감소대책</h2>
        <ol className="risk-card-list">
          {risks.map((r, i) => (
            <li key={i}>
              <RiskItemCard
                index={i}
                value={r}
                members={members}
                onChange={(next) =>
                  setRisks(risks.map((x, n) => (n === i ? next : x)))
                }
                onRemove={
                  risks.length > 1
                    ? () => setRisks(risks.filter((_, n) => n !== i))
                    : undefined
                }
              />
            </li>
          ))}
        </ol>
        <button
          type="button"
          className="btn-secondary"
          disabled={risks.length >= 30}
          onClick={() => setRisks([...risks, blankRiskCard()])}
        >
          <Plus size={14} /> 위험요인 추가
        </button>
      </section>

      <section className="std-form-section" id="asmt-people">
        <h2>참여자</h2>
        {members.length === 0 ? (
          <p className="std-form-note">
            구성원이 없어요. 인원관리에서 초대해 주세요.
          </p>
        ) : (
          <PeoplePicker
            legend="평가에 실제 참여한 근로자"
            members={members}
            selected={participants}
            onToggle={(id) =>
              setParticipants((p) =>
                p.includes(id) ? p.filter((x) => x !== id) : [...p, id],
              )
            }
          />
        )}
      </section>

      <div className="std-form-actions sticky-actions">
        <Link href={`/standards/${standardId}`} className="ghost-button">
          <X size={13} /> 취소
        </Link>
        <button type="submit" className="primary-button" disabled={pending}>
          <Save size={14} />
          {pending ? "저장 중…" : "평가 저장"}
        </button>
      </div>
    </form>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  CircleHelp,
  Info,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { SIZE_BANDS, type SizeBand } from "@/features/guide/data";
import {
  INDUSTRY_CHOICES,
  QUESTIONS,
  SECTION_META,
  type Answers,
  type Question,
  type SectionKey,
  type Targeting,
} from "./questions";
import {
  SECTION_ORDER,
  computeResult,
  scoreDiagnostic,
  type CheckResult,
  type SectionResult,
} from "./scoring";

type Step = "intro" | "targeting" | SectionKey | "result";
const STORAGE_KEY = "smbe.recognition-check.v2";

type SessionState = { targeting: Targeting; answers: Answers };

function loadState(): SessionState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SessionState;
  } catch {
    return null;
  }
}
function saveState(state: SessionState) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}
function clearState() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function CheckView() {
  const [step, setStep] = useState<Step>("intro");
  const [targeting, setTargeting] = useState<Targeting>({
    industry: null,
    sizeBand: null,
  });
  const [answers, setAnswers] = useState<Answers>({});

  useEffect(() => {
    const saved = loadState();
    if (saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTargeting(saved.targeting);
      setAnswers(saved.answers);
    }
  }, []);
  useEffect(() => {
    saveState({ targeting, answers });
  }, [targeting, answers]);

  const result = useMemo(
    () => computeResult(targeting, answers),
    [targeting, answers],
  );

  const targetingComplete =
    targeting.industry !== null && targeting.sizeBand !== null;

  const reset = () => {
    setTargeting({ industry: null, sizeBand: null });
    setAnswers({});
    clearState();
    setStep("intro");
  };

  const nextAfter = (current: Step): Step => {
    if (current === "intro") return "targeting";
    if (current === "targeting") return "SECTION_I";
    const idx = SECTION_ORDER.indexOf(current as SectionKey);
    if (idx >= 0 && idx < SECTION_ORDER.length - 1)
      return SECTION_ORDER[idx + 1];
    return "result";
  };
  const prevOf = (current: Step): Step => {
    if (current === "result") return "SECTION_IV";
    const idx = SECTION_ORDER.indexOf(current as SectionKey);
    if (idx > 0) return SECTION_ORDER[idx - 1];
    if (idx === 0) return "targeting";
    if (current === "targeting") return "intro";
    return "intro";
  };

  return (
    <>
      <ProgressBar step={step} />
      {step === "intro" && (
        <IntroPanel
          onStart={() => setStep("targeting")}
          onReset={reset}
          hasSaved={
            targetingComplete || Object.keys(answers).length > 0
          }
        />
      )}
      {step === "targeting" && (
        <TargetingStep
          value={targeting}
          onChange={setTargeting}
          onNext={() => setStep(nextAfter("targeting"))}
          onBack={() => setStep("intro")}
          canContinue={targetingComplete}
        />
      )}
      {SECTION_ORDER.map((sk) =>
        step === sk ? (
          <SectionStep
            key={sk}
            sectionKey={sk}
            answers={answers}
            onChange={setAnswers}
            onNext={() => setStep(nextAfter(sk))}
            onBack={() => setStep(prevOf(sk))}
          />
        ) : null,
      )}
      {step === "result" && (
        <ResultPanel
          result={result}
          onBack={() => setStep("SECTION_IV")}
          onReset={reset}
        />
      )}
    </>
  );
}

// -----------------------------------------------------------------------------
// Progress bar
// -----------------------------------------------------------------------------

function ProgressBar({ step }: { step: Step }) {
  const steps: Array<{ key: Step; label: string }> = [
    { key: "targeting", label: "1. 신청대상" },
    { key: "SECTION_I", label: "2. Ⅰ 관심도" },
    { key: "SECTION_II", label: "3. Ⅱ 실행수준" },
    { key: "SECTION_III", label: "4. Ⅲ 참여" },
    { key: "SECTION_IV", label: "5. Ⅳ 재해" },
    { key: "result", label: "6. 결과" },
  ];
  const stepIdx = steps.findIndex((s) => s.key === step);
  return (
    <ol className="check-progress" aria-label="진행 단계">
      {steps.map((s, i) => {
        const state =
          i < stepIdx ? "done" : i === stepIdx ? "current" : "todo";
        return (
          <li key={s.key} className={`check-progress-step is-${state}`}>
            <span className="check-progress-dot" aria-hidden="true">
              {i + 1}
            </span>
            <span>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

// -----------------------------------------------------------------------------
// Intro
// -----------------------------------------------------------------------------

function IntroPanel({
  onStart,
  onReset,
  hasSaved,
}: {
  onStart: () => void;
  onReset: () => void;
  hasSaved: boolean;
}) {
  return (
    <section className="check-panel">
      <span className="check-eyebrow">자가진단</span>
      <h1>위험성평가 인정 준비도 진단</h1>
      <p className="check-lead">
        안전보건공단 <strong>위험성평가 우수사업장 인정제도</strong> 의 공식
        심사기준(2024.12.18 개정) 을 그대로 반영해 우리 회사의 준비도를
        계산합니다. 실제 인정은 KOSHA 별도 심사를 거칩니다.
      </p>
      <ul className="check-bullet">
        <li>
          <Check size={14} /> 4개 심사항목 · 25문항 · 각 항목 100점 만점.
        </li>
        <li>
          <Check size={14} /> 가중치: 사업주 관심도 10% · 실행수준 60% · 참여
          25% · 재해수준 5%.
        </li>
        <li>
          <Check size={14} /> 인정 부합 판정: <strong>각 항목 70점 이상 AND
          종합 90점 이상</strong>.
        </li>
        <li>
          <Check size={14} /> 답변은 사용자 응답 기준 자가 진단이며, 실제
          인정은 KOSHA 심사원 현장 심사가 필요합니다.
        </li>
      </ul>
      <div className="check-actions">
        {hasSaved && (
          <button type="button" className="ghost-button" onClick={onReset}>
            <RotateCcw size={13} /> 이전 응답 지우고 새로 시작
          </button>
        )}
        <button type="button" className="primary-button" onClick={onStart}>
          <Sparkles size={14} />
          {hasSaved ? "이어서 하기" : "진단 시작"}
        </button>
      </div>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Targeting
// -----------------------------------------------------------------------------

function TargetingStep({
  value,
  onChange,
  onNext,
  onBack,
  canContinue,
}: {
  value: Targeting;
  onChange: (next: Targeting) => void;
  onNext: () => void;
  onBack: () => void;
  canContinue: boolean;
}) {
  return (
    <section className="check-panel">
      <span className="check-eyebrow">1단계 · 신청대상</span>
      <h1>우리 회사가 신청대상인가요?</h1>
      <p className="check-lead">
        위험성평가 우수사업장 인정제도의 신청 대상은{" "}
        <strong>일반 사업장 상시근로자 100명 미만</strong> 입니다. 건설공사는
        총공사금액 기준(120억원 미만·토목 150억원 미만)으로 판단합니다.
      </p>

      <fieldset className="check-field">
        <legend>업종</legend>
        <div className="check-choice-grid">
          {INDUSTRY_CHOICES.map((c) => {
            const active = value.industry === c.value;
            return (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={active}
                className={`check-choice${active ? " is-active" : ""}`}
                onClick={() => onChange({ ...value, industry: c.value })}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="check-field">
        <legend>상시근로자 규모</legend>
        <div className="check-choice-grid check-choice-grid--wide">
          {SIZE_BANDS.map((band) => {
            const active = value.sizeBand === band.key;
            return (
              <button
                key={band.key}
                type="button"
                role="radio"
                aria-checked={active}
                className={`check-choice${active ? " is-active" : ""}`}
                onClick={() =>
                  onChange({ ...value, sizeBand: band.key as SizeBand })
                }
              >
                <strong>{band.label}</strong>
                <small>{band.note}</small>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="check-actions">
        <button type="button" className="ghost-button" onClick={onBack}>
          <ArrowLeft size={13} /> 이전
        </button>
        <button
          type="button"
          className="primary-button"
          disabled={!canContinue}
          onClick={onNext}
        >
          다음 · Ⅰ 사업주 관심도 <ArrowRight size={14} />
        </button>
      </div>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Section step (Ⅰ / Ⅱ / Ⅲ / Ⅳ)
// -----------------------------------------------------------------------------

function SectionStep({
  sectionKey,
  answers,
  onChange,
  onNext,
  onBack,
}: {
  sectionKey: SectionKey;
  answers: Answers;
  onChange: (next: Answers) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const meta = SECTION_META[sectionKey];
  const questions = QUESTIONS.filter((q) => q.section === sectionKey);
  const answeredCount = questions.filter((q) => answers[q.id]).length;

  const setAnswer = (id: string, key: string) =>
    onChange({ ...answers, [id]: key });

  // Section III has subgroups — render with subgroup headers
  const groups =
    sectionKey === "SECTION_III"
      ? [
          {
            key: "III_OWNER",
            title: "사업주 · 임원 · 현장소장 (40점)",
            qs: questions.filter((q) => q.subGroup === "III_OWNER"),
          },
          {
            key: "III_MANAGER",
            title: "관리감독자 (30점)",
            qs: questions.filter((q) => q.subGroup === "III_MANAGER"),
          },
          {
            key: "III_WORKER",
            title: "근로자 (30점)",
            qs: questions.filter((q) => q.subGroup === "III_WORKER"),
          },
        ]
      : [{ key: sectionKey, title: null as string | null, qs: questions }];

  return (
    <section className="check-panel">
      <span className="check-eyebrow">
        {`${meta.number} 심사항목 · 가중치 ${Math.round(meta.weight * 100)}%`}
      </span>
      <h1>{meta.title}</h1>
      <p className="check-lead">{meta.description}</p>
      <p className="check-progress-hint">
        {answeredCount} / {questions.length} 답변 완료 · 각 항목 우수 = 만점,
        보통 = 부분점, 미흡 = 최저점 (KOSHA 공식 배점)
      </p>

      {groups.map((g) => (
        <div key={g.key} className="check-subgroup">
          {g.title && (
            <h3 className="check-subgroup-title">{g.title}</h3>
          )}
          <ol className="check-question-list" role="list">
            {g.qs.map((q) => (
              <QuestionCard
                key={q.id}
                q={q}
                idx={questions.indexOf(q) + 1}
                chosen={answers[q.id] ?? null}
                onSet={(key) => setAnswer(q.id, key)}
              />
            ))}
          </ol>
        </div>
      ))}

      <div className="check-actions">
        <button type="button" className="ghost-button" onClick={onBack}>
          <ArrowLeft size={13} /> 이전
        </button>
        <button
          type="button"
          className="primary-button"
          onClick={onNext}
          disabled={answeredCount < questions.length}
        >
          {sectionKey === "SECTION_IV" ? "결과 보기" : "다음"}{" "}
          <ArrowRight size={14} />
        </button>
      </div>
    </section>
  );
}

function QuestionCard({
  q,
  idx,
  chosen,
  onSet,
}: {
  q: Question;
  idx: number;
  chosen: string | null;
  onSet: (key: string) => void;
}) {
  return (
    <li className="check-question">
      <div className="check-question-head">
        <span className="check-question-number">{idx}</span>
        <div>
          <span className="check-question-category">
            {q.categoryLabel} · 최대 {q.maxScore}점
          </span>
          <strong>{q.text}</strong>
          {q.helper && <small>{q.helper}</small>}
        </div>
      </div>
      <div className="check-answer-row" role="radiogroup" aria-label={q.text}>
        {q.choices.map((c) => {
          const active = chosen === c.key;
          const isTop =
            c.score === Math.max(...q.choices.map((x) => x.score));
          const isBot =
            c.score === Math.min(...q.choices.map((x) => x.score));
          const toneCls = active
            ? isTop
              ? " check-answer-choice--top is-active"
              : isBot
                ? " check-answer-choice--bot is-active"
                : " check-answer-choice--mid is-active"
            : "";
          return (
            <button
              key={c.key}
              type="button"
              role="radio"
              aria-checked={active}
              className={`check-answer-choice${toneCls}`}
              onClick={() => onSet(c.key)}
            >
              <span className="check-answer-choice-label">{c.label}</span>
              {c.detail && (
                <span className="check-answer-choice-detail">{c.detail}</span>
              )}
              <span className="check-answer-choice-score">+{c.score}</span>
            </button>
          );
        })}
      </div>
    </li>
  );
}

// -----------------------------------------------------------------------------
// Result
// -----------------------------------------------------------------------------

function ResultPanel({
  result,
  onBack,
  onReset,
}: {
  result: CheckResult;
  onBack: () => void;
  onReset: () => void;
}) {
  return (
    <section className="check-result">
      <header className="check-result-hero">
        <span className="check-eyebrow">결과</span>
        <h1>진단 결과</h1>
        <p className="check-lead">
          아래는 사용자 응답과 안전보건공단 공식 배점을 그대로 계산한 결과입니다.
          {scoreDiagnostic()} 실제 인정은 KOSHA 현장 심사를 통해 확정됩니다.
        </p>
      </header>

      <div className="check-result-summary">
        <ResultTile
          label="신청대상 검토"
          value={result.eligibility.status}
          tone={
            result.eligibility.status === "부합"
              ? "good"
              : result.eligibility.status === "미부합"
                ? "bad"
                : "warn"
          }
          note={result.eligibility.reason}
        />
        <ResultTile
          label="종합 점수"
          value={`${result.overallScore.toFixed(1)}점 / 100`}
          tone={result.overallPassed ? "good" : "warn"}
          note={
            result.overallPassed
              ? "종합 90점 이상 통과"
              : "종합 90점 이상 필요"
          }
        />
        <ResultTile
          label="인정 판정"
          value={result.passed ? "부합 (모든 기준 통과)" : "보완 필요"}
          tone={result.passed ? "good" : "warn"}
          note={
            result.passed
              ? "각 항목 70점 이상 + 종합 90점 이상 모두 충족"
              : "각 항목 70점 이상 AND 종합 90점 이상 조건 미충족"
          }
        />
      </div>

      {!result.answeredAll && (
        <p className="check-notice" role="alert">
          <CircleAlert size={14} /> 아직{" "}
          {result.totalQuestions - result.answeredQuestions}개 문항이 답변되지
          않아 계산이 정확하지 않을 수 있습니다.
        </p>
      )}

      <section className="stack">
        <h2 className="check-result-heading">항목별 점수 · 가중치 적용</h2>
        <div className="check-section-grid">
          {result.sections.map((s) => (
            <SectionScoreCard key={s.section} section={s} />
          ))}
        </div>
      </section>

      <section className="stack">
        <h2 className="check-result-heading">보완이 필요한 세부항목</h2>
        <NeedsList result={result} />
      </section>

      <section className="check-cta-card">
        <div>
          <strong>심플안전으로 부족한 항목을 채워보세요</strong>
          <p>
            무료로 시작해 위험성평가·작업지시·TBM·점검 기록을 실제 업무에 연결할
            수 있습니다.
          </p>
        </div>
        <Link href="/login?next=/onboarding" className="primary-button">
          무료로 시작 <ArrowRight size={14} />
        </Link>
      </section>

      <div className="check-actions">
        <button type="button" className="ghost-button" onClick={onReset}>
          <RotateCcw size={13} /> 다시 진단하기
        </button>
        <button type="button" className="ghost-button" onClick={onBack}>
          <ArrowLeft size={13} /> 응답 수정
        </button>
        <Link href="/guide" className="ghost-button">
          가이드로 돌아가기 <ArrowRight size={13} />
        </Link>
      </div>

      <p className="check-result-note">
        <Info size={12} /> 출처: 사업장 위험성평가에 관한 지침 [별표]
        위험성평가 인정심사 항목 및 기준 (2024.12.18 개정 · 안전보건공단
        고시). 세부 심사원 판단·현장 확인은 실제 심사에서 이루어집니다.
      </p>
    </section>
  );
}

function ResultTile({
  label,
  value,
  tone,
  note,
}: {
  label: string;
  value: string;
  tone: "good" | "warn" | "bad";
  note: string;
}) {
  return (
    <div className={`check-result-tile check-result-tile--${tone}`}>
      <span className="check-result-tile-label">{label}</span>
      <strong>{value}</strong>
      <p>{note}</p>
    </div>
  );
}

function SectionScoreCard({ section }: { section: SectionResult }) {
  const passed = section.passed;
  return (
    <article
      className={`check-section-card${passed ? " is-passed" : " is-fail"}`}
    >
      <header>
        <span className="check-section-number">{section.number}</span>
        <div>
          <strong>{section.title}</strong>
          <small>
            가중치 {Math.round(section.weight * 100)}% · 필요 70점 이상
          </small>
        </div>
        <span
          className={`check-section-badge${passed ? " is-good" : " is-warn"}`}
        >
          {passed ? "통과" : "보완 필요"}
        </span>
      </header>
      <div className="check-section-bar">
        <div
          className="check-section-bar-fill"
          style={{ width: `${Math.min(100, section.rawScore)}%` }}
        />
        <span className="check-section-bar-threshold" aria-hidden="true" />
      </div>
      <div className="check-section-numbers">
        <span>
          원점수 <strong>{section.rawScore}점</strong> / 100
        </span>
        <span>
          가중 <strong>{section.weightedScore.toFixed(1)}점</strong> /{" "}
          {Math.round(section.weight * 100)}
        </span>
      </div>
    </article>
  );
}

function NeedsList({ result }: { result: CheckResult }) {
  const items = result.sections
    .flatMap((s) => s.items)
    .filter((i) => i.status !== "우수" && i.chosenKey !== null);
  if (items.length === 0) {
    return (
      <p className="check-notice">
        <Check size={14} /> 모든 응답이 최고 등급입니다. 실제 이행·기록의
        완결성만 유지하면 인정 심사에 도전할 수 있습니다.
      </p>
    );
  }
  return (
    <ul className="check-result-list" role="list">
      {items.map((item) => (
        <li
          key={item.question.id}
          className={`check-result-item ${
            item.status === "미흡"
              ? "check-result-item--warn"
              : "check-result-item--unknown"
          }`}
        >
          <span className="check-result-icon" aria-hidden="true">
            {item.status === "미흡" ? (
              <CircleAlert size={14} />
            ) : (
              <CircleHelp size={14} />
            )}
          </span>
          <div className="check-result-body">
            <span className="check-result-category">
              {item.question.categoryLabel}
            </span>
            <strong>{item.question.text}</strong>
            <span className="check-result-status">
              현재 {item.status} ({item.earned} / {item.maxScore}점) — 최대
              {" "}
              {item.maxScore}점까지 획득 가능
            </span>
          </div>
          {item.question.smbeHint && (
            <Link
              href={`/login?next=${encodeURIComponent(item.question.smbeHint.href)}`}
              className="check-result-cta"
            >
              {item.question.smbeHint.label} <ArrowRight size={12} />
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

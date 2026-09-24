"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  CircleHelp,
  Eye,
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
  smbeCoverage,
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
          hasSaved={targetingComplete || Object.keys(answers).length > 0}
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
        const state = i < stepIdx ? "done" : i === stepIdx ? "current" : "todo";
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
        심사기준(2024.12.18 개정) 그대로. 25문항에 답하면 우리 회사 준비도가
        바로 나옵니다.
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
          <Check size={14} /> 인정 부합 판정:{" "}
          <strong>각 항목 70점 이상 AND 종합 90점 이상</strong>.
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

  // 구간마다 key 가 달라 새로 마운트되니 (부모의 SECTION_ORDER.map) 이전 구간의
  // 빨간 표시가 따라올 일이 없다.
  const [invalidIds, setInvalidIds] = useState<Set<string>>(new Set());
  const itemRefs = useRef<Record<string, HTMLLIElement | null>>({});

  const setAnswer = (id: string, key: string) => {
    onChange({ ...answers, [id]: key });
    setInvalidIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  // '다음' 을 막는 대신 눌렀을 때 알려준다 — 비활성 버튼은 왜 안 눌리는지
  // 말해주지 않는다. 안 고른 첫 문항으로 스크롤해 포커스하고 빨갛게 표시한다.
  const handleNext = () => {
    const missing = questions.filter((q) => !answers[q.id]);
    if (missing.length > 0) {
      setInvalidIds(new Set(missing.map((q) => q.id)));
      const target = itemRefs.current[missing[0].id];
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.focus();
      return;
    }
    onNext();
  };

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
          {g.title && <h3 className="check-subgroup-title">{g.title}</h3>}
          <ol className="check-question-list" role="list">
            {g.qs.map((q) => (
              <QuestionCard
                key={q.id}
                q={q}
                idx={questions.indexOf(q) + 1}
                chosen={answers[q.id] ?? null}
                onSet={(key) => setAnswer(q.id, key)}
                isInvalid={invalidIds.has(q.id)}
                registerRef={(el) => {
                  itemRefs.current[q.id] = el;
                }}
              />
            ))}
          </ol>
        </div>
      ))}

      {invalidIds.size > 0 && (
        <p className="check-error" role="alert">
          <CircleAlert size={14} /> 선택하지 않은 문항이 {invalidIds.size}개
          있습니다. 빨갛게 표시된 문항에 답해주세요.
        </p>
      )}

      <div className="check-actions">
        <button type="button" className="ghost-button" onClick={onBack}>
          <ArrowLeft size={13} /> 이전
        </button>
        <button type="button" className="primary-button" onClick={handleNext}>
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
  isInvalid,
  registerRef,
}: {
  q: Question;
  idx: number;
  chosen: string | null;
  onSet: (key: string) => void;
  isInvalid: boolean;
  registerRef: (el: HTMLLIElement | null) => void;
}) {
  return (
    <li
      ref={registerRef}
      tabIndex={-1}
      className={`check-question${isInvalid ? " check-question--invalid" : ""}`}
    >
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
      {isInvalid && (
        <p className="check-question-invalid-note" role="alert">
          <CircleAlert size={13} /> 이 문항에 답하지 않았습니다.
        </p>
      )}
      <div className="check-answer-row" role="radiogroup" aria-label={q.text}>
        {q.choices.map((c) => {
          const active = chosen === c.key;
          const isTop = c.score === Math.max(...q.choices.map((x) => x.score));
          const isBot = c.score === Math.min(...q.choices.map((x) => x.score));
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
          안전보건공단 공식 배점으로 계산한 우리 회사 점수입니다.{" "}
          {scoreDiagnostic()}
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
            result.overallPassed ? "종합 90점 이상 통과" : "종합 90점 이상 필요"
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

      <SmbeSummary result={result} />

      {!result.answeredAll && (
        <p className="check-notice" role="alert">
          <CircleAlert size={14} /> 아직{" "}
          {result.totalQuestions - result.answeredQuestions}개 문항이 비어
          있습니다. 답하면 점수가 정확해집니다.
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

      <NeedsList result={result} />

      <div className="check-actions">
        <button type="button" className="ghost-button" onClick={onReset}>
          <RotateCcw size={13} /> 다시 진단하기
        </button>
        <button type="button" className="ghost-button" onClick={onBack}>
          <ArrowLeft size={13} /> 응답 수정
        </button>
        <Link href="/guide" className="ghost-button">
          <Eye size={13} /> 안전법 가이드 보기
        </Link>
      </div>

      <p className="check-result-note">
        <Info size={12} /> 출처: 사업장 위험성평가에 관한 지침 [별표] 위험성평가
        인정심사 항목 및 기준 (2024.12.18 개정 · 안전보건공단 고시).
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

/**
 * 결과의 본론: 보완 항목 중 몇 개를 심플안전으로 채우고 종합 점수가 얼마나
 * 오르나. 점수 타일 바로 아래에 둔다 — 목록 끝에 있으면 아무도 거기까지 안 간다.
 */
function SmbeSummary({ result }: { result: CheckResult }) {
  const coverage = smbeCoverage(result);
  if (coverage.covered === 0) return null;
  return (
    <section className="check-smbe-summary">
      <div>
        <span className="check-smbe-eyebrow">
          <Sparkles size={14} /> 심플안전으로 채우는 항목
        </span>
        <strong>
          보완 항목 {coverage.needs}개 중 <em>{coverage.covered}개</em>를
          심플안전으로 채웁니다
        </strong>
        <p>
          종합 점수 최대 <em>+{coverage.gain}점</em> · 매일의 작업지시·TBM·점검
          기록이 그대로 증빙이 됩니다.
        </p>
      </div>
      <Link href="/login?next=/onboarding" className="primary-button">
        무료로 시작 <ArrowRight size={14} />
      </Link>
    </section>
  );
}

/**
 * 보완 항목을 둘로 나눈다. 심플안전으로 채우는 것이 먼저 — 섞여 있으면
 * "이걸로 얼마나 해결되나" 가 안 보인다. 직접 챙길 항목은 그 뒤에 흐리게.
 */
function NeedsList({ result }: { result: CheckResult }) {
  const items = result.sections
    .flatMap((s) => s.items)
    .filter((i) => i.status !== "우수" && i.chosenKey !== null);
  if (items.length === 0) {
    return (
      <p className="check-notice">
        <Check size={14} /> 모든 항목이 최고 등급입니다. 지금 바로 인정 신청을
        준비하세요.
      </p>
    );
  }
  const covered = items.filter((i) => i.question.smbeHint);
  const offline = items.filter((i) => !i.question.smbeHint);
  return (
    <>
      {covered.length > 0 && (
        <section className="stack">
          <h2 className="check-result-heading">
            심플안전으로 채우는 항목 ({covered.length})
          </h2>
          <ul className="check-result-list" role="list">
            {covered.map((item) => (
              <NeedItem key={item.question.id} item={item} />
            ))}
          </ul>
        </section>
      )}
      {offline.length > 0 && (
        <section className="stack">
          <h2 className="check-result-heading">직접 챙길 항목</h2>
          <ul className="check-result-list" role="list">
            {offline.map((item) => (
              <NeedItem key={item.question.id} item={item} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function NeedItem({
  item,
}: {
  item: CheckResult["sections"][number]["items"][number];
}) {
  const hint = item.question.smbeHint;
  return (
    <li
      className={`check-result-item ${
        item.status === "미흡"
          ? "check-result-item--warn"
          : "check-result-item--unknown"
      }${hint ? " check-result-item--smbe" : ""}`}
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
          현재 {item.status} ({item.earned} / {item.maxScore}점) — 최대{" "}
          {item.maxScore}점까지 획득 가능
        </span>
        {hint ? (
          <span className="check-result-hint">
            <span className="check-smbe-badge">
              <Check size={12} strokeWidth={3} /> 심플안전 대응
            </span>{" "}
            &lsquo;{hint.label}&rsquo; 에서 바로 기록합니다
          </span>
        ) : (
          <span className="check-result-hint check-result-hint--offline">
            {item.question.offlineTip}
          </span>
        )}
      </div>
      {hint && (
        <Link
          href={`/login?next=${encodeURIComponent(hint.href)}`}
          className="check-result-cta"
        >
          바로가기 <ArrowRight size={14} />
        </Link>
      )}
    </li>
  );
}

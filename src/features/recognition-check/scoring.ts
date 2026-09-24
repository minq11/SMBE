// 위험성평가 인정심사 배점 계산 로직
// 심사 구조: 각 항목 100점 × 가중치 (10/60/25/5) → 종합 100점
// 합격: 각 항목 70점 이상 AND 종합 90점 이상

import {
  QUESTIONS,
  SECTION_META,
  TARGET_LIMIT_HEADCOUNT,
  type Answers,
  type Question,
  type SectionKey,
  type Targeting,
} from "./questions";

const SECTION_MIN = 70;
const OVERALL_MIN = 90;

export type SectionResult = {
  section: SectionKey;
  number: string;
  title: string;
  weight: number;
  rawScore: number;      // 0-100
  weightedScore: number; // 0 - weight*100 (i.e. contributes to overall)
  answeredCount: number;
  totalCount: number;
  passed: boolean;       // rawScore >= 70
  items: Array<{
    question: Question;
    chosenKey: string | null;
    earned: number;
    maxScore: number;
    status: "우수" | "보통" | "미흡" | "미응답";
  }>;
};

export type EligibilityJudgement = {
  status: "부합" | "미부합" | "확인 필요";
  reason: string;
};

export type CheckResult = {
  eligibility: EligibilityJudgement;
  sections: SectionResult[];
  overallScore: number;      // 0-100
  overallPassed: boolean;
  allSectionsPassed: boolean;
  passed: boolean;           // overall + sections both true
  answeredAll: boolean;
  totalQuestions: number;
  answeredQuestions: number;
};

export function evaluateTargeting(targeting: Targeting): EligibilityJudgement {
  if (targeting.industry === null || targeting.sizeBand === null) {
    return {
      status: "확인 필요",
      reason:
        "업종·규모를 모두 선택하세요. 인정 신청대상은 일반 사업장 상시근로자 100인 미만입니다 (건설공사 별도 기준).",
    };
  }
  // 100인 이상은 원칙적으로 우수사업장 인정제도 신청대상 아님
  if (targeting.sizeBand === "FROM_50") {
    // "50인 이상" 은 50~99와 100+ 를 구분 못 하므로 확인 필요로 안내
    return {
      status: "확인 필요",
      reason:
        "50인 이상 구간입니다. 상시근로자 100명 미만이면 신청대상. 100명 이상은 원칙 신청대상 아니니 정확한 인원과 공식 기준을 개별 확인하세요.",
    };
  }
  if (targeting.industry === "construction") {
    return {
      status: "확인 필요",
      reason:
        "건설공사는 인원 기준이 아니라 총공사금액(120억원 미만·토목 150억원 미만) 기준으로 판단합니다. 개별 확인이 필요합니다.",
    };
  }
  return {
    status: "부합",
    reason: `상시근로자 ${TARGET_LIMIT_HEADCOUNT}명 미만 사업장의 신청대상 조건에 부합합니다. 실제 신청은 KOSHA 공식 안내를 확인하세요.`,
  };
}

function statusOf(question: Question, chosenKey: string | null): SectionResult["items"][number]["status"] {
  if (!chosenKey) return "미응답";
  const c = question.choices.find((x) => x.key === chosenKey);
  if (!c) return "미응답";
  // 최고점이면 우수, 최저점이면 미흡, 그 사이는 보통
  const max = Math.max(...question.choices.map((x) => x.score));
  const min = Math.min(...question.choices.map((x) => x.score));
  if (c.score >= max) return "우수";
  if (c.score <= min) return "미흡";
  return "보통";
}

export function computeResult(
  targeting: Targeting,
  answers: Answers,
): CheckResult {
  const bySection: Record<SectionKey, Question[]> = {
    SECTION_I: [],
    SECTION_II: [],
    SECTION_III: [],
    SECTION_IV: [],
  };
  for (const q of QUESTIONS) bySection[q.section].push(q);

  const sections: SectionResult[] = (
    ["SECTION_I", "SECTION_II", "SECTION_III", "SECTION_IV"] as const
  ).map((key) => {
    const meta = SECTION_META[key];
    const qs = bySection[key];
    const items = qs.map((q) => {
      const chosen = answers[q.id] ?? null;
      const c = chosen ? q.choices.find((x) => x.key === chosen) : null;
      return {
        question: q,
        chosenKey: chosen,
        earned: c ? c.score : 0,
        maxScore: q.maxScore,
        status: statusOf(q, chosen),
      };
    });
    const totalMax = items.reduce((a, i) => a + i.maxScore, 0);
    const totalEarned = items.reduce((a, i) => a + i.earned, 0);
    const rawScore = totalMax > 0 ? Math.round((totalEarned / totalMax) * 100) : 0;
    const answeredCount = items.filter((i) => i.chosenKey !== null).length;
    return {
      section: key,
      number: meta.number,
      title: meta.title,
      weight: meta.weight,
      rawScore,
      weightedScore: Math.round(rawScore * meta.weight * 100) / 100,
      answeredCount,
      totalCount: items.length,
      passed: rawScore >= SECTION_MIN,
      items,
    };
  });

  const overallScore =
    Math.round(sections.reduce((a, s) => a + s.rawScore * s.weight, 0) * 100) /
    100;
  const overallPassed = overallScore >= OVERALL_MIN;
  const allSectionsPassed = sections.every((s) => s.passed);
  const passed = overallPassed && allSectionsPassed;
  const answeredQuestions = sections.reduce(
    (a, s) => a + s.answeredCount,
    0,
  );
  const totalQuestions = QUESTIONS.length;

  return {
    eligibility: evaluateTargeting(targeting),
    sections,
    overallScore,
    overallPassed,
    allSectionsPassed,
    passed,
    answeredAll: answeredQuestions === totalQuestions,
    totalQuestions,
    answeredQuestions,
  };
}

export const SECTION_ORDER: SectionKey[] = [
  "SECTION_I",
  "SECTION_II",
  "SECTION_III",
  "SECTION_IV",
];

export function scoreDiagnostic(): string {
  return `각 항목 ${SECTION_MIN}점 이상 · 종합 ${OVERALL_MIN}점 이상 → 인정 부합. 인정 유효기간 3년.`;
}

/**
 * 보완이 필요한 항목 중 심플안전 메뉴로 채울 수 있는 것과, 그 항목을 모두 최고
 * 등급으로 올렸을 때 종합 점수가 오르는 폭. 항목 점수 → 영역 원점수 → 가중치
 * 순으로 공식 배점과 같게 계산하고, 과장하지 않도록 소수 첫째 자리에서 내린다.
 */
export function smbeCoverage(result: CheckResult) {
  let gain = 0;
  let covered = 0;
  let needs = 0;
  for (const s of result.sections) {
    const totalMax = s.items.reduce((a, i) => a + i.maxScore, 0);
    for (const i of s.items) {
      if (i.chosenKey === null || i.status === "우수") continue;
      needs++;
      if (!i.question.smbeHint) continue;
      covered++;
      gain += ((i.maxScore - i.earned) / totalMax) * 100 * s.weight;
    }
  }
  return { needs, covered, gain: Math.floor(gain * 10) / 10 };
}

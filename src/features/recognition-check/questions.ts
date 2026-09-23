// 위험성평가 인정심사 자가진단 데이터
// 출처: 사업장 위험성평가에 관한 지침 [별표] 위험성평가 인정심사 항목 및 기준 (신설 2024.12.18)
// 안전보건공단 (KOSHA) 위험성평가 우수사업장 인정제도 심사기준 반영
//
// 심사 구조:
//   Ⅰ. 사업주의 관심도 (100점, 가중치 10%)
//   Ⅱ. 위험성평가 실행수준 (100점, 가중치 60%)
//   Ⅲ. 구성원의 참여·이해수준 (100점, 가중치 25%)
//        · 3-1 사업주/임원/현장소장 40점
//        · 3-2 관리감독자 30점
//        · 3-3 근로자 30점
//   Ⅳ. 재해발생 수준 (100점, 가중치 5%)
//
// 합격 기준: 각 항목 70점 이상 AND 종합 90점 이상
// 인정 유효기간: 3년

import type { SizeBand } from "@/features/guide/data";

export type SectionKey =
  | "SECTION_I"
  | "SECTION_II"
  | "SECTION_III"
  | "SECTION_IV";

export type SubGroup = "III_OWNER" | "III_MANAGER" | "III_WORKER";

export type Choice = {
  key: string;
  label: string;
  detail?: string;
  score: number;
};

export type Question = {
  id: string;
  section: SectionKey;
  subGroup?: SubGroup;
  categoryLabel: string;
  text: string;
  helper?: string;
  maxScore: number;
  choices: Choice[];
  smbeHint?: { href: string; label: string };
  /** 심플안전으로는 대응할 수 없는 항목의 아주 짧은 대안 안내. */
  offlineTip?: string;
};

// -----------------------------------------------------------------------------
// 항목 데이터
// -----------------------------------------------------------------------------

export const QUESTIONS: Question[] = [
  // ------------------------------------------------------------------ SECTION I
  {
    id: "I-1-1",
    section: "SECTION_I",
    categoryLabel: "사업주 관심도 · 안전보건 방침·목표",
    text: "안전보건 방침·목표를 정하고 사무실·현장 등에 상시 게시하고 있나요?",
    helper: "사업장 안전관리 방향을 문서로 명시하고 게시했는지 확인합니다.",
    maxScore: 10,
    choices: [
      { key: "MI", label: "미흡", detail: "미수립", score: 1 },
      { key: "PA", label: "보통", detail: "일부 장소에 게시", score: 5 },
      { key: "OK", label: "우수", detail: "사무실·현장 상시 게시", score: 10 },
    ],
    offlineTip: "방침·목표를 문서로 정해 사무실·현장에 게시하세요.",
  },
  {
    id: "I-1-2",
    section: "SECTION_I",
    categoryLabel: "사업주 관심도 · 조직·업무분장",
    text: "안전보건 조직을 구성하고 역할·업무분장을 부여했나요?",
    maxScore: 10,
    choices: [
      { key: "MI", label: "미흡", detail: "조직 미구성", score: 1 },
      { key: "PA", label: "보통", detail: "조직과 역할 부여", score: 5 },
      { key: "OK", label: "우수", detail: "활동체계까지 구축·운영", score: 10 },
    ],
    smbeHint: { href: "/company/members", label: "인원·역할 관리" },
  },
  {
    id: "I-2-1",
    section: "SECTION_I",
    categoryLabel: "사업주 관심도 · 사업주 교육",
    text: "심사일 기준 최근 3년 이내에 사업주가 위험성평가 교육을 이수했나요?",
    helper: "안전보건공단이 시행하는 사업주 교육 이수 여부. 3년 이내 유효.",
    maxScore: 15,
    choices: [
      { key: "MI", label: "미이수", score: 1 },
      { key: "OK", label: "이수", score: 15 },
    ],
    offlineTip: "안전보건공단 홈페이지에서 사업주 위험성평가 교육을 신청해 이수하세요.",
  },
  {
    id: "I-2-2",
    section: "SECTION_I",
    categoryLabel: "사업주 관심도 · 담당자 교육",
    text: "위험성평가 담당자가 최근 3년 이내에 관련 교육을 이수했나요?",
    maxScore: 15,
    choices: [
      { key: "MI", label: "미이수", score: 1 },
      { key: "OK", label: "이수", score: 15 },
    ],
    offlineTip: "위험성평가 담당자를 안전보건공단 교육에 등록해 이수시키세요.",
  },
  {
    id: "I-2-3",
    section: "SECTION_I",
    categoryLabel: "사업주 관심도 · 근로자 안전보건교육",
    text: "정기 안전보건교육 시 위험성평가 관련 내용을 포함해 실시하나요?",
    maxScore: 20,
    choices: [
      { key: "MI", label: "미흡", detail: "미실시 또는 무관한 내용", score: 1 },
      { key: "PA", label: "보통", detail: "일부 포함", score: 10 },
      { key: "OK", label: "우수", detail: "전반적으로 포함", score: 20 },
    ],
    offlineTip: "정기 안전보건교육 자료에 위험성평가 내용을 넣어 함께 교육하세요.",
  },
  {
    id: "I-3-1",
    section: "SECTION_I",
    categoryLabel: "사업주 관심도 · 예산 편성·집행",
    text: "안전보건 예산을 편성하고 실제로 집행하나요?",
    maxScore: 10,
    choices: [
      { key: "MI", label: "미흡", detail: "미편성", score: 1 },
      { key: "PA", label: "보통", detail: "관리적 대책 중심", score: 5 },
      { key: "OK", label: "우수", detail: "평가결과 반영해 집행", score: 10 },
    ],
    offlineTip: "안전보건 예산을 별도로 편성하고, 평가 결과에 따라 실제로 집행하세요.",
  },
  {
    id: "I-4-1",
    section: "SECTION_I",
    categoryLabel: "사업주 관심도 · TBM 등 재해예방 활동",
    text: "TBM(작업 전 미팅) 등 재해예방 활동을 실시하나요?",
    helper: "작업 시작 전 짧은 안전점검·의견 공유 활동.",
    maxScore: 20,
    choices: [
      { key: "MI", label: "미흡", detail: "활동 없음", score: 1 },
      { key: "PA", label: "보통", detail: "일부 미흡", score: 10 },
      { key: "OK", label: "우수", detail: "전반적으로 실시", score: 20 },
    ],
    smbeHint: { href: "/inspections", label: "TBM 기록 관리" },
  },

  // ----------------------------------------------------------------- SECTION II
  {
    id: "II-1-1",
    section: "SECTION_II",
    categoryLabel: "실행수준 · 실시규정",
    text: "위험성평가 실시규정을 사업장 특성에 맞게 작성·관리하나요?",
    helper: "평가 목적·방법·역할·시기를 문서로 규정.",
    maxScore: 5,
    choices: [
      { key: "MI", label: "미흡", detail: "미작성", score: 1 },
      { key: "PA", label: "보통", detail: "일부 누락", score: 3 },
      { key: "OK", label: "우수", detail: "의견 수렴·특성 반영", score: 5 },
    ],
    offlineTip: "평가 목적·방법·역할·시기를 담은 실시규정을 문서로 작성하세요.",
  },
  {
    id: "II-1-2",
    section: "SECTION_II",
    categoryLabel: "실행수준 · 사전 안전보건정보",
    text: "작업방법·설비·물질·주변 환경 등 안전보건정보를 수집·활용하나요?",
    maxScore: 5,
    choices: [
      { key: "MI", label: "미흡", detail: "미분류/미수집", score: 1 },
      { key: "PA", label: "보통", detail: "일부 누락", score: 3 },
      { key: "OK", label: "우수", detail: "구체적으로 분류·활용", score: 5 },
    ],
    offlineTip: "작업방법·설비·물질·환경 정보를 미리 조사해 목록으로 정리하세요.",
  },
  {
    id: "II-2-1",
    section: "SECTION_II",
    categoryLabel: "실행수준 · 유해·위험요인 파악",
    text: "사업장의 유해·위험요인을 순회점검 등으로 상세히 파악하나요?",
    helper: "종이·엑셀 등 어떤 방식이든 실제 확인·기록되면 우수.",
    maxScore: 20,
    choices: [
      { key: "MI", label: "미흡", detail: "미파악", score: 1 },
      { key: "PA", label: "보통", detail: "일부 누락", score: 10 },
      { key: "OK", label: "우수", detail: "순회점검 등 상세 파악", score: 20 },
    ],
    smbeHint: { href: "/standards/new", label: "표준서 · 평가 등록" },
  },
  {
    id: "II-2-2",
    section: "SECTION_II",
    categoryLabel: "실행수준 · 위험성 수준 결정",
    text: "파악한 위험요인의 위험성 수준(상·중·하 등)을 합리적으로 결정하나요?",
    maxScore: 5,
    choices: [
      { key: "MI", label: "미흡", detail: "미실시", score: 1 },
      { key: "PA", label: "보통", detail: "불합리하게 낮음", score: 3 },
      { key: "OK", label: "우수", detail: "합리적으로 결정", score: 5 },
    ],
    smbeHint: { href: "/standards/new", label: "평가 위저드" },
  },
  {
    id: "II-3-1",
    section: "SECTION_II",
    categoryLabel: "실행수준 · 감소대책 수립",
    text: "위험 감소대책을 근원적 해소 관점에서 수립하나요?",
    helper: "관리적 대책·개인보호구 위주는 보통, 위험원 자체 제거·격리는 우수.",
    maxScore: 20,
    choices: [
      { key: "MI", label: "미흡", detail: "미수립", score: 1 },
      { key: "PA", label: "보통", detail: "관리·보호구 중심", score: 10 },
      { key: "OK", label: "우수", detail: "근원적 해소방안", score: 20 },
    ],
    smbeHint: { href: "/standards/new", label: "감소대책 문서화" },
  },
  {
    id: "II-3-2",
    section: "SECTION_II",
    categoryLabel: "실행수준 · 감소대책 이행",
    text: "수립한 대책이 실제로 이행되고 재확인되나요?",
    maxScore: 20,
    choices: [
      { key: "MI", label: "미흡", detail: "미이행", score: 1 },
      { key: "PA", label: "보통", detail: "잠정조치 누락", score: 10 },
      { key: "OK", label: "우수", detail: "실행·재확인", score: 20 },
    ],
    smbeHint: { href: "/inspections", label: "이행·조치 기록" },
  },
  {
    id: "II-4-1",
    section: "SECTION_II",
    categoryLabel: "실행수준 · 정기·수시평가",
    text: "정기평가·수시평가를 규정에 맞춰 적정 시기에 실시하나요?",
    maxScore: 10,
    choices: [
      { key: "MI", label: "미흡", detail: "미실시", score: 1 },
      { key: "PA", label: "보통", detail: "시기 미준수/절차 누락", score: 5 },
      { key: "OK", label: "우수", detail: "규정에 맞춰 실시", score: 10 },
    ],
    smbeHint: { href: "/work-orders", label: "작업지시·평가 이력" },
  },
  {
    id: "II-5-1",
    section: "SECTION_II",
    categoryLabel: "실행수준 · 결과 현장공유",
    text: "평가 결과를 TBM·교육 등으로 현장에 공유하나요?",
    maxScore: 15,
    choices: [
      { key: "MI", label: "미흡", detail: "미공유", score: 1 },
      { key: "PA", label: "보통", detail: "게시·주지 정도", score: 7 },
      { key: "OK", label: "우수", detail: "TBM·교육 등 능동 공유", score: 15 },
    ],
    smbeHint: { href: "/inspections", label: "TBM 공유 기록" },
  },

  // ---------------------------------------------------------------- SECTION III (owner 40)
  {
    id: "III-1-1",
    section: "SECTION_III",
    subGroup: "III_OWNER",
    categoryLabel: "참여·이해 · 사업주/임원 · 운영절차 인지",
    text: "사업주·임원·현장소장이 위험성평가 운영절차를 정확히 알고 있나요?",
    maxScore: 15,
    choices: [
      { key: "MI", label: "미흡", detail: "알지 못함", score: 1 },
      { key: "PA", label: "보통", detail: "일부 알고 있음", score: 7 },
      { key: "OK", label: "우수", detail: "주도적으로 참여", score: 15 },
    ],
    offlineTip: "사업주·임원·현장소장이 위험성평가 운영절차를 함께 숙지하세요.",
  },
  {
    id: "III-1-2",
    section: "SECTION_III",
    subGroup: "III_OWNER",
    categoryLabel: "참여·이해 · 사업주/임원 · 이행 점검",
    text: "사업주·임원이 위험성평가 이행 여부를 주기적으로 점검하나요?",
    maxScore: 15,
    choices: [
      { key: "MI", label: "미흡", detail: "미실시", score: 1 },
      { key: "PA", label: "보통", detail: "형식적", score: 7 },
      { key: "OK", label: "우수", detail: "직접 참여·독려", score: 15 },
    ],
    offlineTip: "사업주·임원이 이행 여부를 주기적으로 직접 점검하세요.",
  },
  {
    id: "III-1-3",
    section: "SECTION_III",
    subGroup: "III_OWNER",
    categoryLabel: "참여·이해 · 사업주/임원 · 동기부여",
    text: "구성원 참여에 대한 동기부여(포상·인센티브 등)를 하고 있나요?",
    maxScore: 10,
    choices: [
      { key: "MI", label: "미흡", detail: "미실행", score: 1 },
      { key: "PA", label: "보통", detail: "제안제도 운영", score: 5 },
      { key: "OK", label: "우수", detail: "포상 등 다양한 인센티브", score: 10 },
    ],
    offlineTip: "참여를 독려할 포상·인센티브 제도를 마련해 운영하세요.",
  },

  // -------------------------------------------------------- SECTION III (manager 30)
  {
    id: "III-2-1",
    section: "SECTION_III",
    subGroup: "III_MANAGER",
    categoryLabel: "참여·이해 · 관리감독자 · 절차·역할",
    text: "관리감독자가 위험성평가 운영절차와 자신의 역할을 알고 참여하나요?",
    maxScore: 10,
    choices: [
      { key: "MI", label: "미흡", detail: "알지 못함", score: 1 },
      { key: "PA", label: "보통", detail: "일부 알고 참여", score: 5 },
      { key: "OK", label: "우수", detail: "적극적으로 참여", score: 10 },
    ],
    offlineTip: "관리감독자에게 위험성평가 절차와 역할을 교육하세요.",
  },
  {
    id: "III-2-2",
    section: "SECTION_III",
    subGroup: "III_MANAGER",
    categoryLabel: "참여·이해 · 관리감독자 · 유해·위험요인 인지",
    text: "관리감독자가 담당 공정의 유해·위험요인과 대책을 정확히 알고 있나요?",
    maxScore: 10,
    choices: [
      { key: "MI", label: "미흡", detail: "알지 못함", score: 1 },
      { key: "PA", label: "보통", detail: "일부 알고 있음", score: 5 },
      { key: "OK", label: "우수", detail: "정확히 알고 있음", score: 10 },
    ],
    offlineTip: "관리감독자가 담당 공정의 위험요인과 대책을 숙지하도록 하세요.",
  },
  {
    id: "III-2-3",
    section: "SECTION_III",
    subGroup: "III_MANAGER",
    categoryLabel: "참여·이해 · 관리감독자 · 이행 확인·공유",
    text: "관리감독자가 이행 여부를 확인하고 결과를 회의 등으로 공유하나요?",
    maxScore: 10,
    choices: [
      { key: "MI", label: "미흡", detail: "미확인", score: 1 },
      { key: "PA", label: "보통", detail: "확인만 하고 미공유", score: 5 },
      { key: "OK", label: "우수", detail: "주기적 확인·공유", score: 10 },
    ],
    smbeHint: { href: "/inspections", label: "점검·공유 기록" },
  },

  // --------------------------------------------------------- SECTION III (worker 30)
  {
    id: "III-3-1",
    section: "SECTION_III",
    subGroup: "III_WORKER",
    categoryLabel: "참여·이해 · 근로자 · 제도 인지",
    text: "근로자가 위험성평가 제도와 세부 절차를 알고 있나요?",
    maxScore: 5,
    choices: [
      { key: "MI", label: "미흡", detail: "알지 못함", score: 1 },
      { key: "PA", label: "보통", detail: "제도만 알고 세부 미숙", score: 3 },
      { key: "OK", label: "우수", detail: "제도·절차 정확히 인지", score: 5 },
    ],
    offlineTip: "근로자에게 위험성평가 제도와 절차를 안내·교육하세요.",
  },
  {
    id: "III-3-2",
    section: "SECTION_III",
    subGroup: "III_WORKER",
    categoryLabel: "참여·이해 · 근로자 · 활동 참여",
    text: "근로자가 위험성평가 각 단계에 실제로 참여하나요?",
    maxScore: 10,
    choices: [
      { key: "MI", label: "미흡", detail: "형식적/미참여", score: 1 },
      { key: "PA", label: "보통", detail: "일부 단계만 참여", score: 5 },
      { key: "OK", label: "우수", detail: "전 단계 참여", score: 10 },
    ],
    smbeHint: { href: "/company/members", label: "구성원 초대" },
  },
  {
    id: "III-3-3",
    section: "SECTION_III",
    subGroup: "III_WORKER",
    categoryLabel: "참여·이해 · 근로자 · 유해·위험요인 인지·제보",
    text: "근로자가 담당 공정의 유해·위험요인과 대책을 알고 필요 시 제보하나요?",
    maxScore: 15,
    choices: [
      { key: "MI", label: "미흡", detail: "알지 못함", score: 1 },
      { key: "PA", label: "보통", detail: "일부 알음", score: 7 },
      { key: "OK", label: "우수", detail: "정확히 알고 제보 중", score: 15 },
    ],
    offlineTip: "근로자가 위험요인을 알고 제보할 수 있는 통로를 마련하세요.",
  },

  // ----------------------------------------------------------------- SECTION IV
  {
    id: "IV-1-1",
    section: "SECTION_IV",
    categoryLabel: "재해수준 · 동종업종 대비",
    text: "최근 1년(재인정은 3년) 사업장 재해율이 동종업종 평균에 비해 어떤 수준인가요?",
    helper:
      "정확한 재해율은 KOSHA 포털(portal.kosha.or.kr)에서 조회 가능. 질병·통상 출퇴근 사고·체육행사 등은 제외 후 판단.",
    maxScore: 100,
    choices: [
      { key: "V4", label: "동종업종 평균의 200% 이상", score: 70 },
      { key: "V3", label: "150% 이상 ~ 200% 미만", score: 78 },
      { key: "V2", label: "100% 이상 ~ 150% 미만", score: 85 },
      { key: "V1", label: "60% 이상 ~ 100% 미만", score: 92 },
      { key: "V0", label: "60% 미만 또는 무재해", score: 100 },
    ],
    offlineTip: "무재해를 유지하거나, 재해가 났다면 원인을 분석해 재발을 막으세요.",
  },
];

// -----------------------------------------------------------------------------
// 심사 메타 데이터
// -----------------------------------------------------------------------------

export const SECTION_META = {
  SECTION_I: {
    key: "SECTION_I" as SectionKey,
    number: "Ⅰ",
    title: "사업주의 관심도",
    weight: 0.10,
    maxScore: 100,
    description:
      "사업주가 안전보건에 얼마나 관심을 두고 실질적으로 활동을 주도하는지 평가합니다.",
  },
  SECTION_II: {
    key: "SECTION_II" as SectionKey,
    number: "Ⅱ",
    title: "위험성평가 실행수준",
    weight: 0.60,
    maxScore: 100,
    description:
      "실시규정·유해요인 파악·감소대책·이행·공유 등 실제 실행 수준을 평가합니다. 배점 비중이 가장 큽니다.",
  },
  SECTION_III: {
    key: "SECTION_III" as SectionKey,
    number: "Ⅲ",
    title: "구성원의 참여·이해수준",
    weight: 0.25,
    maxScore: 100,
    description:
      "사업주·관리감독자·근로자가 각자 역할에 맞게 참여하고 이해하는지 평가합니다.",
  },
  SECTION_IV: {
    key: "SECTION_IV" as SectionKey,
    number: "Ⅳ",
    title: "재해발생 수준",
    weight: 0.05,
    maxScore: 100,
    description:
      "동종업종 평균 대비 사업장 재해율. 최근 1년(재인정은 3년) 통계 기준.",
  },
};

// 신청 대상 규모 (2024.12.18 개정 기준)
// - 일반 사업장: 상시근로자 100명 미만
// - 건설공사: 총공사금액 120억원 미만 (토목 150억원 미만)
export const TARGET_LIMIT_HEADCOUNT = 100;

export const INDUSTRY_CHOICES: Array<{
  value: "manufacturing" | "construction" | "service" | "other";
  label: string;
}> = [
  { value: "manufacturing", label: "제조·가공" },
  { value: "construction", label: "건설·공사" },
  { value: "service", label: "서비스·유통" },
  { value: "other", label: "그 외" },
];

export type Targeting = {
  industry:
    | "manufacturing"
    | "construction"
    | "service"
    | "other"
    | null;
  sizeBand: SizeBand | null;
};

export type Answers = Partial<Record<string, string>>; // question.id → choice.key

// 안전법 가이드 콘텐츠 (초안 · 실제 법령 해설은 별도 검수 필요)
// - 인원 구간별 적용 여부 및 핵심 의무 요약
// - 검토일·공식 출처는 UI 에서 별도 표시

export type SizeBand = "UNDER_5" | "FROM_5_TO_19" | "FROM_20_TO_49" | "FROM_50";

export const SIZE_BANDS: Array<{ key: SizeBand; label: string; note: string }> =
  [
    { key: "UNDER_5", label: "5인 미만", note: "상시근로자 1~4명" },
    { key: "FROM_5_TO_19", label: "5~19인", note: "상시근로자 5~19명" },
    { key: "FROM_20_TO_49", label: "20~49인", note: "상시근로자 20~49명" },
    { key: "FROM_50", label: "50인 이상", note: "상시근로자 50명 이상" },
  ];

export type Applicability = "적용" | "일부 적용" | "원칙 미적용";

export type LawSummary = {
  topic: "serious-accidents" | "occupational-safety";
  title: string;
  shortTitle: string;
  intro: string;
  applicability: Record<SizeBand, Applicability>;
  bandNote: Record<SizeBand, string>;
  coreDuties: string[]; // 인원 구간과 무관한 공통 요약
  detailHref: string;
};

export const LAW_SUMMARIES: LawSummary[] = [
  {
    topic: "serious-accidents",
    title: "중대재해처벌법",
    shortTitle: "중대재해처벌법",
    intro:
      "중대재해 발생 시 사업주·경영책임자의 안전보건확보의무 위반을 형사 처벌하는 법률입니다. 사고 발생 시 개인 처벌·기업 벌금이 가능해 사전 체계 구축이 핵심입니다.",
    applicability: {
      UNDER_5: "원칙 미적용",
      FROM_5_TO_19: "원칙 미적용",
      FROM_20_TO_49: "원칙 미적용",
      FROM_50: "적용",
    },
    bandNote: {
      UNDER_5:
        "상시근로자 5인 미만 사업장은 원칙적으로 적용 제외. 다만 산업안전보건법 일부 규정과 별개로 판단합니다.",
      FROM_5_TO_19:
        "본 법의 사업주 처벌 조항은 상시근로자 50인 이상부터 전면 적용. 이 구간에서는 원칙 미적용이나, 건설업 공사금액 기준·특수 업종은 별도 확인이 필요합니다.",
      FROM_20_TO_49:
        "본 법의 사업주 처벌 조항은 상시근로자 50인 이상부터 전면 적용. 특수 업종·건설업 공사금액 기준은 별도 확인.",
      FROM_50:
        "안전보건확보의무 전면 적용. 안전보건관리체계 구축·이행·평가 의무가 실질적으로 요구됩니다.",
    },
    coreDuties: [
      "안전보건 목표와 경영방침을 정하고 문서화",
      "안전보건 인력·예산·설비를 실제로 확보",
      "위험요인 확인·개선 절차와 이행 여부를 반기별로 점검",
      "중대재해 발생 시 재발방지 대책 수립·이행",
    ],
    detailHref: "/guide/serious-accidents",
  },
  {
    topic: "occupational-safety",
    title: "산업안전보건법",
    shortTitle: "산안법",
    intro:
      "사업장의 안전보건 조치를 규정하는 기본 법률입니다. 위험성평가·안전보건교육·사고 조사·안전보건관리자 선임 등이 인원 구간에 따라 강화됩니다.",
    applicability: {
      UNDER_5: "일부 적용",
      FROM_5_TO_19: "적용",
      FROM_20_TO_49: "적용",
      FROM_50: "적용",
    },
    bandNote: {
      UNDER_5:
        "안전보건 조치 일부 규정은 상시근로자 5인 미만도 적용됩니다. 위험성평가 등 기본 의무는 인원 구간 상관없이 사업주의 자율적 관리 대상입니다.",
      FROM_5_TO_19:
        "위험성평가·안전보건교육·안전보건관리규정 등 대부분의 기본 의무가 적용됩니다. 안전보건관리자 선임은 원칙적으로 이 구간 미해당.",
      FROM_20_TO_49:
        "기본 의무에 더해 사업 종류·업종에 따라 안전보건관리자 선임 검토가 필요할 수 있습니다.",
      FROM_50:
        "안전보건관리자·산업보건의 등 전문인력 선임, 산업안전보건위원회 구성 등 관리체계 요건이 강화됩니다.",
    },
    coreDuties: [
      "사업장 위험성평가 실시·기록",
      "정기 안전보건교육 이수·기록",
      "위험작업 사전 허가(PTW) 및 작업 전 미팅(TBM) 실시",
      "산업재해 발생 시 조사·보고 및 재발방지 대책 수립",
    ],
    detailHref: "/guide/occupational-safety",
  },
];

// 상세 페이지 콘텐츠 (초안 — 실 법령 해설은 검수 필요)

export type LawDetail = {
  topic: LawSummary["topic"];
  officialSourceLabel: string;
  officialSourceUrl: string;
  sections: Array<{
    heading: string;
    lead?: string;
    items?: string[];
    perBandNotes?: Partial<Record<SizeBand, string>>;
  }>;
  requiredRecords: string[];
  nextActions: Array<{
    text: string;
    ctaLabel?: string;
    ctaHref?: string; // 우리 시스템 내 화면으로 연결 가능한 경우
  }>;
};

export const LAW_DETAILS: LawDetail[] = [
  {
    topic: "serious-accidents",
    officialSourceLabel: "법제처 국가법령정보센터 · 중대재해처벌법",
    officialSourceUrl: "https://www.law.go.kr/법령/중대재해처벌등에관한법률",
    sections: [
      {
        heading: "누구에게 적용되나요",
        lead: "상시근로자 50명 이상 사업장의 사업주·경영책임자가 원칙 대상입니다. 건설업은 공사금액 기준·특수 업종은 별도 조건이 있으니 개별 확인이 필요합니다.",
        perBandNotes: {
          UNDER_5:
            "5인 미만은 본 법의 사업주 처벌 조항 원칙 미적용. 다만 안전관리 자체는 소규모 사업장도 자율적으로 필요합니다.",
          FROM_5_TO_19: "50인 미만 구간이라 사업주 처벌 조항 원칙 미적용.",
          FROM_20_TO_49: "50인 미만 구간이라 사업주 처벌 조항 원칙 미적용.",
          FROM_50:
            "이 구간부터 사업주·경영책임자의 안전보건확보의무 위반이 형사 처벌 대상.",
        },
      },
      {
        heading: "무엇을 해야 하나요",
        items: [
          "안전보건 목표·경영방침을 정하고 문서로 명시",
          "안전보건 예산·인력·설비 확보 여부 반기별 점검",
          "위험요인 확인·개선 절차 마련, 이행 여부 확인",
          "종사자 의견 청취 절차 마련",
          "중대재해 발생 시 재발방지 대책 수립·이행",
          "안전보건 관계 법령 이행 여부 반기별 점검",
        ],
      },
      {
        heading: "실무에서 자주 하는 오해",
        items: [
          "50인 미만이라 아무 것도 안 해도 된다 → 산안법 등 다른 법률은 계속 적용됩니다.",
          "안전보건관리자 선임만 하면 끝난다 → 실제 이행·점검·기록까지 있어야 확보의무 이행으로 봅니다.",
          "사고가 없으면 위험요인 확인 안 해도 된다 → 사고 이전의 정기 확인 절차가 확보의무의 핵심입니다.",
        ],
      },
    ],
    requiredRecords: [
      "안전보건 경영방침·목표 문서",
      "위험요인 확인·개선 이행 대장",
      "반기별 이행 점검 결과",
      "종사자 의견 청취 기록",
      "안전보건 예산·집행 내역",
    ],
    nextActions: [
      {
        text: "회사에 위험성평가·작업지시·점검 흐름을 만들고 이행 기록을 자동으로 남기세요.",
        ctaLabel: "심플안전 무료로 시작",
        ctaHref: "/login?next=/onboarding",
      },
      {
        text: "우리 회사 준비 상태가 궁금하면 자가진단으로 부족한 항목부터 확인하세요.",
        ctaLabel: "인정 준비도 진단",
        ctaHref: "/recognition-check",
      },
    ],
  },
  {
    topic: "occupational-safety",
    officialSourceLabel: "법제처 국가법령정보센터 · 산업안전보건법",
    officialSourceUrl: "https://www.law.go.kr/법령/산업안전보건법",
    sections: [
      {
        heading: "누구에게 적용되나요",
        lead: "대부분의 사업장에 폭넓게 적용됩니다. 인원 구간·업종에 따라 세부 의무 강도가 달라집니다.",
        perBandNotes: {
          UNDER_5:
            "5인 미만도 안전보건 조치 일부 규정은 적용됩니다. 위험성평가 자체는 사업 규모 상관없이 사업주 자율의무.",
          FROM_5_TO_19:
            "위험성평가·안전보건교육·안전보건관리규정 등 기본 의무 전면 적용. 안전보건관리자 선임은 원칙 이 구간 미해당.",
          FROM_20_TO_49:
            "기본 의무에 더해 업종·사업 종류에 따라 안전보건관리자 선임 필요 여부 개별 확인.",
          FROM_50:
            "안전보건관리자·산업보건의 등 전문인력 선임, 산업안전보건위원회 구성 등 관리체계 요건 강화.",
        },
      },
      {
        heading: "무엇을 해야 하나요",
        items: [
          "사업장 위험성평가 실시 및 결과 기록",
          "근로자 정기 안전보건교육 실시 (신규·정기·특별 교육)",
          "위험작업 사전 허가(PTW) 실시 (화기·밀폐공간·고소작업 등)",
          "작업 전 미팅(TBM) 및 현장 점검 실시",
          "산업재해 발생 시 조사·보고 및 재발방지 대책",
          "안전보건관리규정 작성·게시 (인원 구간별 요건)",
        ],
      },
      {
        heading: "위험성평가 인정제도 (안전보건공단)",
        lead: "위험성평가를 꾸준히 실시하고 기록한 사업장은 안전보건공단의 '위험성평가 인정' 을 받습니다. 인정받으면 3년간 정기 감독 유예, 산재보험료 20% 인하. 준비 정도는 자가진단으로 5분이면 확인합니다.",
      },
    ],
    requiredRecords: [
      "위험성평가 결과서 (위험요인·수준·감소대책)",
      "안전보건교육 이수 명부",
      "작업 전 미팅(TBM)·현장 점검 기록",
      "위험작업 허가(PTW) 대장",
      "산업재해 조사·보고 문서",
    ],
    nextActions: [
      {
        text: "심플안전 무료로 위험성평가·작업지시·TBM·현장 점검을 오늘 시작하세요.",
        ctaLabel: "무료로 시작하기",
        ctaHref: "/login?next=/onboarding",
      },
      {
        text: "우리 회사가 위험성평가 인정 준비가 되었는지 자가진단해보세요.",
        ctaLabel: "인정 준비도 진단",
        ctaHref: "/recognition-check",
      },
    ],
  },
];

export const GUIDE_META = {
  effectiveDate: "2026-09-20",
  reviewedDate: "2026-09-20",
  sourceNote:
    "출처: 산업안전보건법·중대재해처벌법 및 안전보건공단 고시 (2026-09-20 기준).",
};

export function getLawSummary(topic: LawSummary["topic"]): LawSummary {
  const found = LAW_SUMMARIES.find((s) => s.topic === topic);
  if (!found) throw new Error(`Unknown topic: ${topic}`);
  return found;
}

export function getLawDetail(topic: LawSummary["topic"]): LawDetail {
  const found = LAW_DETAILS.find((s) => s.topic === topic);
  if (!found) throw new Error(`Unknown topic: ${topic}`);
  return found;
}

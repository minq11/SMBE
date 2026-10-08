// 저장 단추를 누른 자리에서 빈 칸을 찾아 준다.
//
// 서버 스키마(standards-service.ts)가 같은 검사를 하지만, 긴 폼의 맨 아래
// 칸이 비었을 때 "저장하지 못했습니다" 만 돌아오면 사장님이 다시 위에서부터
// 뒤져야 한다. 여기서 먼저 찾아 그 칸으로 데려간다. 문구는 서버와 같게 둔다.

export type DraftProblem = {
  message: string;
  /** 오류 창을 닫은 뒤 데려갈 칸. 폼 안에서 찾는다. */
  find: (form: HTMLFormElement) => HTMLElement | null;
};

export type RiskLike = { hazard: string; level: string; measure: string };

export type AssessmentLike = {
  work_method: string;
  safety_info: {
    equipment: string;
    materials: string;
    environment: string;
    history: string;
  };
  risks: RiskLike[];
  participant_user_ids: string[];
};

// 화면의 칸 순서 (std-safety-grid 안 textarea 순서와 같다)
const SAFETY_FIELDS = [
  ["equipment"],
  ["materials"],
  ["environment"],
  ["history"],
] as const;

// 서버 문구와 글자까지 같다 (조사 "를/을" 이 칸마다 다르다).
const SAFETY_MESSAGES = {
  equipment: "안전보건정보의 설비를 입력하세요.",
  materials: "안전보건정보의 물질을 입력하세요.",
  environment: "안전보건정보의 주변 환경을 입력하세요.",
  history: "안전보건정보의 재해·아차사고 정보를 입력하세요.",
} as const;

const byId = (id: string) => (form: HTMLFormElement) =>
  form.querySelector<HTMLElement>(`#${CSS.escape(id)}`);

const nth = (selector: string, i: number) => (form: HTMLFormElement) =>
  form.querySelectorAll<HTMLElement>(selector)[i] ?? null;

const inRisk = (i: number, selector: string) => (form: HTMLFormElement) =>
  form
    .querySelectorAll<HTMLElement>(".risk-card")
    [i]?.querySelector<HTMLElement>(selector) ?? null;

/** 위험성평가 공통 칸 (새 표준서의 최초평가 · 회차 추가). */
export function checkAssessment(
  a: AssessmentLike,
  ids: { method: string },
): DraftProblem | null {
  if (!a.work_method.trim())
    return { message: "작업방법 요약을 입력하세요.", find: byId(ids.method) };
  for (const [i, [key]] of SAFETY_FIELDS.entries()) {
    if (!a.safety_info[key].trim())
      return {
        message: SAFETY_MESSAGES[key],
        find: nth(".std-safety-grid textarea", i),
      };
  }
  for (const [i, r] of a.risks.entries()) {
    if (!r.hazard.trim())
      return {
        message: "유해·위험요인을 입력하세요.",
        find: inRisk(i, 'textarea[id$="-hazard"]'),
      };
    if (!r.level)
      return {
        message: "위험성 수준을 고르세요.",
        find: inRisk(i, '[role="radiogroup"] input'),
      };
    if (!r.measure.trim())
      return {
        message: "감소대책을 입력하세요.",
        find: inRisk(i, 'textarea[id$="-measure"]'),
      };
  }
  if (a.participant_user_ids.length === 0)
    return {
      message: "참여 근로자를 선택하세요.",
      find: (form) =>
        form.querySelector<HTMLElement>(".people-picker--dialog button"),
    };
  return null;
}

/** 새 표준서 — 표준서 칸을 먼저, 그 다음 최초평가. 서버 스키마와 같은 순서. */
export function checkStandardDraft(d: {
  steps: string[];
  checklist_tbm: string[];
  checklist_during: string[];
  assessment: AssessmentLike;
}): DraftProblem | null {
  const lists = [
    ["steps", "작업 단계를 하나 이상 입력하세요.", d.steps],
    [
      "checklist_tbm",
      "TBM 체크리스트를 하나 이상 입력하세요.",
      d.checklist_tbm,
    ],
    [
      "checklist_during",
      "작업 중 체크리스트를 하나 이상 입력하세요.",
      d.checklist_during,
    ],
  ] as const;
  for (const [i, [, message, items]] of lists.entries()) {
    if (!items.some((s) => s.trim()))
      return { message, find: nth(".std-list", i) };
  }
  return checkAssessment(d.assessment, { method: "std-method" });
}

/** 오류 창을 닫으면 그 칸으로 간다. 목록이면 첫 칸에 커서를 둔다. */
export function goToProblem(form: HTMLFormElement | null, p: DraftProblem) {
  if (!form) return;
  const el = p.find(form);
  if (!el) return;
  const input = el.matches("input, textarea, button")
    ? el
    : (el.querySelector<HTMLElement>("input, textarea") ?? el);
  el.scrollIntoView({ block: "center" });
  input.focus({ preventScroll: true });
}

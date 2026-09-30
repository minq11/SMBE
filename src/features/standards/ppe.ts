/**
 * 필요 보호구 — 표준서에서 칩으로 고른다. 글을 쓰는 칸이 아니라 누르는 칸이다.
 * 산업안전보건기준에 관한 규칙 제32조(보호구의 지급 등)의 종류를 현장 말로.
 */
export const PPE_OPTIONS = [
  ["helmet", "안전모"],
  ["shoes", "안전화"],
  ["goggles", "보안경"],
  ["faceshield", "보안면"],
  ["earplug", "귀마개"],
  ["dustmask", "방진마스크"],
  ["gasmask", "방독마스크"],
  ["gloves", "보호장갑"],
  ["insulated", "절연장갑"],
  ["harness", "안전대"],
  ["apron", "보호복·앞치마"],
  ["vest", "안전조끼"],
] as const;
export type PpeKey = (typeof PPE_OPTIONS)[number][0];
export const PPE_KEYS = PPE_OPTIONS.map(([k]) => k) as [PpeKey, ...PpeKey[]];
export const PPE_LABEL: Record<string, string> =
  Object.fromEntries(PPE_OPTIONS);
export const ppeLabel = (key: string) => PPE_LABEL[key] ?? key;

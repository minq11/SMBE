/**
 * 화면에는 무료/유료만 나온다. Basic·Standard·Pro 는 인원 구간의 이름이지
 * 기능 등급이 아니므로, 기능 안내에 구간 이름을 쓰면 Basic 고객이 자기는
 * 못 쓰는 기능으로 읽는다. 구간명은 요금제 화면에서만 쓴다.
 */
export type Tier = "무료" | "유료";

export function tierOf(membership?: { pro_state?: string } | null): Tier {
  return membership?.pro_state && membership.pro_state !== "FREE"
    ? "유료"
    : "무료";
}

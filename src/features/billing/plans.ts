/**
 * 요금제: 회사 인원 구간별 정액제.
 *
 * 기준 인원은 `companies.active_headcount` (현재 재직중인 ACTIVE 구성원, 관리자 포함)이며
 * 가입·퇴사 때마다 `refreshHeadcount()` 가 갱신한다.
 *
 * 기능은 세 구간이 모두 같다. 무료와 유료를 가르는 기준만 존재하므로
 * 서버의 기능 게이트는 지금처럼 `pro_state !== 'FREE'` 하나로 충분하다.
 *
 * 금액은 **공급가(VAT 별도)** 로 둔다. 세금계산서에 공급가·부가세가 분리돼야 하므로
 * 저장·계산은 공급가로 하고 화면에만 VAT 포함가를 보여준다.
 */

export type PaidPlanId = "BASIC" | "STANDARD" | "PRO";
/** 계약 구간. 무료 회사는 null. ENTERPRISE 는 100인 이상 개별 협의. */
export type ContractedPlan = PaidPlanId | "ENTERPRISE" | null;

export type PaidPlan = {
  id: PaidPlanId;
  name: string;
  /** 이 인원까지 해당 구간 (이 값을 넘으면 다음 구간) */
  maxHeadcount: number;
  /** 정가 공급가 */
  listSupplyKrw: number;
  /** 출시 할인가(얼리버드) 공급가 */
  launchSupplyKrw: number;
};

export const PAID_PLANS: readonly PaidPlan[] = [
  {
    id: "BASIC",
    name: "Basic",
    maxHeadcount: 19,
    listSupplyKrw: 50_000,
    launchSupplyKrw: 30_000,
  },
  {
    id: "STANDARD",
    name: "Standard",
    maxHeadcount: 49,
    listSupplyKrw: 120_000,
    launchSupplyKrw: 80_000,
  },
  {
    id: "PRO",
    name: "Pro",
    maxHeadcount: 99,
    listSupplyKrw: 220_000,
    launchSupplyKrw: 150_000,
  },
] as const;

/** 100인 이상은 구간표 밖. 개별 협의한다. */
export const ENTERPRISE_FROM = 100;

const VAT_RATE = 0.1;
export const withVat = (supplyKrw: number) =>
  Math.round(supplyKrw * (1 + VAT_RATE));

export const formatKrw = (krw: number) => krw.toLocaleString("ko-KR");

/** 구간마다 할인율이 다르므로 상수로 박지 않고 계산한다. */
export const launchDiscountPercent = (plan: PaidPlan) =>
  Math.round((1 - plan.launchSupplyKrw / plan.listSupplyKrw) * 100);

export const maxLaunchDiscountPercent = () =>
  Math.max(...PAID_PLANS.map(launchDiscountPercent));

/**
 * 계약 구간의 인원 상한. null 이면 상한 없음
 * (무료는 인원이 아니라 기능이 제한되고, 개별 협의 계약은 상한을 두지 않는다).
 */
export function seatCapFor(plan: ContractedPlan): number | null {
  if (plan === null || plan === "ENTERPRISE") return null;
  return PAID_PLANS.find((p) => p.id === plan)?.maxHeadcount ?? null;
}

/** 이 구간 다음 구간. 상향 안내 문구에 쓴다. */
export function planAfter(plan: PaidPlanId): PaidPlan | null {
  const i = PAID_PLANS.findIndex((p) => p.id === plan);
  return PAID_PLANS[i + 1] ?? null;
}

export const planName = (plan: ContractedPlan) =>
  plan === null
    ? "무료"
    : plan === "ENTERPRISE"
      ? "개별 협의"
      : (PAID_PLANS.find((p) => p.id === plan)?.name ?? plan);

/** 현재 인원이 속하는 구간. 100인 이상이면 null (개별 협의). */
export function planForHeadcount(headcount: number): PaidPlan | null {
  return PAID_PLANS.find((p) => headcount <= p.maxHeadcount) ?? null;
}

/**
 * 계약 인원을 다 쓴 상태인지. 유료 회사는 이 상태에서 인원 등록이 막힌다.
 * 무료 회사는 상한이 없으므로 항상 false — 무료는 인원이 아니라 기능이 제한된다.
 */
export function seatsExhausted(
  plan: ContractedPlan,
  activeHeadcount: number,
): boolean {
  const cap = seatCapFor(plan);
  return cap !== null && activeHeadcount >= cap;
}

/** 가입 시점 가격을 1년간 보장한다. 결제 도입 시 회사별로 이 만료일을 저장한다. */
export const PRICE_LOCK_MONTHS = 12;

const addMonth = (d: Date) => {
  const next = new Date(d);
  next.setMonth(next.getMonth() + 1);
  return next;
};
const DAY = 86_400_000;

/**
 * 결제 기준일(anchor)로부터 지금이 속한 주기의 시작·끝.
 * 기준일을 한 달씩 밀어 현재를 포함하는 구간을 찾는다.
 */
export function currentCycle(anchor: Date, now: Date) {
  let start = new Date(anchor);
  let end = addMonth(start);
  while (end <= now) {
    start = end;
    end = addMonth(start);
  }
  return { start, end };
}

export type UpgradeQuote = {
  /** 남은 기간에 대한 현재 구간 잔여 크레딧 (공급가) */
  creditSupplyKrw: number;
  /** 지금 결제할 금액 (공급가) */
  chargeSupplyKrw: number;
  /** 상향 후 새 결제 기준일 = 오늘 */
  nextAnchor: Date;
  remainingDays: number;
  cycleDays: number;
};

/**
 * 상향 시 즉시 결제 금액.
 *
 * 남은 기간만큼 현재 구간 요금을 크레딧으로 돌려 새 구간 요금에서 빼고, **그날이 새
 * 결제 기준일**이 된다. 다음 달부터는 새 구간 요금이 온전히 청구된다.
 * 하향은 이 계산을 쓰지 않는다 — 다음 주기부터 적용하고 환불하지 않는다.
 */
export function upgradeQuote(
  from: PaidPlan,
  to: PaidPlan,
  anchor: Date,
  now: Date,
): UpgradeQuote {
  const { start, end } = currentCycle(anchor, now);
  const cycleDays = Math.round((end.getTime() - start.getTime()) / DAY);
  const remainingDays = Math.max(
    0,
    Math.ceil((end.getTime() - now.getTime()) / DAY),
  );
  const creditSupplyKrw = Math.round(
    (from.launchSupplyKrw * remainingDays) / cycleDays,
  );
  return {
    creditSupplyKrw,
    chargeSupplyKrw: Math.max(0, to.launchSupplyKrw - creditSupplyKrw),
    nextAnchor: now,
    remainingDays,
    cycleDays,
  };
}

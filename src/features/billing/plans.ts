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

/** 현재 인원이 속하는 구간. 100인 이상이면 null (개별 협의). */
export function planForHeadcount(headcount: number): PaidPlan | null {
  return PAID_PLANS.find((p) => headcount <= p.maxHeadcount) ?? null;
}

/**
 * 인원이 한 명 늘었을 때 구간이 바뀌는지.
 * 인원 등록을 막지 않는다 — 등록이 막히면 그 작업자가 시스템 밖에 남고
 * TBM·점검 기록에 구멍이 생긴다. 안내만 띄우고 등록은 그대로 진행한다.
 */
export function crossesOnNextMember(headcount: number): boolean {
  return (
    planForHeadcount(headcount)?.id !== planForHeadcount(headcount + 1)?.id
  );
}

/** 가입 시점 가격을 1년간 보장한다. 결제 도입 시 회사별로 이 만료일을 저장한다. */
export const PRICE_LOCK_MONTHS = 12;

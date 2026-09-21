import Link from "next/link";
import { ArrowRight, Check, MessageCircle } from "lucide-react";
import type { CompanyOverview } from "@/server/members";
import { PRO_FEATURES } from "./pro-features";
import {
  PAID_PLANS,
  ENTERPRISE_FROM,
  planForHeadcount,
  planName,
  seatCapFor,
  launchDiscountPercent,
  maxLaunchDiscountPercent,
  withVat,
  formatKrw,
  PRICE_LOCK_MONTHS,
} from "./plans";

const TIER_LABEL: Record<CompanyOverview["pro_state"], string> = {
  FREE: "무료티어",
  PRO_VOLUNTARY: "유료 이용 중",
  PRO_MANDATORY: "유료 이용 중",
};

export function BillingView({ overview }: { overview: CompanyOverview }) {
  const isPro = overview.pro_state !== "FREE";
  // 유료는 계약한 구간, 무료는 현재 인원이 속할 구간을 보여준다.
  const contracted = overview.plan;
  const current = planForHeadcount(overview.active_count);
  const cap = seatCapFor(contracted);

  return (
    <>
      <section className="billing-current" aria-label="현재 요금제">
        <div className="billing-current-copy">
          <span className="billing-current-tag">현재 요금제</span>
          <h2>{TIER_LABEL[overview.pro_state]}</h2>
          {isPro ? (
            <p>
              {planName(contracted)} 요금제 · 현재 인원 {overview.active_count}
              명{cap !== null && ` / 계약 ${cap}명`}입니다. 청구 내역은{" "}
              <em>과금 내역</em> 메뉴에서 확인하세요 (준비 중).
            </p>
          ) : (
            <p>
              인원 수 제한 없이 텍스트 기반 기능(표준서·지시서·PTW·TBM·점검)을
              모두 무료로 사용할 수 있습니다. 알림·사진·모바일 관리·전체 기록
              조회가 필요해지면 유료로 전환해 주세요. 현재 인원{" "}
              {overview.active_count}명은{" "}
              {current ? current.name + " 구간" : "개별 협의 대상"}입니다.
            </p>
          )}
        </div>
        <div className="billing-current-actions">
          {!isPro && (
            <Link
              href="/contact"
              className="primary-button billing-cta"
              prefetch={false}
            >
              유료 전환 문의
              <ArrowRight size={14} />
            </Link>
          )}
          <Link href="/contact" className="ghost-button" prefetch={false}>
            <MessageCircle size={13} />
            영업·계약 문의
          </Link>
        </div>
      </section>

      <section className="stack" aria-label="유료 전용 기능">
        <header className="billing-section-header">
          <h2>유료로 사용할 수 있는 기능</h2>
          <p>
            아래 기능이 필요해지는 순간이 유료 전환 시점입니다. 세 구간 모두
            같은 기능을 제공하며 인원 범위만 다릅니다. 무료로도 안전관리 업무의
            뼈대는 그대로 사용할 수 있습니다.
          </p>
        </header>
        <ul className="pro-feature-grid" role="list">
          {PRO_FEATURES.map(
            ({
              key,
              icon: Icon,
              title,
              description,
              freeBehavior,
              proBehavior,
            }) => (
              <li key={key} className="pro-feature-card">
                <span className="pro-feature-icon">
                  <Icon size={18} />
                </span>
                <div className="pro-feature-copy">
                  <strong>{title}</strong>
                  <p>{description}</p>
                </div>
                <dl className="pro-feature-compare">
                  <div>
                    <dt>무료</dt>
                    <dd>{freeBehavior}</dd>
                  </div>
                  <div>
                    <dt className="is-pro">Pro</dt>
                    <dd>
                      <Check size={12} className="pro-feature-tick" />
                      {proBehavior}
                    </dd>
                  </div>
                </dl>
              </li>
            ),
          )}
        </ul>
      </section>

      <section className="billing-pricing" aria-label="가격 안내">
        <header className="billing-section-header">
          <h2>가격</h2>
          <p className="billing-section-note">
            현재 재직중인 인원(관리자 포함) 기준 월 정액입니다. 세 구간의 기능은
            모두 같고 인원 범위만 다릅니다. 표시 금액은 VAT 포함입니다.
          </p>
        </header>

        <p className="billing-launch-badge">
          출시 기념 최대 {maxLaunchDiscountPercent()}% 할인 · 가입 시점 가격을{" "}
          {PRICE_LOCK_MONTHS}개월간 유지합니다
        </p>

        <ul className="billing-plan-grid" role="list">
          {PAID_PLANS.map((plan) => {
            const isCurrent = current?.id === plan.id;
            return (
              <li
                key={plan.id}
                className={`billing-plan${isCurrent ? " is-current" : ""}`}
                aria-current={isCurrent ? "true" : undefined}
              >
                <h3>{plan.name}</h3>
                <p className="billing-plan-range">~{plan.maxHeadcount}인</p>
                <p className="billing-plan-list">
                  <s>{formatKrw(withVat(plan.listSupplyKrw))}원</s>
                  <span className="billing-plan-off">
                    {launchDiscountPercent(plan)}% 할인
                  </span>
                </p>
                <p className="billing-plan-now">
                  <strong>{formatKrw(withVat(plan.launchSupplyKrw))}</strong>
                  <span>원 / 월</span>
                </p>
                {isCurrent && (
                  <p className="billing-plan-current-tag">
                    현재 인원 기준 구간
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        <dl className="billing-price-details">
          <div>
            <dt>구간 변경</dt>
            <dd>
              상향하면 남은 기간의 현재 요금을 차감한 금액을 바로 결제하고,{" "}
              <strong>그날이 새 결제 기준일</strong>이 됩니다. 다음 달부터는 새
              구간 요금이 온전히 청구됩니다. 하향은 다음 결제 주기부터 적용되며
              중도 환불은 없습니다.
            </dd>
          </div>
          <div>
            <dt>인원 기준</dt>
            <dd>
              현재 재직중인 구성원 수(관리자 포함)입니다. 계약 인원을 모두
              사용하면 상향 전까지 인원을 더 등록할 수 없습니다. 무료 이용
              중에는 인원 제한이 없습니다.
            </dd>
          </div>
          <div>
            <dt>{ENTERPRISE_FROM}인 이상</dt>
            <dd>
              구간표 밖입니다. <Link href="/contact">직접 문의</Link>해 주시면
              인원 규모에 맞춰 가격과 계약 조건을 협의합니다.
            </dd>
          </div>
        </dl>
      </section>

      <p className="billing-fallback">
        결제·청구 화면은 준비 중입니다. 유료 전환·계약 문의는{" "}
        <Link href="/contact">문의 폼</Link> 또는{" "}
        <a href="mailto:hi@smbe.net">hi@smbe.net</a> 으로 남겨 주세요.
      </p>
    </>
  );
}

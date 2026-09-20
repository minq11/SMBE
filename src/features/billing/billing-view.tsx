import Link from "next/link";
import { ArrowRight, Check, MessageCircle } from "lucide-react";
import type { CompanyOverview } from "@/server/members";
import { PRO_FEATURES, PRO_PLAN } from "./pro-features";

const TIER_LABEL: Record<CompanyOverview["pro_state"], string> = {
  FREE: "무료티어",
  PRO_VOLUNTARY: "Pro (자발적 전환)",
  PRO_MANDATORY: "Pro",
};

export function BillingView({ overview }: { overview: CompanyOverview }) {
  const isPro = overview.pro_state !== "FREE";
  const perSeat = PRO_PLAN.perSeatMonthlyKrw.toLocaleString("ko-KR");

  return (
    <>
      <section className="billing-current" aria-label="현재 요금제">
        <div className="billing-current-copy">
          <span className="billing-current-tag">현재 요금제</span>
          <h2>{TIER_LABEL[overview.pro_state]}</h2>
          {isPro ? (
            <p>
              현재 활성 인원 {overview.active_count}명 기준으로 Pro 기능을 모두
              사용하고 있습니다. 청구 내역은 <em>과금 내역</em> 메뉴에서 확인
              하세요 (준비 중).
            </p>
          ) : (
            <p>
              인원 수 제한 없이 텍스트 기반 기능(표준서·지시서·PTW·TBM·점검)을
              모두 무료로 사용할 수 있습니다. 알림·사진·모바일 관리·전체 기록
              조회가 필요해지면 Pro 로 전환해 주세요.
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
              Pro 문의하기
              <ArrowRight size={14} />
            </Link>
          )}
          <Link
            href="/contact"
            className="ghost-button"
            prefetch={false}
          >
            <MessageCircle size={13} />
            영업·계약 문의
          </Link>
        </div>
      </section>

      <section className="stack" aria-label="Pro 전용 기능">
        <header className="billing-section-header">
          <h2>Pro 로 사용할 수 있는 기능</h2>
          <p>
            아래 기능이 필요해지는 순간이 Pro 전환 시점입니다. 무료로도 안전관리
            업무의 뼈대는 그대로 사용할 수 있습니다.
          </p>
        </header>
        <ul className="pro-feature-grid" role="list">
          {PRO_FEATURES.map(
            ({ key, icon: Icon, title, description, freeBehavior, proBehavior }) => (
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
        </header>
        <div className="billing-pricing-body">
          <div className="billing-price-lead">
            <strong>
              {perSeat}
              <span className="billing-price-unit">원 / 인 · 월</span>
            </strong>
            <p>{PRO_PLAN.billingModel}</p>
            <p>{PRO_PLAN.billingCycle}</p>
          </div>
          <dl className="billing-price-details">
            <div>
              <dt>결제 수단</dt>
              <dd>
                <ul>
                  {PRO_PLAN.paymentMethods.map((method) => (
                    <li key={method}>{method}</li>
                  ))}
                </ul>
              </dd>
            </div>
            <div>
              <dt>대규모 도입</dt>
              <dd>{PRO_PLAN.enterpriseNote}</dd>
            </div>
          </dl>
        </div>
      </section>

      <p className="billing-fallback">
        결제·청구 화면은 준비 중입니다. Pro 전환·계약 문의는 <Link href="/contact">문의 폼</Link>{" "}
        또는 <a href="mailto:hi@smbe.net">hi@smbe.net</a> 으로 남겨 주세요.
      </p>
    </>
  );
}

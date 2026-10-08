import Link from "next/link";
import { ArrowRight, PenLine } from "lucide-react";
import { withTransaction } from "@/server/db";
import { workSession } from "@/server/work-orders";
import { readCompanyInfo } from "@/server/company-settings";
import { getCompanyOverview, listMembers } from "@/server/members";
import { isCurrentUserOperator } from "@/server/operator";
import { AppShell } from "@/components/shell/app-shell";
import { tierOf } from "@/components/shell/tier";
import { PageHeader } from "@/components/ui/page-header";
import { Facts } from "@/components/ui/facts";
import { SIZE_BAND_LABEL } from "@/features/company/company-info";
import { planName, seatCapFor } from "@/features/billing/plans";
import { koDate } from "@/features/assessments/model";
import "@/features/work-orders/work-orders.css";

export const metadata = { title: "회사 정보 · 심플안전" };

const ROLE_LABEL: Record<string, string> = {
  MANAGER_SUPERVISOR: "관리감독자",
  MANAGER_SAFETY: "안전관리자",
  WORKER: "작업자",
};

/** 만원 단위 → "12억 5,000만 원". */
function manwon(value: number): string {
  if (value === 0) return "0원";
  const eok = Math.floor(value / 10000);
  const rest = value % 10000;
  return (
    [
      eok ? `${eok.toLocaleString("ko-KR")}억` : "",
      rest ? `${rest.toLocaleString("ko-KR")}만` : "",
    ]
      .filter(Boolean)
      .join(" ") + " 원"
  );
}

/**
 * 회사 정보. 사이드바 맨 위 회사 카드가 여기로 온다.
 *
 * 한 장에 회사에 대한 것이 모인다 — 기본 정보와 회사코드(고치기는 관리감독자),
 * 인원(접어 두고 인원관리로), 현재 요금제(요금 안내로). 작업자에게는 기본 정보만.
 */
export default async function CompanyPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const { session, actor } = await workSession("/company");
  const role = session.membership!.role;
  const manager = role !== "WORKER";
  const supervisor = role === "MANAGER_SUPERVISOR";
  const [info, overview, members, isOperator, { saved }] = await Promise.all([
    withTransaction((c) => readCompanyInfo(c, actor.companyId)),
    manager ? getCompanyOverview(actor.companyId) : null,
    manager ? listMembers(actor.companyId) : [],
    isCurrentUserOperator(),
    searchParams,
  ]);
  const active = members.filter((m) => m.status === "ACTIVE" && !m.left_at);
  const pending = members.filter(
    (m) => m.status === "JOIN_PENDING" && !m.left_at,
  ).length;
  const isPro = overview ? overview.pro_state !== "FREE" : false;
  const cap = overview ? seatCapFor(overview.plan) : null;

  return (
    <AppShell
      active="companyInfo"
      breadcrumb={[{ label: "회사 정보" }]}
      companyName={info.name}
      tier={tierOf(session.membership)}
      userName={session.user.displayName ?? undefined}
      isAuthenticated
      isOperator={isOperator}
    >
      <PageHeader
        title="회사 정보"
        description={info.name}
        actions={
          supervisor && (
            <Link className="btn-primary" href="/company/edit">
              <PenLine size={14} /> 수정
            </Link>
          )
        }
      />
      {saved === "1" && (
        <p role="status" className="wo-notice" data-tone="ok">
          회사 정보를 저장했습니다.
        </p>
      )}

      <section className="wo-section">
        <h2>기본 정보</h2>
        <Facts
          rows={[
            ["회사명", info.name],
            ["업종", info.business_type],
            [
              "사업개시일",
              info.business_start_date && koDate(info.business_start_date),
            ],
            ["초기 인원규모", SIZE_BAND_LABEL[info.initial_employee_size_band]],
            ["예상 연매출액", manwon(info.expected_annual_revenue_manwon)],
            manager && [
              "회사코드",
              <code key="code" className="company-code">
                {info.company_code}
              </code>,
            ],
          ]}
        />
        {manager && !supervisor && (
          <p className="wo-muted">회사 정보는 관리감독자가 고칩니다.</p>
        )}
      </section>

      {manager && (
        <section className="wo-section">
          <h2>인원</h2>
          <details className="std-fold">
            <summary>
              구성원 {active.length}명
              {pending > 0 && ` · 가입 승인 대기 ${pending}명`}
            </summary>
            <ul className="company-member-list">
              {active.map((m) => (
                <li key={m.member_id}>
                  <strong>{m.display_name}</strong>
                  <span>{ROLE_LABEL[m.role] ?? m.role}</span>
                </li>
              ))}
            </ul>
          </details>
          <Link className="go-link" href="/company/members">
            인원관리 <ArrowRight size={14} />
          </Link>
        </section>
      )}

      {manager && overview && (
        <section className="wo-section">
          <h2>요금제</h2>
          <Facts
            rows={[
              ["현재 요금제", isPro ? "멤버십" : "무료"],
              isPro && ["구간", planName(overview.plan)],
              [
                "현재 인원",
                `${overview.active_count}명` +
                  (isPro && cap !== null ? ` / 계약 ${cap}명` : ""),
              ],
            ]}
          />
          <Link className="go-link" href="/billing">
            요금 안내 <ArrowRight size={14} />
          </Link>
        </section>
      )}
    </AppShell>
  );
}

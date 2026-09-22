"use client";

import Link from "next/link";
import type { Tier } from "@/components/shell/tier";
import {
  ArrowRight,
  BookOpen,
  CalendarCheck,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  ShieldCheck,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";

export type Job = {
  href?: string;
  title: string;
  place: string;
  time: string;
  people: number;
  status: string;
};
export type Today = {
  /** YYYY-MM-DD (한국시간) */
  date: string;
  jobs: number;
  /** 유료 회사만 센다. null 이면 칸을 비운다. */
  tbmMissing: number | null;
  drafts: number;
};

/**
 * 로그인 전 화면에 넣는 것.
 *
 * 전에는 "오늘 처리할 일 3건", "제1공장 프레스 설비 점검" 같은 가짜 데이터를
 * 깔아 두고 누르면 준비 중 안내를 띄웠다. 처음 온 사람에게는 이미 돌아가는
 * 회사의 화면처럼 보이고, 누르면 아무 일도 없어 신뢰를 깎는다. 그래서 숫자를
 * 다 빼고 **실제로 하는 일**만 적는다.
 */
const FEATURES = [
  {
    icon: BookOpen,
    title: "작업표준서 · 위험성평가",
    body: "반복 작업은 표준서로 한 번 만들어 재사용합니다. 표준서가 없어도 간이 위험성평가로 바로 시작할 수 있습니다.",
  },
  {
    icon: ClipboardList,
    title: "작업지시 발급 · QR",
    body: "승인된 평가를 바탕으로 지시서를 발급하면 내용이 고정됩니다. 작업 정보와 QR 이 담긴 A4 한 장을 현장에 붙입니다.",
  },
  {
    icon: ClipboardCheck,
    title: "TBM · 작업 중 점검",
    body: "배정된 작업자에게 본인 전용 링크가 갑니다. 설치도 로그인도 없이 열어 TBM 과 순회점검을 기록합니다.",
  },
  {
    icon: CalendarCheck,
    title: "주간 안전점검 회의",
    body: "그 주의 부적합과 기한이 지난 감소대책을 모아 줍니다. 상시 위험성평가의 매주 기록 요건을 채웁니다.",
  },
];

export function Dashboard({
  companyName,
  tier,
  userName,
  isAuthenticated = false,
  isOperator = false,
  jobs,
  isManager = true,
  openFindingCount = 0,
  today,
}: {
  companyName?: string;
  tier?: Tier;
  userName?: string;
  isAuthenticated?: boolean;
  isOperator?: boolean;
  jobs?: Job[];
  isManager?: boolean;
  openFindingCount?: number;
  today?: Today;
}) {
  return (
    <AppShell
      active="home"
      companyName={companyName}
      tier={tier}
      userName={userName}
      isAuthenticated={isAuthenticated}
      isOperator={isOperator}
    >
      <DashboardBody
        jobs={jobs}
        isAuthenticated={isAuthenticated}
        isManager={isManager}
        openFindingCount={openFindingCount}
        today={today}
      />
    </AppShell>
  );
}

function DashboardBody({
  jobs,
  isAuthenticated,
  isManager,
  openFindingCount,
  today,
}: {
  jobs?: Job[];
  isAuthenticated: boolean;
  isManager: boolean;
  openFindingCount: number;
  today?: Today;
}) {
  const displayedJobs = jobs ?? [];

  return (
    <>
      {/* 로그인 전에만 구호를 크게 건다. 로그인한 사람에게 첫 화면의 절반을
          구호에 주면 정작 할 일이 밀린다 — 오늘 할 일이 먼저다. */}
      {!isAuthenticated && (
        <section className="hero">
          <h1>
            Safety must be <span>easy.</span>
          </h1>
          <p className="hero-lead">
            중소기업 안전관리를 표준서·지시서·현장점검 한 줄기로 묶습니다. 인원
            제한 없이 무료로 시작하세요.
          </p>
        </section>
      )}
      {isAuthenticated && today && (
        <section className="today" aria-label="오늘 할 일">
          <h1 className="today-title">
            오늘 ·{" "}
            {new Date(today.date + "T00:00:00+09:00").toLocaleDateString(
              "ko-KR",
              { month: "long", day: "numeric", weekday: "short" },
            )}
          </h1>
          <div className="today-grid">
            <Link href="/work-orders?tab=active" className="today-tile">
              <strong>{today.jobs}건</strong>
              <small>오늘 작업</small>
            </Link>
            {isManager && today.tbmMissing !== null && (
              <Link
                href="/monitoring"
                className={`today-tile${today.tbmMissing > 0 ? " is-alert" : ""}`}
              >
                <strong>{today.tbmMissing}명</strong>
                <small>TBM 미확인</small>
              </Link>
            )}
            {isManager && (
              <Link
                href="/inspections"
                className={`today-tile${openFindingCount > 0 ? " is-alert" : ""}`}
              >
                <strong>{openFindingCount}건</strong>
                <small>미조치 부적합</small>
              </Link>
            )}
            {isManager && (
              <Link href="/work-orders?tab=draft" className="today-tile">
                <strong>{today.drafts}건</strong>
                <small>작성 중 초안</small>
              </Link>
            )}
          </div>
        </section>
      )}

      {!isAuthenticated && (
        <>
          <section className="action-grid" aria-label="시작하기">
            <Link href="/login" className="action-card action-card--primary">
              <span className="action-card-icon">
                <ArrowRight size={17} />
              </span>
              <h2>무료로 시작하기</h2>
              <p>
                구글·네이버·카카오 계정으로 로그인하고 회사를 만들면 바로
                씁니다. 인원 제한 없이 무료입니다.
              </p>
              <span className="action-card-cta">
                로그인 <ArrowRight size={14} />
              </span>
            </Link>
            <Link href="/recognition-check" className="action-card">
              <span className="action-card-icon">
                <ShieldCheck size={17} />
              </span>
              <h2>우리 회사는 준비됐나</h2>
              <p>
                위험성평가 인정 준비도를 로그인 없이 진단합니다. 부족한 항목과
                다음 행동을 알려 줍니다.
              </p>
              <span className="action-card-cta">
                진단해 보기 <ArrowRight size={14} />
              </span>
            </Link>
          </section>

          <section className="stack" aria-label="주요 기능">
            <SectionHeading title="무엇을 하는 서비스인가" />
            <ul className="landing-features" role="list">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <li key={title}>
                  <span className="landing-feature-icon">
                    <Icon size={16} />
                  </span>
                  <strong>{title}</strong>
                  <p>{body}</p>
                </li>
              ))}
            </ul>
            <p className="hero-lead">
              표준서·지시서·PTW·TBM·점검 같은 텍스트 기반 기능은 인원 제한 없이
              무료입니다. 사진 첨부, 알림톡 발송, 지시서 출력물, 전체 기록
              조회가 필요해질 때 유료로 전환합니다.{" "}
              <Link className="text-button" href="/contact">
                요금·도입 문의 <ChevronRight size={13} />
              </Link>
            </p>
          </section>
        </>
      )}

      {isAuthenticated && (
        <section className="action-grid" aria-label="빠른 시작">
          {isManager && (
            <Link href="/company/members" className="action-card">
              <span className="action-card-icon">
                <Users size={17} />
              </span>
              <h2>구성원 초대하기</h2>
              <p>관리자와 작업자를 초대 링크로 연결합니다.</p>
              <span className="action-card-cta">
                시작하기 <ArrowRight size={14} />
              </span>
            </Link>
          )}
          <Link
            href={isManager ? "/work-orders/new" : "/work-orders"}
            className="action-card action-card--primary"
          >
            <span className="action-card-icon">
              <ClipboardList size={17} />
            </span>
            <h2>{isManager ? "오늘의 작업 지시하기" : "내 작업 확인하기"}</h2>
            <p>
              {isManager
                ? "표준서 없이도 간이평가로 시작합니다."
                : "배정된 작업의 위험요인과 대책을 확인하세요."}
            </p>
            <span className="action-card-cta">
              시작하기 <ArrowRight size={14} />
            </span>
          </Link>
        </section>
      )}

      {isAuthenticated && isManager && openFindingCount > 0 && (
        <section className="stack" aria-label="내 부적합 알림">
          <SectionHeading
            title="내가 처리할 안전조치"
            count={openFindingCount}
          />
          <Link href="/inspections" className="row">
            <span className="row-main">
              <strong>부적합 조치 확인</strong>
              <small>나에게 배정된 미조치 항목을 확인하세요.</small>
            </span>
            <span className="row-meta">
              <span className="row-count">{openFindingCount}건</span>
              <span className="row-state">조치 대기</span>
            </span>
            <ChevronRight size={14} className="row-chev" />
          </Link>
        </section>
      )}
      {isAuthenticated && (
        <section className="stack">
          <SectionHeading
            title="예정·진행 작업"
            count={displayedJobs.length}
            action={
              <Link href="/work-orders" className="text-button">
                전체 보기 <ChevronRight size={13} />
              </Link>
            }
          />
          <ul className="row-list" role="list">
            {displayedJobs.map(
              ({ title, place, time, people, status, href }) => (
                <li key={href ?? title}>
                  <Link href={href ?? "/work-orders"} className="row">
                    <span className="row-main">
                      <strong>{title}</strong>
                      <small>{place}</small>
                    </span>
                    <span className="row-meta row-meta--wide">
                      <span className="row-fact">{time}</span>
                      <span className="row-fact">{people}명 배정</span>
                      <span
                        className={`row-status${
                          status === "작업 중" ? " row-status--live" : ""
                        }`}
                      >
                        {status}
                      </span>
                    </span>
                    <ChevronRight size={14} className="row-chev" />
                  </Link>
                </li>
              ),
            )}
          </ul>
          {!displayedJobs.length && (
            <p className="hero-lead">
              예정·진행 중인 작업이 없습니다. 작성 중인 지시서는 작업지시
              메뉴에서 확인하세요.
            </p>
          )}
        </section>
      )}
    </>
  );
}

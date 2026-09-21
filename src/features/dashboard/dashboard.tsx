"use client";

import Link from "next/link";
import type { Tier } from "@/components/shell/tier";
import { ArrowRight, ChevronRight, ClipboardList, Users } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { usePreview } from "@/components/shell/preview-dialog";
import { SectionHeading } from "@/components/ui/section-heading";

type Task = {
  title: string;
  detail: string;
  count: string;
  state: string;
};

export type Job = {
  href?: string;
  title: string;
  place: string;
  time: string;
  people: number;
  status: string;
};

const PREVIEW_TASKS: Task[] = [
  {
    title: "위험작업허가 승인",
    detail: "용접 작업 외 1건",
    count: "2건",
    state: "승인 대기",
  },
  {
    title: "구성원 가입 승인",
    detail: "김민수 님이 참여를 요청했어요",
    count: "1명",
    state: "가입 대기",
  },
  {
    title: "부적합 조치 확인",
    detail: "내가 담당하는 개선 조치",
    count: "3건",
    state: "조치 대기",
  },
];

const PREVIEW_JOBS: Job[] = [
  {
    title: "제1공장 프레스 설비 점검",
    place: "제1공장 · 프레스 구역",
    time: "09:00 - 17:00",
    people: 5,
    status: "작업 중",
  },
  {
    title: "배관 용접 및 보수 작업",
    place: "제2공장 · 설비실",
    time: "10:00 - 16:00",
    people: 3,
    status: "작업 중",
  },
  {
    title: "출하장 지게차 상하차",
    place: "물류동 · 출하장",
    time: "13:00 - 17:00",
    people: 2,
    status: "예정",
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
}: {
  companyName?: string;
  tier?: Tier;
  userName?: string;
  isAuthenticated?: boolean;
  isOperator?: boolean;
  jobs?: Job[];
  isManager?: boolean;
  openFindingCount?: number;
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
      />
    </AppShell>
  );
}

function DashboardBody({
  jobs,
  isAuthenticated,
  isManager,
  openFindingCount,
}: {
  jobs?: Job[];
  isAuthenticated: boolean;
  isManager: boolean;
  openFindingCount: number;
}) {
  const preview = usePreview();
  const displayedJobs = jobs ?? PREVIEW_JOBS;

  return (
    <>
      <section className="hero">
        <h1>
          Safety must be <span>easy.</span>
        </h1>
        <p className="hero-lead">안전관리, 쉽고 간편하게 시작하세요.</p>
      </section>

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
      {!isAuthenticated && (
        <section className="stack">
          <SectionHeading title="오늘 처리할 일" count={PREVIEW_TASKS.length} />
          <ul className="row-list" role="list">
            {PREVIEW_TASKS.map(({ title, detail, count, state }) => (
              <li key={title}>
                <button
                  type="button"
                  className="row"
                  onClick={() => preview(title)}
                >
                  <span className="row-main">
                    <strong>{title}</strong>
                    <small>{detail}</small>
                  </span>
                  <span className="row-meta">
                    <span className="row-count">{count}</span>
                    <span className="row-state">{state}</span>
                  </span>
                  <ChevronRight size={14} className="row-chev" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="stack">
        <SectionHeading
          title={isAuthenticated ? "예정·진행 작업" : "오늘의 작업 (예시)"}
          count={displayedJobs.length}
          action={
            <Link href="/work-orders" className="text-button">
              전체 보기 <ChevronRight size={13} />
            </Link>
          }
        />
        <ul className="row-list" role="list">
          {displayedJobs.map(({ title, place, time, people, status, href }) => (
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
          ))}
        </ul>
        {isAuthenticated && !displayedJobs.length && (
          <p className="hero-lead">
            예정·진행 중인 작업이 없습니다. 작성 중인 지시서는 작업지시 메뉴에서
            확인하세요.
          </p>
        )}
      </section>
    </>
  );
}

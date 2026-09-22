"use client";

import Link from "next/link";
import type { Tier } from "@/components/shell/tier";
import {
  ArrowRight,
  CheckCircle2,
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
export type WorkerHome = {
  today: Array<{
    id: string;
    name: string;
    location: string;
    time: string;
    tbmDone: boolean;
    duringCount: number;
  }>;
  /** 내 TBM 이 빠진 지난 회차 수 */
  missed: number;
  missedOrderId?: string;
  /** 다음 회차 작업일 (YYYY-MM-DD), 없으면 null */
  next: string | null;
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
 * 로그인 전 화면 — 구성 설명이 아니라 "왜 써야 하는가" 네 가지.
 * 가짜 데이터는 두지 않는다. 처음 온 사람이 읽고 바로 시작하게만 한다.
 */
const REASONS = [
  {
    keyword: "시작 요금",
    body: "인원 제한 없이 무료. 문의·협의 없이 바로 가입, 유료는 필요할 때만.",
  },
  {
    keyword: "걱정",
    body: "위험성평가 → 작업지시 → 허가서 → 안전점검, 한 흐름. 공단 인정 시 3년 감독 유예 · 산재보험료 20% 인하 · 중처법 일부 대응.",
  },
  {
    keyword: "앱 설치 강요",
    body: "작업자는 QR 한 번. 설치도 로그인도 없이 TBM·점검 기록.",
  },
  {
    keyword: "국경",
    body: "외국인 근로자도 자기 언어로 위험요인 확인·기록.",
    soon: true,
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
  worker,
  pendingJoinCount = 0,
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
  worker?: WorkerHome;
  pendingJoinCount?: number;
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
        worker={worker}
        pendingJoinCount={pendingJoinCount}
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
  worker,
  pendingJoinCount,
}: {
  jobs?: Job[];
  isAuthenticated: boolean;
  isManager: boolean;
  openFindingCount: number;
  today?: Today;
  worker?: WorkerHome;
  pendingJoinCount: number;
}) {
  const displayedJobs = jobs ?? [];

  // 작업자의 홈은 다르다. 할 일은 오늘 회차의 TBM 하나라, 오늘 작업 카드가
  // 화면 전체이고 그 안에서 점검 폼으로 바로 간다. 미래 작업은 '다른 작업 보기'
  // 뒤로, 숫자 타일이나 안내 카드는 두지 않는다.
  if (isAuthenticated && !isManager && worker && today) {
    return (
      <>
        <section className="today" aria-label="오늘 할 일">
          <h1 className="today-title">
            오늘 ·{" "}
            {new Date(today.date + "T00:00:00+09:00").toLocaleDateString(
              "ko-KR",
              {
                timeZone: "Asia/Seoul",
                month: "long",
                day: "numeric",
                weekday: "short",
              },
            )}
          </h1>
          {worker.today.length ? (
            <ul className="worker-jobs" role="list">
              {worker.today.map((job) => {
                const root = "/work-orders/" + job.id + "/inspections";
                return (
                  <li key={job.id} className="worker-job">
                    <Link
                      href={"/work-orders/" + job.id}
                      className="worker-job-head"
                    >
                      <h2>{job.name}</h2>
                      <p>
                        {job.time}
                        {job.location ? " · " + job.location : ""}
                      </p>
                    </Link>
                    <div className="worker-job-actions">
                      {job.tbmDone ? (
                        <span className="worker-job-done">
                          <CheckCircle2 size={16} /> TBM 확인 완료
                        </span>
                      ) : (
                        <Link
                          className="btn-primary"
                          href={root + "?type=TBM&via=web"}
                        >
                          <CheckCircle2 size={16} /> TBM 확인
                        </Link>
                      )}
                      <Link
                        className="btn-secondary"
                        href={root + "?type=DURING_WORK&via=web"}
                      >
                        <ClipboardCheck size={16} /> 작업 중 점검
                        {job.duringCount > 0 ? ` (${job.duringCount})` : ""}
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="worker-empty">
              오늘 배정된 작업이 없습니다.
              {worker.next && (
                <>
                  <br />
                  다음 작업은 {worker.next} 입니다.
                </>
              )}
            </p>
          )}
        </section>
        {worker.missed > 0 && (
          <Link
            className="worker-missed"
            href={
              worker.missedOrderId
                ? "/work-orders/" + worker.missedOrderId + "/inspections"
                : "/work-orders"
            }
          >
            <span>
              <strong>지난 회차 미입력 {worker.missed}건</strong>
              <small>놓친 TBM 을 이어서 입력할 수 있습니다.</small>
            </span>
            <ChevronRight size={16} className="row-chev" />
          </Link>
        )}
        <p className="worker-more">
          <Link href="/work-orders" className="text-button">
            다른 작업 보기 <ChevronRight size={13} />
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      {/* 로그인 전에만 구호를 크게 건다. 로그인한 사람에게 첫 화면의 절반을
          구호에 주면 정작 할 일이 밀린다 — 오늘 할 일이 먼저다. */}
      {!isAuthenticated && (
        <section className="hero">
          <p className="hero-eyebrow">제조업 중소기업 사장님이</p>
          <h1>
            <span>심플안전</span>을 해야 하는 이유
          </h1>
          <p className="hero-lead">
            위험성평가부터 작업지시·허가서·안전점검까지, 오늘 바로.
          </p>
          <div className="hero-actions">
            <Link href="/login" className="btn-primary">
              무료로 시작하기 <ArrowRight size={15} />
            </Link>
            <Link href="/recognition-check" className="btn-secondary">
              <ShieldCheck size={15} /> 우리 회사는 준비됐나 · 진단
            </Link>
          </div>
        </section>
      )}
      {isAuthenticated && today && (
        <section className="today" aria-label="오늘 할 일">
          <h1 className="today-title">
            오늘 ·{" "}
            {new Date(today.date + "T00:00:00+09:00").toLocaleDateString(
              "ko-KR",
              {
                timeZone: "Asia/Seoul",
                month: "long",
                day: "numeric",
                weekday: "short",
              },
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
        <section className="stack" aria-label="심플안전을 해야 하는 이유">
          <ol className="reasons">
            {REASONS.map(({ keyword, body, soon }, i) => (
              <li key={keyword}>
                <span className="reason-no" aria-hidden="true">
                  {i + 1}
                </span>
                <div>
                  <h2>
                    <span className="reason-keyword">
                      &lsquo;{keyword}&rsquo;
                    </span>{" "}
                    없는
                    {soon && <span className="reason-badge">준비 중</span>}
                  </h2>
                  <p>{body}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="hero-lead">
            텍스트 기능은 전부 무료. 사진·알림톡·출력물·전체 기록은 유료.{" "}
            <Link className="text-button" href="/contact">
              요금·도입 문의 <ChevronRight size={13} />
            </Link>
          </p>
        </section>
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

      {/* 회사코드로 들어온 가입 신청은 메일로도 알리지만 메일은 묻힌다.
          승인 전에는 작업에 배정할 수 없어 사람이 놀게 되므로 홈에 한 줄 띄운다. */}
      {isAuthenticated && isManager && pendingJoinCount > 0 && (
        <section className="stack" aria-label="가입 승인 알림">
          <SectionHeading title="가입 승인 대기" count={pendingJoinCount} />
          <Link href="/company/members" className="row">
            <span className="row-main">
              <strong>참여를 기다리는 사람이 있습니다</strong>
              <small>승인해야 작업에 배정할 수 있습니다.</small>
            </span>
            <span className="row-meta">
              <span className="row-count">{pendingJoinCount}명</span>
              <span className="row-state">승인 대기</span>
            </span>
            <ChevronRight size={14} className="row-chev" />
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

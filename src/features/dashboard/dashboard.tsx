"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Tier } from "@/components/shell/tier";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Coins,
  Globe,
  QrCode,
  ShieldCheck,
  Users,
  X,
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
 * 한 줄 설명은 늘 보이고, 카드 어디를 눌러도 자세한 설명이 펼쳐진다.
 */
// 카드마다 다 갖는 건 넷, `soon`·`chips` 는 있을 때만. 마지막 카드에서 둘을 빼자
// 추론이 무너져 아래 map 이 any 가 됐다 — 모양을 못 박아 둔다.
type Reason = {
  keyword: string;
  icon: typeof Coins;
  body: string;
  detail: string;
  soon?: boolean;
  chips?: string[];
};
const REASONS: Reason[] = [
  {
    keyword: "시작 요금",
    icon: Coins,
    body: "인원 제한 없이 무료. 유료는 필요할 때만.",
    detail:
      "포털형 안전시스템으로, 문의·협의 없이 가입 즉시 사용합니다. " +
      "표준서·지시서 등  모든 업무가 기본적으로 무료이며, " +
      "사진첨부·SMS·출력물·통계 등 추가 기능이 필요해질 때 합리적인 가격으로 유료 전환하시면 됩니다.",
  },
  {
    keyword: "걱정",
    icon: ShieldCheck,
    body: "표준서·지시서·허가서·TBM·점검·사고등록 등 중처법/산안법 요구사항 대비",
    detail:
      "어려운 중처법, 산안법을 주기적으로 파악하여 시스템에 반영합니다." +
      " 또, 시스템 안에서 매일 쌓이는 표준서·지시서·허가서·점검 기록이 그대로 위험성평가 인정 준비가 됩니다. (인정받으면 3년간 정기 감독 유예, 산재보험료 20% 인하)",
  },
  {
    keyword: "앱 설치",
    icon: QrCode,
    body: "구성원은 QR만 찍으면 TBM·점검 기록.",
    detail:
      "관리자가 구성원을 초대하고, 구성원이 회원가입만 하면 끝입니다. " +
      "작업지시서 발급 시 QR코드를 출력해 현장에 게시하면, 작업자가 일반 카메라로 인식 후 TBM 및 점검이 가능합니다. " +
      "유료 구독 시 개인화된 링크 발송으로, 이마저도 생략할 수 있습니다.",
  },
  {
    keyword: "국경",
    icon: Globe,
    body: "외국인 근로자도 자기 언어로 위험요인 확인·기록.",
    detail:
      "외국인 근로자가 위험요인과 감소대책을 자기 언어로 읽고 확인 기록을 남깁니다. 한국어 원문과 함께 보관되어 관리자는 그대로 확인합니다.",
  },
];

/**
 * 이유 한 장. 카드 전체가 단추라 어디를 눌러도 자세한 설명이 창으로 뜬다.
 * 제목·한 줄 설명·혜택 칩은 카드에 늘 보이고, 긴 설명만 창에 있다.
 * 접기(<details>)는 좁은 화면에서 카드 사이가 비고 열리면 아래가 밀려 내려가
 * 한 화면 규칙이 깨졌다. 창은 카드 배치를 흔들지 않는다.
 */
function ReasonCard({
  reason,
  onOpen,
}: {
  reason: Reason;
  onOpen: () => void;
}) {
  const { keyword, icon: Icon, body, soon, chips } = reason;
  return (
    <li>
      <button type="button" className="reason" onClick={onOpen}>
        <span className="reason-icon" aria-hidden="true">
          <Icon size={22} />
        </span>
        <span className="reason-content">
          <h2>
            <span className="reason-keyword">&lsquo;{keyword}&rsquo;</span> 없는
            {soon && <span className="reason-badge">준비 중</span>}
          </h2>
          <span className="reason-body">{body}</span>
          {chips && (
            <span className="reason-chips">
              {chips.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </span>
          )}
        </span>
        <ChevronRight size={20} className="reason-chevron" aria-hidden="true" />
      </button>
    </li>
  );
}

/**
 * 이유의 자세한 설명 창. 넓은 화면은 가운데 카드, 좁은 화면은 아래에서 올라오는
 * 시트 (globals.css .reason-dialog). 바깥을 누르거나 Esc 로 닫는다.
 */
function ReasonDialog({
  reason,
  onClose,
}: {
  reason: Reason | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reason && !el.open) el.showModal();
    else if (!reason && el.open) el.close();
  }, [reason]);
  const Icon = reason?.icon;
  return (
    <dialog
      ref={ref}
      className="reason-dialog"
      aria-labelledby="reason-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {reason && Icon && (
        <div className="reason-dialog-body">
          <button
            type="button"
            className="reason-dialog-close"
            onClick={onClose}
            aria-label="닫기"
          >
            <X size={20} />
          </button>
          <span className="reason-icon" aria-hidden="true">
            <Icon size={24} />
          </span>
          <h2 id="reason-dialog-title">
            <span className="reason-keyword">
              &lsquo;{reason.keyword}&rsquo;
            </span>{" "}
            없는
            {reason.soon && <span className="reason-badge">준비 중</span>}
          </h2>
          <p className="reason-dialog-lead">{reason.body}</p>
          {reason.chips && (
            <span className="reason-chips">
              {reason.chips.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </span>
          )}
          <p className="reason-dialog-detail">{reason.detail}</p>
          <button type="button" className="btn-primary" onClick={onClose}>
            확인
          </button>
        </div>
      )}
    </dialog>
  );
}

/** 로그인 전 — 이유 넷과 그 설명 창. */
function Reasons() {
  const [open, setOpen] = useState<Reason | null>(null);
  return (
    <section
      className="stack reasons-section"
      aria-label="심플안전 해야하는 이유"
    >
      <ol className="reasons">
        {REASONS.map((reason) => (
          <ReasonCard
            key={reason.keyword}
            reason={reason}
            onOpen={() => setOpen(reason)}
          />
        ))}
      </ol>
      <ReasonDialog reason={open} onClose={() => setOpen(null)} />
    </section>
  );
}

/**
 * 넓은 화면의 머리 오른쪽에 두는 작업자 화면 예시. 포스터의 그림을 옮겼다.
 * 실제 회사처럼 보이지 않게 이름은 가리고 "예시" 라고 적는다. 좁은 화면에서는
 * 숨긴다 (한 화면에 들어가야 한다).
 */
function HeroPhone() {
  const rows = [
    { text: "절단기 #2 작업 전 점검", meta: "08:12 · 김○○", done: true },
    { text: "화기작업 허가서 승인", meta: "08:20 · 반장 박○○", done: true },
    { text: "용접 부스 위험요인 확인", meta: "08:30 · 응우옌 ○", done: true },
    { text: "지게차 일일점검", meta: "QR 스캔 대기", done: false },
  ];
  return (
    <div className="hero-phone" aria-hidden="true">
      <div className="hero-phone-screen">
        <div className="hero-phone-head">
          <small>심플안전 · 2라인</small>
          <b>오늘 점검 3 / 4</b>
        </div>
        <ul className="hero-phone-list">
          {rows.map((r) => (
            <li key={r.text} className={r.done ? "is-done" : ""}>
              <span className="hero-phone-check">
                {r.done && <Check size={11} strokeWidth={3} />}
              </span>
              <span>
                {r.text}
                <small>{r.meta}</small>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="hero-phone-cap">작업자 화면 예시</p>
    </div>
  );
}

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
  topSlot,
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
  /** 본문 맨 위에 끼우는 것 (푸시 알림 켜기 안내 등). 서버가 고른다. */
  topSlot?: ReactNode;
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
      {topSlot}
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
          <div className="hero-copy">
            <p className="hero-eyebrow">제조업은</p>
            <h1>
              <span>심플안전</span> 해야합니다.
            </h1>
            <p className="hero-lead">당장 오늘부터 심플하게 시작해요</p>
            <div className="hero-actions">
              <Link href="/login" className="btn-primary">
                무료로 시작 <ArrowRight size={15} />
              </Link>
              <Link href="/recognition-check" className="btn-secondary">
                <ShieldCheck size={15} /> 우리회사 안전수준 진단
              </Link>
            </div>
          </div>
          <HeroPhone />
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

      {!isAuthenticated && <Reasons />}

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
            <h2>
              {isManager ? (
                // 좁은 폰에서 줄이 바뀌면 "·PTW" 처럼 가운뎃점이 줄 머리에 온다.
                // 점은 앞말에 붙이고, 끊을 자리는 점 뒤로 준다.
                <>
                  <span style={{ whiteSpace: "nowrap" }}>작업지시·</span>
                  <wbr />
                  PTW 발급하기
                </>
              ) : (
                "내 작업 확인하기"
              )}
            </h2>
            <p>
              {isManager
                ? "위험작업이면 허가서까지 한 번에"
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

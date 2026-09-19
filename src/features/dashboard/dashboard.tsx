"use client";

import {
  ArrowRight,
  ChevronRight,
  ClipboardList,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { usePreview } from "@/components/shell/preview-dialog";
import { SectionHeading } from "@/components/ui/section-heading";

type Task = {
  title: string;
  detail: string;
  count: string;
  state: string;
};

type Job = {
  title: string;
  place: string;
  time: string;
  people: number;
  status: "작업 중" | "예정";
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
  userName,
  isAuthenticated = false,
}: {
  companyName?: string;
  userName?: string;
  isAuthenticated?: boolean;
}) {
  return (
    <AppShell
      active="home"
      breadcrumb={[{ label: "홈" }]}
      companyName={companyName}
      userName={userName}
      isAuthenticated={isAuthenticated}
    >
      <DashboardBody />
    </AppShell>
  );
}

function DashboardBody() {
  const preview = usePreview();

  return (
    <>
      <section className="hero">
        <h1>
          Safety must be <span>easy.</span>
        </h1>
        <p className="hero-lead">안전관리, 쉽고 간편하게 시작하세요.</p>
      </section>

      <section className="action-grid" aria-label="빠른 시작">
        <button
          type="button"
          className="action-card"
          onClick={() => preview("구성원 초대")}
        >
          <span className="action-card-icon">
            <Users size={17} />
          </span>
          <h2>구성원 초대하기</h2>
          <p>관리자와 작업자를 초대 링크로 연결합니다.</p>
          <span className="action-card-cta">
            시작하기 <ArrowRight size={14} />
          </span>
        </button>
        <button
          type="button"
          className="action-card action-card--primary"
          onClick={() => preview("오늘의 작업 지시")}
        >
          <span className="action-card-icon">
            <ClipboardList size={17} />
          </span>
          <h2>오늘의 작업 지시하기</h2>
          <p>표준서가 없어도 업종 템플릿으로 바로 시작합니다.</p>
          <span className="action-card-cta">
            시작하기 <ArrowRight size={14} />
          </span>
        </button>
      </section>

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

      <section className="stack">
        <SectionHeading
          title="오늘의 작업"
          count={PREVIEW_JOBS.length}
          action={
            <button
              type="button"
              className="text-button"
              onClick={() => preview("작업지시 내역")}
            >
              전체 보기 <ChevronRight size={13} />
            </button>
          }
        />
        <ul className="row-list" role="list">
          {PREVIEW_JOBS.map(({ title, place, time, people, status }) => (
            <li key={title}>
              <button
                type="button"
                className="row"
                onClick={() => preview(title)}
              >
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
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

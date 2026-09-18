"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowRight,
  Bell,
  BookOpen,
  Building2,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  FileCheck2,
  FileText,
  HardHat,
  HelpCircle,
  Home,
  Layers3,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";

const navigation = [
  { title: "홈", icon: Home },
  { title: "작업지시", icon: ClipboardList },
  { title: "작업표준서", icon: BookOpen },
  { title: "위험성평가", icon: ShieldCheck },
  { title: "안전점검", icon: ClipboardCheck },
  { title: "안전사고", icon: TriangleAlert },
  { title: "회사정보", icon: Building2 },
  { title: "이용·관리", icon: Settings2 },
];
const previewTasks = [
  {
    icon: FileCheck2,
    color: "orange",
    title: "위험작업허가 승인",
    detail: "용접 작업 외 1건",
    count: "2건",
    action: "승인 대기",
  },
  {
    icon: Users,
    color: "blue",
    title: "새로운 구성원 가입",
    detail: "김민수 님이 참여를 요청했어요",
    count: "1명",
    action: "가입 대기",
  },
  {
    icon: TriangleAlert,
    color: "yellow",
    title: "부적합 조치 확인",
    detail: "내가 담당하는 개선 조치",
    count: "3건",
    action: "조치 대기",
  },
];
const previewJobs = [
  {
    title: "제1공장 프레스 설비 점검",
    place: "제1공장 · 프레스 구역",
    time: "09:00 – 17:00",
    people: 5,
    done: 4,
    status: "작업 중",
    icon: Settings2,
    tone: "blue",
  },
  {
    title: "배관 용접 및 보수 작업",
    place: "제2공장 · 설비실",
    time: "10:00 – 16:00",
    people: 3,
    done: 3,
    status: "작업 중",
    icon: HardHat,
    tone: "orange",
  },
  {
    title: "출하장 지게차 상하차",
    place: "물류동 · 출하장",
    time: "13:00 – 17:00",
    people: 2,
    done: 0,
    status: "작업 예정",
    icon: Layers3,
    tone: "purple",
  },
];

export function Dashboard({ date }: { date: string }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dialogTitle, setDialogTitle] = useState("");
  const [sample, setSample] = useState(true);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  function preview(title: string) {
    triggerRef.current = document.activeElement as HTMLElement;
    setDialogTitle(title);
    setMobileOpen(false);
    dialogRef.current?.showModal();
  }
  function closeDialog() {
    dialogRef.current?.close();
    triggerRef.current?.focus();
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        본문으로 바로가기
      </a>
      {mobileOpen && (
        <button
          className="sidebar-shade"
          aria-label="메뉴 닫기"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside className={`sidebar ${mobileOpen ? "is-open" : ""}`}>
        <Link href="/" className="brand" aria-label="SMBE 홈">
          <svg
            className="brand-logo"
            viewBox="320 170 1430 400"
            role="img"
            aria-label="SMBE 로고"
          >
            <image href="/brand/smbe-original.png" width="2073" height="758" />
          </svg>
        </Link>
        <button
          className="workspace-picker"
          onClick={() => preview("회사 선택")}
        >
          <span className="company-icon">
            <Building2 size={19} />
          </span>
          <span>
            <strong>우리 회사</strong>
            <small>안전관리 워크스페이스</small>
          </span>
          <ChevronDown size={15} />
        </button>
        <p className="nav-caption">WORKSPACE</p>
        <nav aria-label="주 메뉴">
          {navigation.map(({ title, icon: Icon }, index) => (
            <button
              key={title}
              className={`nav-item ${index === 0 ? "active" : ""}`}
              aria-current={index === 0 ? "page" : undefined}
              onClick={() =>
                index === 0 ? setMobileOpen(false) : preview(title)
              }
            >
              <Icon size={19} />
              <span>{title}</span>
              {index > 0 && <ChevronRight size={14} />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <span className="help-symbol">
              <BookOpen size={20} />
            </span>
            <strong>안전관리, 처음이신가요?</strong>
            <p>
              우리 회사에 필요한 안전관리부터
              <br />
              차근차근 알아보세요.
            </p>
            <button onClick={() => preview("안전법 가이드")}>
              안전법 가이드 <ArrowRight size={15} />
            </button>
          </div>
          <button className="support" onClick={() => preview("도움말")}>
            <HelpCircle size={17} />
            도움말 및 이용 안내
            <ArrowDownToLine size={15} />
          </button>
          <div className="sidebar-foot">
            Safety Must Be Easy <span>© SMBE</span>
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="메뉴 열기"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={21} />
            </button>
            <Home size={16} />
            <span>/</span>
            <strong>홈</strong>
          </div>
          <div className="topbar-right">
            <span className="preview-label">
              <span />
              화면 미리보기
            </span>
            <span className="topbar-divider" />
            <button
              className="icon-button"
              aria-label="알림"
              onClick={() => preview("알림")}
            >
              <Bell size={19} />
            </button>
            <button className="profile" onClick={() => preview("내 정보")}>
              <span className="avatar">관</span>
              <span>관리자</span>
              <ChevronDown size={14} />
            </button>
          </div>
        </header>
        <main id="main" className="main-content">
          <section className="welcome">
            <div>
              <p className="eyebrow">YOUR EVERYDAY SAFETY PARTNER</p>
              <h1>
                Safety must be <span>easy.</span>
              </h1>
              <p className="welcome-description">
                안전관리, 쉽고 간편하게 시작하세요.
              </p>
            </div>
            <div className="today">
              <span className="date-dot" />
              {date}
            </div>
          </section>

          <div className="preview-notice">
            <span>
              <Sparkles size={16} />
              메인 화면 미리보기 · 아래 기록은 실제 업무와 무관한 예시입니다.
            </span>
            <button onClick={() => setSample(!sample)}>
              {sample ? "빈 화면 보기" : "예시 화면 보기"}
              <ArrowRight size={14} />
            </button>
          </div>

          <section className="action-grid" aria-label="빠른 시작">
            <button
              className="action-card invite-card"
              onClick={() => preview("작업자·관리자 초대")}
            >
              <div>
                <span className="action-kicker">함께 시작하는 안전관리</span>
                <h2>
                  회사 작업자·관리자
                  <br />
                  초대하기
                </h2>
                <p>함께 일하는 동료를 우리 회사에 초대하세요.</p>
                <span className="action-link">
                  구성원 초대 <ArrowRight size={16} />
                </span>
              </div>
              <div className="people-art" aria-hidden="true">
                <div className="person back-person">
                  <Users size={37} />
                </div>
                <div className="person front-person">
                  <HardHat size={42} />
                </div>
                <span className="art-plus">
                  <Plus size={20} />
                </span>
              </div>
            </button>
            <button
              className="action-card order-card"
              onClick={() => preview("오늘의 작업 지시")}
            >
              <div>
                <span className="action-kicker">오늘도 안전한 작업의 시작</span>
                <h2>
                  오늘의 작업
                  <br />
                  지시하기
                </h2>
                <p>위험요인 확인부터 작업 전달까지 한 번에.</p>
                <span className="action-link">
                  작업지시 작성 <ArrowRight size={16} />
                </span>
              </div>
              <div className="paper-art" aria-hidden="true">
                <span className="paper-clip" />
                <span className="paper-heading" />
                <span className="paper-line" />
                <span className="paper-line short" />
                <span className="paper-check">
                  <Check size={19} />
                  <i />
                </span>
                <span className="paper-check">
                  <Check size={19} />
                  <i />
                </span>
                <span className="paper-badge">
                  <ShieldCheck size={30} />
                </span>
              </div>
            </button>
          </section>

          <section className="assessment-banner">
            <span className="banner-icon">
              <ShieldCheck size={23} />
            </span>
            <div>
              <h3>위험성평가, 어렵게 시작하지 마세요.</h3>
              <p>
                표준서가 없어도 괜찮아요. 업종별 템플릿으로 앞으로의 평가를
                준비하세요.
              </p>
            </div>
            <button onClick={() => preview("위험성평가 시작")}>
              평가 시작하기
              <ArrowRight size={16} />
            </button>
          </section>

          <div className="overview-grid">
            <section className="panel tasks-panel">
              <div className="section-heading">
                <h2>
                  오늘 처리할 일{" "}
                  <span className="count">{sample ? "6" : "0"}</span>
                </h2>
                <span className="muted-label">
                  {sample ? "예시 데이터" : "아직 연결 전이에요"}
                </span>
              </div>
              {sample ? (
                <div className="task-list">
                  {previewTasks.map(
                    ({ icon: Icon, title, color, detail, count, action }) => (
                      <button
                        className="task-row"
                        key={title}
                        onClick={() => preview(title)}
                      >
                        <span className={`task-icon ${color}`}>
                          <Icon size={20} />
                        </span>
                        <span className="task-copy">
                          <strong>{title}</strong>
                          <small>{detail}</small>
                        </span>
                        <span className="task-status">
                          <strong>{count}</strong>
                          <small>{action}</small>
                        </span>
                        <ChevronRight size={16} />
                      </button>
                    ),
                  )}
                </div>
              ) : (
                <div className="empty-state">
                  <CheckCheck size={30} />
                  <strong>처리할 일이 없습니다.</strong>
                  <p>업무를 연결하면 필요한 일을 모아 보여드려요.</p>
                </div>
              )}
            </section>
            <section className="panel safety-panel">
              <div className="section-heading">
                <h2>우리 회사 안전관리</h2>
                <span className="small-tag">시작 가이드</span>
              </div>
              <div className="safety-body">
                <div className="safety-emblem">
                  <ShieldCheck size={39} />
                  <span>
                    <Check size={13} />
                  </span>
                </div>
                <h3>작은 실천부터, 더 안전하게</h3>
                <p>
                  평가하고, 공유하고, 확인하는 습관.
                  <br />
                  우리 회사의 안전한 일상을 만들어보세요.
                </p>
                <button onClick={() => preview("안전관리 시작 가이드")}>
                  시작 가이드 보기
                  <ArrowRight size={15} />
                </button>
              </div>
              <div className="safety-foot">
                <span />
                안전점수는 산정 기준 확정 후 제공됩니다.
              </div>
            </section>
          </div>

          <section className="jobs-section">
            <div className="section-heading">
              <h2>
                오늘의 작업 <span className="count">{sample ? "3" : "0"}</span>
              </h2>
              <button
                className="text-button"
                onClick={() => preview("작업지시 내역")}
              >
                전체 보기
                <ChevronRight size={15} />
              </button>
            </div>
            {sample ? (
              <div className="job-grid">
                {previewJobs.map(
                  ({
                    title,
                    place,
                    time,
                    people,
                    done,
                    status,
                    icon: Icon,
                    tone,
                  }) => (
                    <article className="job-card" key={title}>
                      <div className="job-top">
                        <span className={`task-icon ${tone}`}>
                          <Icon size={21} />
                        </span>
                        <span
                          className={`status-pill ${status === "작업 중" ? "working" : "scheduled"}`}
                        >
                          {status}
                        </span>
                        <button
                          className="icon-button"
                          aria-label={`${title} 메뉴`}
                          onClick={() => preview(title)}
                        >
                          <MoreHorizontal size={19} />
                        </button>
                      </div>
                      <button
                        className="job-title"
                        onClick={() => preview(title)}
                      >
                        {title}
                      </button>
                      <p className="job-place">{place}</p>
                      <div className="job-time">
                        <span>{time}</span>
                        <span>
                          <Users size={14} />
                          {people}명
                        </span>
                      </div>
                      <div className="tbm-heading">
                        <span>TBM 확인</span>
                        <strong>
                          {done}
                          <span> / {people}명</span>
                        </strong>
                      </div>
                      <div
                        className="progress-track"
                        role="progressbar"
                        aria-label={`${title} TBM 확인 예시`}
                        aria-valuenow={done}
                        aria-valuemin={0}
                        aria-valuemax={people}
                      >
                        <span
                          style={{ width: `${(done / people) * 100}%` }}
                          className={done === people ? "complete" : ""}
                        />
                      </div>
                      <button
                        className="copy-button"
                        onClick={() => preview("지시서 복사")}
                      >
                        <FileText size={15} />
                        복사해서 지시하기
                        <ArrowRight size={14} />
                      </button>
                    </article>
                  ),
                )}
              </div>
            ) : (
              <div className="panel empty-state">
                <ClipboardList size={30} />
                <strong>첫 작업을 시작해볼까요?</strong>
                <p>
                  오늘의 작업 지시하기에서 시작할 수 있어요. 현재는 화면
                  미리보기입니다.
                </p>
                <button
                  className="text-button"
                  onClick={() => preview("오늘의 작업 지시")}
                >
                  작업지시 살펴보기
                  <ArrowRight size={15} />
                </button>
              </div>
            )}
          </section>
          <footer className="page-footer">
            <span>
              <ShieldCheck size={14} />
              매일의 안전을 더 쉽게, SMBE
            </span>
            <span>Safety Must Be Easy.</span>
          </footer>
        </main>
      </div>
      <dialog
        ref={dialogRef}
        className="preview-dialog"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeDialog();
        }}
        onCancel={closeDialog}
        aria-labelledby="dialog-title"
      >
        <button
          className="dialog-close icon-button"
          aria-label="닫기"
          onClick={closeDialog}
        >
          <X size={20} />
        </button>
        <span className="dialog-symbol">
          <Search size={26} />
        </span>
        <p className="eyebrow">COMING NEXT</p>
        <h2 id="dialog-title">{dialogTitle}</h2>
        <p>
          이 기능은 아직 준비 중입니다.
          <br />
          현재는 메인 화면만 살펴볼 수 있으며,
          <br />
          업무 데이터는 저장하거나 변경하지 않습니다.
        </p>
        <button className="primary-button" onClick={closeDialog}>
          확인했어요
        </button>
      </dialog>
    </div>
  );
}

import type { ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Archive,
  CheckCheck,
  CheckCircle2,
  ChevronRight,
  ListChecks,
  MessageSquare,
  PenLine,
  Plus,
  Printer,
  Save,
  Search,
  ShieldCheck,
  SquareCheckBig,
  TriangleAlert,
} from "lucide-react";

/**
 * 로그인 전 홈의 "화면 미리보기". 진짜 화면을 찍은 그림이 아니라 CSS 로 그린 손전화
 * 목업이다 — 글자가 선명하고, 색은 토큰이라 테마와 같이 간다. 구조·순서·문구는 실제
 * 화면(표준서 상세 · 지시서 상세 · 작업자 TBM · 주간 회의)을 그대로 따른다(사장님 결정
 * 2026-10-01). 안의 데이터는 예시이고 그렇게 적혀 있다(헌법 6장).
 * 실제 화면이 바뀌면 여기도 맞춘다 — 그래서 이름표에 실제 파일을 적어 둔다.
 */
export function Shot({
  label,
  title,
  children,
}: {
  label: string;
  /** 앱 상단바의 제목 — 실제 화면과 같은 글. */
  title: string;
  children: ReactNode;
}) {
  return (
    <figure className="shot-phone">
      <div className="shot-screen" aria-hidden="true">
        <div className="shot-bar">
          <ArrowLeft size={12} />
          <b>{title}</b>
          <i>표</i>
        </div>
        <div className="shot-body">{children}</div>
      </div>
      <figcaption>{label} · 예시 화면</figcaption>
    </figure>
  );
}

const Ppe = ({ items }: { items: string[] }) => (
  <div className="shot-ppe">
    {items.map((p) => (
      <span key={p}>
        <ShieldCheck size={10} /> {p}
      </span>
    ))}
  </div>
);

const Caution = ({ text }: { text: string }) => (
  <div className="shot-caution">
    <small>주의사항</small>
    {text}
  </div>
);

/** 표준서 상세 (app/standards/[id] · standard-detail-view.tsx) */
export function StandardShot() {
  return (
    <Shot label="작업표준서" title="프레스 금형 교체">
      <p className="shot-eyebrow">확정됨</p>
      <p className="shot-h1">프레스 금형 교체</p>
      <p className="shot-meta">1판 · 확정 2026. 10. 1. · 표준 관리자</p>
      <Ppe items={["안전모", "보호장갑"]} />
      <div className="shot-btn shot-btn--primary">
        <ShieldCheck size={11} /> 이 표준서로 지시서 작성{" "}
        <ArrowRight size={11} />
      </div>
      <div className="shot-btn-row">
        <span className="shot-btn">
          <PenLine size={10} /> 표준서 개정
        </span>
        <span className="shot-btn">
          <Plus size={10} /> 위험성평가 다시하기
        </span>
        <span className="shot-btn">
          <Archive size={10} /> 폐기
        </span>
      </div>
      <div className="shot-assess">
        <ShieldCheck size={11} />
        <span>
          이 표준서의 위험성평가: 최초 위험성평가 (2026. 10. 1.)
          <small>유효기간 2029. 10. 1.까지</small>
        </span>
      </div>
      <Caution text="안전블록 없이 금형 밑에 손 넣지 않기" />
      <div className="shot-card">
        <p className="shot-h2">작업 단계</p>
        <ol className="shot-steps">
          <li>
            <b>1</b>전원 차단·잠금
          </li>
          <li>
            <b>2</b>금형 분리
          </li>
        </ol>
      </div>
    </Shot>
  );
}

/** 지시서 상세 (app/work-orders/[id]) — 상태 4칸 · 오늘 회차 · 구간 칩 · QR·전달 */
export function OrderShot() {
  return (
    <Shot label="작업지시" title="2호기 금형 교체">
      <div className="shot-statuses">
        <div>
          <small>작업 일정</small>
          <b data-tone="ok">발급</b>
        </div>
        <div>
          <small>PTW</small>
          <b data-tone="ok">승인</b>
        </div>
        <div>
          <small>오늘 TBM</small>
          <b data-tone="info">1/2명 확인</b>
        </div>
        <div>
          <small>미조치 불량</small>
          <b>0건</b>
        </div>
      </div>
      <div className="shot-today">
        <b>오늘 회차: 10/2(금) 09:00 ~ 17:00 · TBM 1/2</b>
        <div className="shot-btn-row">
          <span className="shot-btn shot-btn--primary">
            <CheckCircle2 size={10} /> TBM 확인하기
          </span>
          <span className="shot-btn">
            <Search size={10} /> 작업 중 점검하기
          </span>
        </div>
      </div>
      <div className="shot-chips">
        <span className="is-active">작업 정보</span>
        <span>일정·인원</span>
        <span>체크리스트</span>
        <span>QR·전달</span>
      </div>
      <p className="shot-h2">작업지시 QR</p>
      <div className="shot-qr">
        <QrPattern />
      </div>
      <div className="shot-btn shot-btn--primary shot-btn--fit">
        <Printer size={10} /> 지시서 인쇄 / PDF 저장
      </div>
      <div className="shot-field">
        <small>작업 링크</small>
        https://smbe.net/work-orders/…?via=link
      </div>
    </Shot>
  );
}

/** 작업자 TBM 확인 (app/w · inspection-form.tsx) */
export function WorkerShot() {
  return (
    <Shot label="작업자 TBM" title="TBM 확인">
      <p className="shot-meta">
        <b>김작업</b>님
      </p>
      <p className="shot-h1">2호기 금형 교체</p>
      <Ppe items={["안전모", "보호장갑"]} />
      <p className="shot-h2">위험요인·감소대책</p>
      <p className="shot-risk">
        <b>1. 끼임 위험</b>
        동력 차단 및 방호장치 확인
      </p>
      <p className="shot-h2">TBM 체크리스트</p>
      <span className="shot-btn shot-btn--fit">
        <CheckCheck size={10} /> 전부 양호으로 표시
      </span>
      <div className="shot-item">
        <b>1. 방호장치 상태 확인</b>
        <div className="shot-radios">
          <span className="is-on">
            <i />
            양호
          </span>
          <span>
            <i />
            불량
          </span>
          <span>
            <i />
            해당없음
          </span>
        </div>
        <small>
          <MessageSquare size={9} /> 코멘트 쓰기
        </small>
      </div>
      <label className="shot-confirm">
        <span className="shot-check" />
        위험요인·감소대책을 확인했고, 내 이름으로 TBM 참여를 기록합니다.
      </label>
      <div className="shot-btn shot-btn--primary shot-btn--sticky">
        <Save size={11} /> TBM 확인 저장
      </div>
    </Shot>
  );
}

/** 주간 안전회의 (app/meetings/[week]) — 출처 칩 · 수집 항목 · 참석자 */
export function MeetingShot() {
  return (
    <Shot label="주간 안전회의" title="9/28 ~ 10/4 주간 회의">
      <p className="shot-h2">수집 항목 3건</p>
      <div className="shot-card shot-meeting-item">
        <span className="shot-route" data-source="INSPECTION_FINDING">
          <SquareCheckBig size={9} /> 안전점검 · 점검 불량{" "}
          <ChevronRight size={9} />
        </span>
        <b>지게차 일일점검 · 경광등 작동</b>
        <small>미확인</small>
      </div>
      <div className="shot-card shot-meeting-item">
        <span className="shot-route" data-source="INCIDENT">
          <TriangleAlert size={9} /> 안전사고 · 안전사고{" "}
          <ChevronRight size={9} />
        </span>
        <b>끼임 아차사고 · 출하장</b>
        <small>이행 확인 · 안전블록 체크리스트 추가</small>
      </div>
      <div className="shot-card shot-meeting-item">
        <span className="shot-route" data-source="RISK_MEASURE">
          <ListChecks size={9} /> 위험성평가 · 평가 감소대책 미조치{" "}
          <ChevronRight size={9} />
        </span>
        <b>프레스 금형 교체 · 끼임</b>
        <small>미확인</small>
      </div>
      <p className="shot-h2">참석자 · 논의 내용</p>
      <p className="shot-meta">참석자: 표준 관리자, 김작업 외 3명</p>
      <div className="shot-btn shot-btn--primary shot-btn--fit">회의 완료</div>
    </Shot>
  );
}

/** QR 처럼 보이는 무늬. 읽히는 코드가 아니다 — 모서리 세 개와 정해진 점들. */
function QrPattern() {
  const n = 21;
  const cells: Array<[number, number]> = [];
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const isFinder = (x: number, y: number) =>
    (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
  const finderOn = (x: number, y: number) => {
    const fx = x < 7 ? x : x - (n - 7);
    const fy = y < 7 ? y : y - (n - 7);
    const ring = fx === 0 || fx === 6 || fy === 0 || fy === 6;
    const core = fx >= 2 && fx <= 4 && fy >= 2 && fy <= 4;
    return ring || core;
  };
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const on = isFinder(x, y) ? finderOn(x, y) : rnd() < 0.42;
      if (on) cells.push([x, y]);
    }
  return (
    <svg viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges">
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />
      ))}
    </svg>
  );
}

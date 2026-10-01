import type { ReactNode } from "react";
import { Check } from "lucide-react";

/**
 * 로그인 전 홈의 "화면 미리보기". 진짜 화면을 찍은 그림이 아니라 CSS 로 그린 손전화
 * 목업이다 — 글자가 선명하고, 색은 토큰이라 테마와 같이 간다. 안의 글은 예시이고
 * 그렇게 적혀 있다(헌법 6장: 로그인 전 홈에 진짜처럼 보이는 가짜 데이터를 두지 않는다).
 */
export function Shot({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <figure className="shot-phone">
      <div className="shot-screen" aria-hidden="true">
        {children}
      </div>
      <figcaption>{label} · 예시 화면</figcaption>
    </figure>
  );
}

export function StandardShot() {
  return (
    <Shot label="작업표준서">
      <p className="shot-eyebrow">작업표준서 · 2판</p>
      <p className="shot-title">프레스 금형 교체</p>
      <div className="shot-chips">
        <span>안전모</span>
        <span>보안경</span>
        <span>안전장갑</span>
      </div>
      <ol className="shot-steps">
        <li>
          <b>1</b>전원 차단·잠금
        </li>
        <li>
          <b>2</b>금형 분리
        </li>
        <li>
          <b>3</b>새 금형 체결
        </li>
      </ol>
      <div className="shot-doc">
        별도 문서 · 위험성평가
        <small>위험요인 3 · 승인</small>
      </div>
    </Shot>
  );
}

export function OrderShot() {
  return (
    <Shot label="작업지시 QR">
      <p className="shot-eyebrow">작업지시 · 발급</p>
      <p className="shot-title">2호기 금형 교체</p>
      <p className="shot-meta">10/2 · 09:00 ~ 17:00 · 2명</p>
      <div className="shot-qr">
        <QrPattern />
      </div>
      <p className="shot-cap">현장에 붙이세요</p>
      <div className="shot-status">
        <span data-tone="ok">PTW 승인</span>
        <span>TBM 0/2</span>
      </div>
    </Shot>
  );
}

export function WorkerShot() {
  return (
    <Shot label="작업자 TBM">
      <p className="shot-eyebrow">TBM · 오늘 08:10</p>
      <p className="shot-title">2호기 금형 교체</p>
      <ul className="shot-checks">
        <li className="is-done">
          <i>
            <Check size={10} strokeWidth={3} />
          </i>
          전원 차단·잠금 확인
        </li>
        <li className="is-done">
          <i>
            <Check size={10} strokeWidth={3} />
          </i>
          안전블록 삽입
        </li>
        <li>
          <i />
          보호구 착용
        </li>
      </ul>
      <div className="shot-btn">모두 확인</div>
      <p className="shot-cap">앱 설치 없음 · 카메라로 QR</p>
    </Shot>
  );
}

export function MeetingShot() {
  return (
    <Shot label="주간 안전회의">
      <p className="shot-eyebrow">주간 안전회의</p>
      <p className="shot-title">
        이번 주 <span className="shot-now">10/5 ~ 10/11</span>
      </p>
      <ul className="shot-agenda">
        <li>
          <span className="shot-route" data-k="inspection">
            점검
          </span>
          지게차 경광등 불량
        </li>
        <li>
          <span className="shot-route" data-k="incident">
            사고
          </span>
          출하장 끼임 아차사고
        </li>
        <li>
          <span className="shot-route" data-k="assessment">
            평가
          </span>
          프레스 조치 1건 남음
        </li>
      </ul>
      <div className="shot-status">
        <span data-tone="ok">조치 완료 2</span>
        <span data-tone="danger">남은 1</span>
      </div>
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

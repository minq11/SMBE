import Image from "next/image";

/**
 * 현장 게시용 A4 한 장 출력물.
 *
 * 화면의 지시서 상세와 목적이 다르다. 상세는 법정 기록 전체를 담고, 이 출력물은
 * 작업 장소에 붙여 두고 작업자가 QR 로 들어오게 하는 게시물이다. 그래서 전체
 * 문서를 인쇄하는 대신 한 장에 들어갈 것만 골라 담는다 — 무엇을 어디서 언제
 * 하는지, 무엇이 위험한지, 무엇을 점검하는지, 그리고 QR.
 */
export function PrintSheet({
  name,
  period,
  location,
  groupLabel,
  ptw,
  assignees,
  risks,
  tbm,
  during,
  qr,
  url,
  issueVersion,
  issuedAt,
  printedAt,
}: {
  name: string;
  period: string;
  location: string;
  groupLabel?: string;
  ptw: string;
  assignees: string;
  risks: Array<{ hazard: string; level: string; measure: string }>;
  tbm: string[];
  during: string[];
  qr: string;
  url: string;
  issueVersion: number | null;
  issuedAt: string | null;
  printedAt: string;
}) {
  return (
    <article className="wo-sheet" aria-hidden="true">
      <header className="wo-sheet-head">
        <div className="wo-sheet-title">
          <p className="wo-sheet-kicker">작업지시서</p>
          <h1>{name}</h1>
          <p className="wo-sheet-meta">
            {period}
            <br />
            {location || "장소 미입력"}
            {groupLabel ? ` · ${groupLabel}` : ""} · PTW {ptw}
          </p>
        </div>
        <div className="wo-sheet-qr">
          <Image
            src={qr}
            width={132}
            height={132}
            alt="이 작업지시를 여는 QR 코드"
            unoptimized
          />
          <p>휴대폰 카메라로 스캔</p>
        </div>
      </header>

      <section className="wo-sheet-row">
        <h2>배정 인원</h2>
        <p>{assignees || "배정 없음"}</p>
      </section>

      <section className="wo-sheet-risks">
        <h2>위험요인 · 감소대책</h2>
        {risks.length ? (
          <table>
            <thead>
              <tr>
                <th>위험요인</th>
                <th>수준</th>
                <th>감소대책</th>
              </tr>
            </thead>
            <tbody>
              {risks.map((r, i) => (
                <tr key={i}>
                  <td>{r.hazard || "미입력"}</td>
                  <td className="wo-sheet-level">{r.level}</td>
                  <td>{r.measure || "미입력"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>등록된 위험요인이 없습니다.</p>
        )}
      </section>

      <section className="wo-sheet-checks">
        <div>
          <h2>TBM · 작업 전</h2>
          <ol>
            {tbm.length ? (
              tbm.map((text, i) => <li key={i}>{text}</li>)
            ) : (
              <li>항목 없음</li>
            )}
          </ol>
        </div>
        <div>
          <h2>작업 중</h2>
          <ol>
            {during.length ? (
              during.map((text, i) => <li key={i}>{text}</li>)
            ) : (
              <li>항목 없음</li>
            )}
          </ol>
        </div>
      </section>

      <footer className="wo-sheet-foot">
        <span>
          발행 버전 {issueVersion ?? "-"}
          {issuedAt ? ` · 발급 ${issuedAt}` : ""} · 출력 {printedAt}
        </span>
        <span className="wo-sheet-url">{url}</span>
      </footer>
      <p className="wo-sheet-note">
        출력 이후 지시서가 바뀔 수 있습니다. 작업 전에는 QR 로 최신 내용을
        확인하세요.
      </p>
    </article>
  );
}

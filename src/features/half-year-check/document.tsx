import { CircleCheck, Circle } from "lucide-react";
import {
  periodLabel,
  SUPERVISOR_RATINGS,
  type HalfYearCheck,
  type HalfYearFacts,
  type HalfYearNotes,
} from "./model";

const n = (v: number) => v.toLocaleString("ko-KR");

/** 2호: 숫자 띠. 작성 폼과 문서가 같은 것을 보여 준다. */
export function HazardFacts({ f }: { f: HalfYearFacts["hazard"] }) {
  return (
    <dl className="hyc-facts">
      <div>
        <dt>이 반기 위험성평가</dt>
        <dd>{n(f.assessments)}건</dd>
      </div>
      <div>
        <dt>조치 완료</dt>
        <dd>{n(f.actions_done)}건</dd>
      </div>
      <div className={f.actions_open > 0 ? "is-alert" : ""}>
        <dt>남은 조치</dt>
        <dd>{n(f.actions_open)}건</dd>
      </div>
      <div className={f.standards_expired > 0 ? "is-alert" : ""}>
        <dt>위험성평가 필요 표준서</dt>
        <dd>{n(f.standards_expired)}건</dd>
      </div>
      <div className={f.pending > 0 ? "is-alert" : ""}>
        <dt>승인 대기</dt>
        <dd>{n(f.pending)}건</dd>
      </div>
      <div className={f.findings_open > 0 ? "is-alert" : ""}>
        <dt>미조치 불량</dt>
        <dd>{n(f.findings_open)}건</dd>
      </div>
      <div>
        <dt>이 반기 조치한 불량</dt>
        <dd>{n(f.findings_resolved)}건</dd>
      </div>
    </dl>
  );
}

export function OpinionFacts({ f }: { f: HalfYearFacts["opinions"] }) {
  return (
    <>
      <dl className="hyc-facts">
        <div>
          <dt>아차사고 신고</dt>
          <dd>{n(f.near_misses)}건</dd>
        </div>
        <div>
          <dt>작업자가 직접 신고</dt>
          <dd>{n(f.worker_reports)}건</dd>
        </div>
        <div>
          <dt>위험성평가 참여 근로자</dt>
          <dd>{n(f.participants)}명</dd>
        </div>
        <div>
          <dt>주간 안전점검 회의</dt>
          <dd>{n(f.meetings)}회</dd>
        </div>
      </dl>
      {f.quotes.length > 0 && (
        <ul className="hyc-quotes" aria-label="위험성평가에 적힌 근로자 의견">
          {f.quotes.map((q, i) => (
            <li key={i}>
              <span>{q.date}</span> {q.text}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function ManualFacts({ f }: { f: HalfYearFacts["manual"] }) {
  return (
    <dl className="hyc-facts">
      <div>
        <dt>대응 절차 문서</dt>
        <dd>{n(f.length)}자</dd>
      </div>
      <div className={f.has_contact ? "" : "is-alert"}>
        <dt>비상연락처</dt>
        <dd>{f.has_contact ? "적혀 있음" : "없음"}</dd>
      </div>
    </dl>
  );
}

export function LegalFacts({
  f,
  year,
}: {
  f: HalfYearFacts["legal"];
  year: number;
}) {
  return (
    <>
      <dl className="hyc-facts">
        <div className={f.policy_exists ? "" : "is-alert"}>
          <dt>{year}년 방침·목표</dt>
          <dd>{f.policy_exists ? "작성함" : "없음"}</dd>
        </div>
        <div className={f.budget ? "" : "is-alert"}>
          <dt>안전보건 예산</dt>
          <dd>
            {f.budget
              ? `편성 ${n(f.budget.planned)} · 집행 ${n(f.budget.spent)} 만원${
                  f.budget.rate !== null ? ` (${f.budget.rate}%)` : ""
                }`
              : "편성 없음"}
          </dd>
        </div>
      </dl>
      <p className="hyc-duties">
        <strong>법정 선임·직책</strong>{" "}
        {f.duties.length
          ? f.duties.map((d) => `${d.name} — ${d.note}`).join(" · ")
          : "인원 비고에 적힌 것이 없습니다."}
      </p>
    </>
  );
}

export function SupervisorTable({
  rows,
  notes,
}: {
  rows: HalfYearFacts["supervisors"];
  notes: HalfYearNotes["supervisors"];
}) {
  if (!rows.length)
    return <p className="wo-muted">관리감독자·안전관리자가 없습니다.</p>;
  return (
    <table className="hyc-table">
      <thead>
        <tr>
          <th scope="col">이름</th>
          <th scope="col">지시서 발급</th>
          <th scope="col">TBM 확인</th>
          <th scope="col">작업 중 점검</th>
          <th scope="col">불량 조치</th>
          <th scope="col">평가</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((s) => {
          const note = notes[s.user_id];
          return (
            <tr key={s.user_id}>
              <th scope="row">{s.name}</th>
              <td>{n(s.orders_issued)}</td>
              <td>{n(s.tbm_confirmed)}</td>
              <td>{n(s.inspections)}</td>
              <td>{n(s.findings_resolved)}</td>
              <td>
                {note?.rating ? SUPERVISOR_RATINGS[note.rating] : "—"}
                {note?.note ? <small> {note.note}</small> : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Note({ text }: { text: string }) {
  return text ? <p className="policy-text hyc-note">{text}</p> : null;
}

export function HalfYearDocument({
  check,
  companyName,
}: {
  check: HalfYearCheck;
  companyName: string;
}) {
  const { facts, notes } = check;
  return (
    <article className="policy-document hyc-document">
      <header>
        <p>{periodLabel(check.year, check.half)}</p>
        <h2>경영책임자 반기 점검</h2>
        <strong>{companyName}</strong>
        <p className="hyc-period">
          {facts.period.from} ~ {facts.period.to} ·{" "}
          {check.status === "CONFIRMED" ? "확정" : "작성 중"}
        </p>
      </header>
      <section>
        <h3>1. 유해·위험요인 확인·개선 (시행령 4조 2호)</h3>
        <HazardFacts f={facts.hazard} />
        <Note text={notes.hazard} />
      </section>
      <section>
        <h3>2. 관리감독자 업무 수행 (4호)</h3>
        <SupervisorTable rows={facts.supervisors} notes={notes.supervisors} />
      </section>
      <section>
        <h3>3. 종사자 의견 청취 (7호)</h3>
        <OpinionFacts f={facts.opinions} />
        <Note text={notes.opinions} />
      </section>
      <section>
        <h3>4. 중대재해 대응 절차 점검 (8호)</h3>
        <ManualFacts f={facts.manual} />
        <p className="hyc-check">
          {notes.manual_checked ? (
            <CircleCheck size={16} />
          ) : (
            <Circle size={16} />
          )}{" "}
          {notes.manual_checked ? "절차와 연락처를 점검함" : "점검 전"}
        </p>
        <Note text={notes.manual} />
      </section>
      <section>
        <h3>5. 법령 이행 — 방침·예산·선임 (5조)</h3>
        <LegalFacts f={facts.legal} year={check.year} />
        <Note text={notes.legal} />
      </section>
      <footer>
        {check.status === "CONFIRMED" ? (
          <>
            <p>확인일 {check.confirmedOn}</p>
            <p>
              대표자 {check.representative}{" "}
              <span className="policy-sign">(서명 또는 인)</span>
            </p>
          </>
        ) : (
          <p>아직 확정하지 않았습니다.</p>
        )}
      </footer>
    </article>
  );
}

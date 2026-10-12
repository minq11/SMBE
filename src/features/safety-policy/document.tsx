import { budgetTotals, type SafetyPolicy } from "./model";

export function PolicyDocument({
  policy,
  companyName,
}: {
  policy: SafetyPolicy;
  companyName: string;
}) {
  const totals = budgetTotals(policy.budget);
  return (
    <article className="policy-document">
      <header>
        <p>{policy.year}년</p>
        <h2>안전보건 방침·목표</h2>
        <strong>{companyName}</strong>
      </header>
      <section>
        <h3>안전보건 방침</h3>
        <p className="policy-text">{policy.policy}</p>
      </section>
      <section>
        <h3>{policy.year}년 안전보건 목표</h3>
        <p className="policy-text">{policy.goals}</p>
      </section>
      {policy.budget.items.length > 0 && (
        <section>
          <h3>{policy.year}년 안전보건 예산</h3>
          <table className="policy-budget-table">
            <thead>
              <tr>
                <th scope="col">항목</th>
                <th scope="col">편성 (만원)</th>
              </tr>
            </thead>
            <tbody>
              {policy.budget.items.map((item, i) => (
                <tr key={i}>
                  <td>{item.name}</td>
                  <td>{item.planned.toLocaleString("ko-KR")}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">합계</th>
                <td>{totals.planned.toLocaleString("ko-KR")}</td>
              </tr>
            </tfoot>
          </table>
          {policy.budget.spent.length > 0 && (
            <>
              <h4>집행</h4>
              <ul className="policy-budget-spent">
                {policy.budget.spent.map((q) => (
                  <li key={q.quarter}>
                    <span>{q.quarter}분기</span>
                    <strong>{q.amount.toLocaleString("ko-KR")} 만원</strong>
                    {q.note && <span>{q.note}</span>}
                  </li>
                ))}
              </ul>
              <p className="policy-budget-rate">
                집행 {totals.spent.toLocaleString("ko-KR")} 만원
                {totals.rate !== null && ` · 편성 대비 ${totals.rate}%`}
              </p>
            </>
          )}
        </section>
      )}
      <footer>
        <p>작성일 {policy.establishedOn}</p>
        <p>
          대표자 {policy.representative}{" "}
          <span className="policy-sign">(서명 또는 인)</span>
        </p>
      </footer>
    </article>
  );
}

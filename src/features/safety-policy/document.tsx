import type { SafetyPolicy } from "./model";

export function PolicyDocument({
  policy,
  companyName,
}: {
  policy: SafetyPolicy;
  companyName: string;
}) {
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

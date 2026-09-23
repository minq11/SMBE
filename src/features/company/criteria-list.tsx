import { LEVEL_LABEL } from "@/features/assessments/model";
import { ACCEPTANCE_LABEL, type RiskCriteria } from "./risk-criteria";

/**
 * 판단 기준 세 행을 읽기 전용으로. 회사 기준이든 평가에 복사된 사본이든 같은
 * 모양이라 같은 것을 쓴다 — 물음표 창, 평가·표준서·지시서 상세, 작업자 화면.
 */
export function CriteriaList({ criteria }: { criteria: RiskCriteria }) {
  return (
    <dl className="criteria-list">
      {criteria.map((c) => (
        <div key={c.level} className="criteria-row">
          <dt>
            <span
              className={`criteria-level criteria-level--${c.level.toLowerCase()}`}
            >
              {LEVEL_LABEL[c.level]}
            </span>
          </dt>
          <dd>
            <p>{c.description}</p>
            <span
              className={`criteria-accept criteria-accept--${c.acceptance.toLowerCase()}`}
            >
              {ACCEPTANCE_LABEL[c.acceptance]}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

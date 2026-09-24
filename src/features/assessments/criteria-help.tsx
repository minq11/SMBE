import Link from "next/link";
import { CriteriaList } from "@/features/company/criteria-list";
import type { RiskCriteria } from "@/features/company/risk-criteria";

/** 위험성 수준 옆 물음표의 답: 회사가 정한 판단 기준 그대로. */
export function CriteriaHelp({
  criteria,
  snapshot = false,
}: {
  criteria: RiskCriteria;
  /** 평가에 복사돼 박제된 기준을 보여 줄 때. 사본은 못 고치니 고치라고 하지 않는다. */
  snapshot?: boolean;
}) {
  return (
    <>
      <p>회사가 정한 기준입니다. 상·중·하는 이 기준으로 고릅니다.</p>
      <CriteriaList criteria={criteria} />
      {snapshot ? (
        <p>
          이 위험성평가를 만들 때의 기준입니다. 회사 기준을 나중에 바꿔도 이 위험성평가는
          그대로입니다.
        </p>
      ) : (
        <p>
          바꾸려면{" "}
          <Link href="/company/criteria">회사정보 &gt; 위험성 판단 기준</Link>
          에서 고치세요. 이미 승인된 위험성평가는 그대로입니다.
        </p>
      )}
    </>
  );
}

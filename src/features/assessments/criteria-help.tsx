import Link from "next/link";

/** 위험성 수준 옆 물음표의 답: 회사가 정한 판단 기준 그대로. */
export function CriteriaHelp({ criteria }: { criteria: string }) {
  return (
    <>
      <p>회사가 정한 기준입니다. 상·중·하는 이 기준으로 고릅니다.</p>
      <pre className="criteria-readonly">{criteria}</pre>
      <p>
        바꾸려면{" "}
        <Link href="/company/criteria">회사정보 &gt; 위험성 판단 기준</Link>
        에서 고치세요. 이미 승인된 평가는 그대로입니다.
      </p>
    </>
  );
}

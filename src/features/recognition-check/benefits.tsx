import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

/**
 * 위험성평가 인정을 받으면 생기는 것. 로그인 전 홈(법 대응 밑)·홈 FAQ·진단 결과에 같은
 * 글이 나간다 — 한 곳에서 고친다. 본문은 파는 글, 조건·출처는 맨 아래 한 줄(헌법 6장).
 * 숫자(클린사업장 한도·추가 지원)는 공단 공고를 따르고 해마다 바뀌므로 연도를 같이 적는다.
 */
export const RECOGNITION_BENEFITS = [
  "클린사업장 조성지원에서 1,000만원을 더 받을 수 있는 우대 대상이 됩니다 (기본 최대 3,000만원 + 1,000만원).",
  "3년간 정기 감독 유예, 산재보험료 20% 인하.",
  "심플안전의 인정 준비도 점수는 공단 심사기준(2024.12.18 개정)의 항목·배점 그대로 계산합니다.",
] as const;

export const RECOGNITION_SOURCE =
  "안전보건공단 클린사업장 조성지원(2026) · 산재보험 가입 50인 미만 · 공단 심사 선정 · 예산 범위 내 · 위험성평가 우수사업장 인정제도";

export function RecognitionBenefits({
  cta = true,
  className = "",
}: {
  /** 진단 화면 자신에서는 진단으로 가는 단추를 뺀다. */
  cta?: boolean;
  className?: string;
}) {
  return (
    <aside
      className={`benefit-card${className ? " " + className : ""}`}
      aria-labelledby="benefit-title"
    >
      <h3 id="benefit-title">위험성평가 인정을 받으면</h3>
      <ul className="benefit-list" role="list">
        {RECOGNITION_BENEFITS.map((b) => (
          <li key={b}>
            <Check size={16} aria-hidden="true" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
      {cta && (
        <Link href="/recognition-check" className="btn-primary">
          우리회사 인정 준비도 진단 <ArrowRight size={15} />
        </Link>
      )}
      <p className="benefit-source">{RECOGNITION_SOURCE}</p>
    </aside>
  );
}

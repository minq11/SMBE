import Link from "next/link";
import { ArrowRight, ClipboardCheck } from "lucide-react";
import { periodLabel, type Half } from "@/features/half-year-check/model";

/**
 * 경영책임자 반기 점검으로 가는 카드. 점검 자체는 기준정보의 반기 점검 화면이
 * 한다 (2·4·7·8호와 5조를 한 장에). 여기서는 지금 챙길 반기가 있는지만 말한다.
 */
export function HalfYearCheckCard({
  due,
}: {
  due: {
    year: number;
    half: Half;
    status: "NONE" | "DRAFT" | "CONFIRMED";
  } | null;
}) {
  const open = due && due.status !== "CONFIRMED";
  return (
    <section
      className={`asmt-review${open ? "" : " is-done"}`}
      aria-label="경영책임자 반기 점검"
    >
      <div className="asmt-review-head">
        <h2>
          <ClipboardCheck size={16} style={{ verticalAlign: "-3px" }} />{" "}
          경영책임자 반기 점검
        </h2>
        {due ? (
          <span
            className={`asmt-tag ${open ? "asmt-tag--action" : "asmt-tag--ok"}`}
          >
            {periodLabel(due.year, due.half)} ·{" "}
            {due.status === "CONFIRMED"
              ? "확정 완료"
              : due.status === "DRAFT"
                ? "작성 중"
                : "아직 점검 전"}
          </span>
        ) : (
          <span className="asmt-tag">다음 점검은 6월·12월</span>
        )}
      </div>
      <p className="asmt-review-lead">
        반기마다 위험요인 개선·관리감독자 업무·종사자 의견·대응 절차·법령 이행을
        우리 기록으로 미리 채운 한 장을 대표자가 확인하고 확정합니다.
      </p>
      <div className="asmt-review-actions">
        <Link
          className="go-link"
          href={
            due
              ? `/company/half-year-check?year=${due.year}&half=${due.half}`
              : "/company/half-year-check"
          }
        >
          반기 점검 열기 <ArrowRight size={14} />
        </Link>
      </div>
    </section>
  );
}

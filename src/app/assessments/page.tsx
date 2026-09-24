import Link from "next/link";
import { CircleAlert, Plus } from "lucide-react";
import { withTransaction } from "@/server/db";
import { workSession } from "@/server/work-orders";
import {
  assessmentOverview,
  listAssessments,
  readHalfYearReview,
} from "@/server/assessments";
import { HalfYearReviewCard } from "@/features/assessments/half-year-review";
import { AppShell } from "@/components/shell/app-shell";
import { tierOf } from "@/components/shell/tier";
import { isCurrentUserOperator } from "@/server/operator";
import { PageHeader } from "@/components/ui/page-header";
import { AssessmentsListView } from "@/features/assessments/list-view";
import { shortDate } from "@/features/assessments/model";
import "@/features/assessments/assessments.css";

export const metadata = { title: "위험성평가 · 심플안전" };

/**
 * 위험성평가 메뉴. 맨 위는 지금 봐야 할 숫자 셋, 그 아래 "평가가 필요한 표준서",
 * 그 아래 평가 목록. 감독·심사에서 "위험성평가 보여 주세요" 에 이 화면 하나로 답한다.
 */
export default async function AssessmentsPage() {
  const { session, actor } = await workSession("/assessments", true);
  const [overview, items, review, isOperator] = await Promise.all([
    withTransaction((c) => assessmentOverview(c, actor)),
    withTransaction((c) => listAssessments(c, actor)),
    withTransaction((c) => readHalfYearReview(c, actor)),
    isCurrentUserOperator(),
  ]);
  const year = new Date().getFullYear();

  return (
    <AppShell
      active="assessment"
      breadcrumb={[{ label: "위험성평가" }]}
      companyName={session.membership?.company_name}
      tier={tierOf(session.membership)}
      userName={session.user.displayName ?? undefined}
      isAuthenticated
      isOperator={isOperator}
    >
      <PageHeader
        title="위험성평가"
        description="표준서 위험성평가와 지시서 간이 위험성평가를 한 곳에서. 조치 이행까지 여기서 적습니다."
        actions={
          <Link href="/assessments/new" className="btn-primary">
            <Plus size={15} /> 위험성평가 작성
          </Link>
        }
      />

      <div className="asmt-tiles" aria-label="현황">
        <div className="asmt-tile">
          <strong>{overview.this_year_count}건</strong>
          <small>{year}년 정기·최초 위험성평가</small>
        </div>
        <div
          className={`asmt-tile${overview.open_action_count > 0 ? " is-alert" : ""}`}
        >
          <strong>{overview.open_action_count}건</strong>
          <small>조치 남은 위험요인</small>
        </div>
        <div
          className={`asmt-tile${overview.needs_assessment.length > 0 ? " is-alert" : ""}`}
        >
          <strong>{overview.needs_assessment.length}건</strong>
          <small>위험성평가 필요 표준서</small>
        </div>
      </div>

      <HalfYearReviewCard review={review} />

      {(overview.needs_assessment.length > 0 ||
        overview.expiring_soon.length > 0) && (
        <section className="asmt-section" aria-label="위험성평가가 필요한 표준서">
          <h2>
            <CircleAlert size={15} style={{ verticalAlign: "-2px" }} /> 위험성평가가
            필요한 표준서
          </h2>
          <ul className="asmt-needs">
            {overview.needs_assessment.map((s) => (
              <li key={s.standard_id} className="asmt-need">
                <span className="asmt-need-main">
                  <strong>{s.name}</strong>
                  <small>
                    {s.valid_until
                      ? `위험성평가 만료 ${shortDate(s.valid_until)}`
                      : "승인된 위험성평가 없음"}{" "}
                    · 지시서에 쓸 수 없음
                  </small>
                </span>
                <Link
                  href={`/standards/${s.standard_id}/assessments/new`}
                  className="btn-primary"
                >
                  위험성평가하기
                </Link>
              </li>
            ))}
            {overview.expiring_soon.map((s) => (
              <li key={s.standard_id} className="asmt-need">
                <span className="asmt-need-main">
                  <strong>{s.name}</strong>
                  <small>{shortDate(s.valid_until)} 만료 예정</small>
                </span>
                <Link
                  href={`/standards/${s.standard_id}/assessments/new`}
                  className="btn-secondary"
                >
                  미리 위험성평가
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <AssessmentsListView items={items} />
    </AppShell>
  );
}

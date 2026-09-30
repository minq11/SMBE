import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { withTransaction } from "@/server/db";
import { workSession } from "@/server/work-orders";
import { readAssessment } from "@/server/assessments";
import { AppShell } from "@/components/shell/app-shell";
import { tierOf } from "@/components/shell/tier";
import { isCurrentUserOperator } from "@/server/operator";
import { WorkOrderError } from "@/features/work-orders/model";
import { ASSESSMENT_KIND_LABEL } from "@/features/standards/constants";
import { AssessmentItems } from "@/features/assessments/detail-view";
import { STATUS_LABEL, koDate } from "@/features/assessments/model";
import { Facts } from "@/components/ui/facts";
import "@/features/work-orders/work-orders.css";
import "@/features/assessments/assessments.css";
import { CriteriaList } from "@/features/company/criteria-list";

export const metadata = { title: "위험성평가 · 심플안전" };

export default async function AssessmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { session, actor } = await workSession(`/assessments/${id}`, true);
  const [detail, isOperator] = await Promise.all([
    withTransaction((c) => readAssessment(c, actor, id)).catch((error) => {
      if (error instanceof WorkOrderError) return null;
      throw error;
    }),
    isCurrentUserOperator(),
  ]);
  if (!detail) notFound();

  return (
    <AppShell
      active="assessment"
      // 상단바는 "위험성평가" 로 남고 제목은 본문 위에 (자료실 글과 같은 규칙).
      breadcrumb={[
        { label: "위험성평가", href: "/assessments" },
        { label: "위험성평가" },
      ]}
      companyName={session.membership?.company_name}
      tier={tierOf(session.membership)}
      userName={session.user.displayName ?? undefined}
      isAuthenticated
      isOperator={isOperator}
    >
      <div className="asmt-head">
        <h1>{detail.name}</h1>
        <p className="asmt-head-meta">
          <span>{ASSESSMENT_KIND_LABEL[detail.kind]}</span>
          <span>실시 {koDate(detail.performed_on)}</span>
          <span>{STATUS_LABEL[detail.status]}</span>
          {detail.status === "APPROVED" && (
            <span>
              {detail.expired
                ? "만료"
                : detail.valid_until
                  ? `유효 ~${koDate(detail.valid_until)}`
                  : "상시"}
            </span>
          )}
          <span>작성 {detail.created_by_name}</span>
          {detail.approved_by_name && (
            <span>승인 {detail.approved_by_name}</span>
          )}
        </p>
        {/* 이 평가가 어디서 왔는지 — 이름표 있는 줄(헌법 5장). 표준서 평가는 표준서만,
            간이평가는 지시서만. 둘 다 붙는 것은 옛 방식(표준서 평가를 복사한 지시서)뿐. */}
        {(detail.standard_id || detail.work_order_id) && (
          <Facts
            className="wo-facts--tight asmt-origin"
            rows={[
              Boolean(detail.standard_id) && [
                "표준서",
                <span key="s" className="asmt-origin-cell">
                  <Link href={`/standards/${detail.standard_id}`}>
                    {detail.standard_name}
                  </Link>
                  {detail.standard_revision_no ? (
                    <small>{detail.standard_revision_no}회차 개정본</small>
                  ) : null}
                </span>,
              ],
              Boolean(detail.work_order_id) && [
                "지시서",
                <span key="w" className="asmt-origin-cell">
                  <Link href={`/work-orders/${detail.work_order_id}`}>
                    {detail.work_order_name}
                  </Link>
                  <small>
                    {detail.is_simple
                      ? "이 지시서를 발급할 때 만든 간이평가"
                      : "이 지시서를 발급할 때 표준서 평가를 복사한 것"}
                  </small>
                </span>,
              ],
            ]}
          />
        )}
        <div className="asmt-head-links">
          {detail.standard_id && detail.status === "APPROVED" && (
            <Link
              href={`/standards/${detail.standard_id}/assessments/new`}
              className="btn-primary"
            >
              새 회차 위험성평가
            </Link>
          )}
        </div>
      </div>

      <section className="asmt-section" aria-label="위험요인과 대책">
        <h2>
          위험요인 · 대책{" "}
          {detail.open_action_count > 0 &&
            `· 조치 ${detail.open_action_count}건 남음`}
        </h2>
        <AssessmentItems detail={detail} canRecord />
      </section>

      <section className="asmt-section" aria-label="사전조사 안전보건정보">
        <h2>사전조사한 안전보건정보</h2>
        <dl className="asmt-info">
          <div>
            <dt>작업방법</dt>
            <dd>{detail.work_method || "—"}</dd>
          </div>
          <div>
            <dt>기계·기구·설비</dt>
            <dd>{detail.safety_info.equipment || "—"}</dd>
          </div>
          <div>
            <dt>취급 유해물질</dt>
            <dd>{detail.safety_info.materials || "—"}</dd>
          </div>
          <div>
            <dt>공정·주변 환경</dt>
            <dd>{detail.safety_info.environment || "—"}</dd>
          </div>
          <div>
            <dt>재해·아차사고 이력</dt>
            <dd>{detail.safety_info.history || "—"}</dd>
          </div>
          <div>
            <dt>근로자 의견</dt>
            <dd>{detail.worker_opinion || "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="asmt-section" aria-label="판단 기준과 참여자">
        <h2>적용한 판단 기준</h2>
        <CriteriaList criteria={detail.criteria} />
        <h2>참여 근로자</h2>
        <p className="asmt-note">
          {detail.participants.length ? detail.participants.join(", ") : "—"}
        </p>
      </section>

      {/* 기록(헌법 4장): 같은 표준서의 회차 이력. 이 문서가 몇 번째이고 지금 쓰는
          것이 무엇인지 — 내용이 아니라 지나간 목록이라 종이색 점선 카드다. */}
      {detail.rounds.length > 0 && (
        <div className="zone asmt-zone">
          <div
            className="std-form-divider std-form-divider--log"
            aria-hidden="true"
          >
            <span>기록</span>
          </div>
          <section
            className="std-detail-section std-detail-section--log"
            aria-label="회차 이력"
          >
            <h2>이 표준서의 위험성평가 회차 이력 ({detail.rounds.length}건)</h2>
            <ul className="std-assessment-history" role="list">
              {detail.rounds.map((r) => {
                const here = r.id === detail.id;
                return (
                  <li
                    key={r.id}
                    className={`std-assessment-row${r.is_current ? " is-current" : ""}${
                      r.expired ? " is-expired" : ""
                    }`}
                    aria-current={here ? "page" : undefined}
                  >
                    <span className="std-assessment-kind">
                      {here ? (
                        ASSESSMENT_KIND_LABEL[r.kind]
                      ) : (
                        <Link href={`/assessments/${r.id}`}>
                          {ASSESSMENT_KIND_LABEL[r.kind]}
                        </Link>
                      )}
                    </span>
                    <span className="std-assessment-date">
                      실시일 {koDate(r.performed_on)}
                    </span>
                    {r.valid_until && (
                      <span className="std-assessment-valid">
                        유효 ~ {koDate(r.valid_until)}
                      </span>
                    )}
                    <span
                      className={`std-assessment-status std-assessment-status--${r.status.toLowerCase()}`}
                    >
                      {STATUS_LABEL[r.status]}
                    </span>
                    {r.is_current && (
                      <span className="std-assessment-badge std-assessment-badge--current">
                        현재 사용 중
                      </span>
                    )}
                    {r.expired && (
                      <span className="std-assessment-badge std-assessment-badge--expired">
                        만료
                      </span>
                    )}
                    {here && (
                      <span className="std-assessment-badge std-assessment-badge--here">
                        지금 보는 것
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      )}
    </AppShell>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ArrowRight } from "lucide-react";
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
        <div className="asmt-head-links">
          {detail.standard_id && (
            <Link
              href={`/standards/${detail.standard_id}`}
              className="btn-secondary"
            >
              표준서 {detail.standard_name} <ArrowRight size={13} />
            </Link>
          )}
          {detail.work_order_id && (
            <Link
              href={`/work-orders/${detail.work_order_id}`}
              className="btn-secondary"
            >
              지시서 {detail.work_order_name} <ArrowRight size={13} />
            </Link>
          )}
          {detail.standard_id && detail.status === "APPROVED" && (
            <Link
              href={`/standards/${detail.standard_id}/assessments/new`}
              className="btn-primary"
            >
              새 회차 평가
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
    </AppShell>
  );
}

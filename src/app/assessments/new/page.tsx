import Link from "next/link";
import { ArrowRight, ClipboardList, FileText } from "lucide-react";
import { workSession } from "@/server/work-orders";
import { standardsForNewAssessment } from "@/server/assessments";
import { AppShell } from "@/components/shell/app-shell";
import { tierOf } from "@/components/shell/tier";
import { isCurrentUserOperator } from "@/server/operator";
import { PageHeader } from "@/components/ui/page-header";
import { shortDate } from "@/features/assessments/model";
import "@/features/assessments/assessments.css";

export const metadata = { title: "위험성평가 작성 · 심플안전" };

/**
 * 평가는 표준서에 붙는다. 그래서 "평가 작성" 은 표준서를 고르는 일이다.
 * 표준서 없는 작업은 지시서 안에서 간이평가로 쓴다 — 여기서 그 길도 보여 준다.
 */
export default async function NewAssessmentPickPage() {
  const { session, actor } = await workSession("/assessments/new", true);
  const [standards, isOperator] = await Promise.all([
    standardsForNewAssessment(actor.companyId),
    isCurrentUserOperator(),
  ]);

  return (
    <AppShell
      active="assessment"
      breadcrumb={[
        { label: "위험성평가", href: "/assessments" },
        { label: "위험성평가 작성" },
      ]}
      companyName={session.membership?.company_name}
      tier={tierOf(session.membership)}
      userName={session.user.displayName ?? undefined}
      isAuthenticated
      isOperator={isOperator}
    >
      <PageHeader
        title="위험성평가 작성"
        description="어느 작업(표준서)의 위험성평가인지 고르세요."
      />
      {standards.length === 0 ? (
        <div className="panel">
          <div className="empty-state">
            <span className="empty-state-icon">
              <FileText size={22} />
            </span>
            <strong>표준서가 아직 없어요</strong>
            <p>표준서를 만들면 최초 위험성평가가 같이 등록됩니다.</p>
            <Link href="/standards/new" className="btn-primary">
              표준서 만들기
            </Link>
          </div>
        </div>
      ) : (
        <ul className="asmt-pick" role="list">
          {standards.map((s) => (
            <li key={s.standard_id} className="asmt-need">
              <span className="asmt-need-main">
                <strong>{s.name}</strong>
                <small>
                  {s.last_performed_on
                    ? `최근 위험성평가 ${shortDate(s.last_performed_on)}${s.expired ? " · 만료" : s.valid_until ? ` · 유효 ~${shortDate(s.valid_until)}` : ""}`
                    : "승인된 위험성평가 없음"}
                </small>
              </span>
              <Link
                href={`/standards/${s.standard_id}/assessments/new`}
                className={s.expired ? "btn-primary" : "btn-secondary"}
              >
                위험성평가 <ArrowRight size={13} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <section className="asmt-section">
        <h2>표준서가 없는 작업</h2>
        <Link
          href="/work-orders/new"
          className="asmt-need"
          style={{ textDecoration: "none", color: "inherit" }}
        >
          <span className="asmt-need-main">
            <strong>
              <ClipboardList size={15} style={{ verticalAlign: "-2px" }} />{" "}
              지시서에서 간이 위험성평가로 작성
            </strong>
            <small>
              작업 정보를 넣고 2단계에서 위험요인·대책을 적으면 위험성평가가 함께
              기록됩니다.
            </small>
          </span>
          <ArrowRight size={14} />
        </Link>
      </section>
    </AppShell>
  );
}

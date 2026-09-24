import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { tierOf } from "@/components/shell/tier";
import { AppShell } from "@/components/shell/app-shell";
import { getCurrentSession } from "@/server/session";
import { isCurrentUserOperator } from "@/server/operator";
import { getRevisionContent } from "@/server/standards-service";
import { listAttachments } from "@/server/attachments";
import { AttachmentList } from "@/features/attachments/attachment-list";

export const metadata = { title: "표준서 개정본 · 심플안전" };

const STATUS: Record<string, string> = {
  DRAFT: "작성 중",
  APPROVED: "현재 판",
  SUPERSEDED: "지난 판",
};

/**
 * 옛 판 읽기. 그날 발급된 지시서·그때의 평가가 가리키는 표준서가 이것이다.
 * 고칠 수 없다 — 고치려면 상세에서 개정을 시작한다.
 */
export default async function RevisionPage({
  params,
}: {
  params: Promise<{ id: string; no: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (!session.membership || session.membership.status !== "ACTIVE")
    redirect("/onboarding");
  if (session.membership.role === "WORKER") redirect("/");
  const { id, no } = await params;
  const revisionNo = Number(no);
  if (!Number.isInteger(revisionNo) || revisionNo < 1) notFound();
  const [rev, isOperator] = await Promise.all([
    getRevisionContent(session.membership.company_id, id, { revisionNo }),
    isCurrentUserOperator(),
  ]);
  if (!rev) notFound();
  const when = rev.approved_at ?? rev.created_at;
  // 그때의 사진도 그 판의 것이다. 읽기만 — 고치려면 개정.
  const actor = {
    companyId: session.membership.company_id,
    userId: session.user.id,
  };
  const photos: Record<string, Awaited<ReturnType<typeof listAttachments>>> =
    {};
  for (const s of rev.steps)
    photos[s.id] = await listAttachments(actor, "standard_step", s.id);

  return (
    <AppShell
      active="standards"
      breadcrumb={[
        { label: "작업표준서", href: "/standards" },
        { label: rev.name, href: `/standards/${id}` },
        { label: `${rev.revision_no}판` },
      ]}
      companyName={session.membership.company_name}
      tier={tierOf(session.membership)}
      userName={session.user.displayName ?? undefined}
      isAuthenticated
      isOperator={isOperator}
    >
      <Link href={`/standards/${id}`} className="text-button std-back-link">
        <ArrowLeft size={13} /> 표준서 상세
      </Link>
      <header className="std-detail-hero">
        <div>
          <span className="std-detail-tag">
            {rev.revision_no}판 · {STATUS[rev.status] ?? rev.status}
            {rev.ptw_required ? " · PTW 필요" : ""}
          </span>
          <h1>{rev.name}</h1>
          <p className="std-detail-meta">
            {rev.status === "DRAFT" ? "작성" : "승인"}{" "}
            {new Date(when).toLocaleDateString("ko-KR")} ·{" "}
            {rev.approved_by_name ?? rev.created_by_name}
            {rev.change_note ? ` · ${rev.change_note}` : ""}
          </p>
        </div>
      </header>
      <section className="std-detail-section">
        <h2>작업 단계</h2>
        <ol className="std-detail-list std-detail-list--with-attach">
          {rev.steps.map((s) => (
            <li key={s.id}>
              <div className="std-detail-step-text">{s.step_text}</div>
              {(photos[s.id]?.length ?? 0) > 0 && (
                <AttachmentList
                  items={photos[s.id]}
                  canDelete={false}
                  emptyLabel=""
                  compact
                />
              )}
            </li>
          ))}
        </ol>
      </section>
      <section className="std-detail-section">
        <h2>안전/품질 체크리스트</h2>
        <div className="std-detail-checklist">
          <div>
            <span className="std-detail-sublabel">작업 전 (TBM)</span>
            <ul>
              {rev.checklist_tbm.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </div>
          <div>
            <span className="std-detail-sublabel">작업 중</span>
            <ul>
              {rev.checklist_during.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

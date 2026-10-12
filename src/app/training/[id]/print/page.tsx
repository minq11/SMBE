import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { workSession } from "@/server/work-orders";
import { withTransaction } from "@/server/db";
import { readTrainingSession } from "@/server/training";
import { fmtHours, KIND_LABEL } from "@/features/training/model";
import { PolicyPrintButton } from "@/features/safety-policy/print-button";

/** 교육일지 — 교육 정보와 참석자 서명 칸. 인쇄는 멤버십. */
export default async function TrainingPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { session, actor } = await workSession(`/training/${id}/print`, true);
  if (session.membership?.pro_state === "FREE") redirect(`/training/${id}`);
  const detail = await withTransaction((c) =>
    readTrainingSession(c, actor, id),
  );
  if (!detail) notFound();
  return (
    <div className="policy-print-page">
      <PageHeader title="교육일지 인쇄" actions={<PolicyPrintButton />} />
      <article className="policy-document">
        <header>
          <p>{KIND_LABEL[detail.kind]} 안전보건교육</p>
          <h2>교육일지</h2>
          <strong>{session.membership!.company_name}</strong>
        </header>
        <section>
          <table className="training-sign-table">
            <tbody>
              <tr>
                <th scope="row">교육일</th>
                <td>{detail.held_on}</td>
                <th scope="row">시간</th>
                <td>{fmtHours(detail.hours)}</td>
              </tr>
              <tr>
                <th scope="row">종류</th>
                <td>{KIND_LABEL[detail.kind]}</td>
                <th scope="row">강사</th>
                <td>{detail.instructor || "—"}</td>
              </tr>
              <tr>
                <th scope="row">내용</th>
                <td colSpan={3}>
                  {detail.topic}
                  {detail.note ? ` — ${detail.note}` : ""}
                </td>
              </tr>
            </tbody>
          </table>
        </section>
        <section>
          <h3>참석자 {detail.attendees.length}명</h3>
          <table className="training-sign-table">
            <thead>
              <tr>
                <th scope="col">번호</th>
                <th scope="col">이름</th>
                <th scope="col">서명</th>
              </tr>
            </thead>
            <tbody>
              {detail.attendees.map((a, i) => (
                <tr key={a.user_id}>
                  <td>{i + 1}</td>
                  <td>{a.name}</td>
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <footer>
          <p>
            교육 담당 {detail.created_by_name}{" "}
            <span className="policy-sign">(서명 또는 인)</span>
          </p>
        </footer>
      </article>
    </div>
  );
}

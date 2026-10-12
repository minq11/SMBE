import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Facts } from "@/components/ui/facts";
import { workSession } from "@/server/work-orders";
import { withTransaction } from "@/server/db";
import { readTrainingSession } from "@/server/training";
import { fmtHours, KIND_LABEL } from "@/features/training/model";
import { DeleteTrainingButton } from "@/features/training/delete-button";
import { TrainingPrintLink } from "@/features/training/print-link";

export default async function TrainingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { session, actor } = await workSession(`/training/${id}`, true);
  const detail = await withTransaction((c) =>
    readTrainingSession(c, actor, id),
  );
  if (!detail) notFound();
  return (
    <>
      <PageHeader
        title={detail.topic}
        actions={
          <div className="wo-actions">
            <DeleteTrainingButton id={detail.id} topic={detail.topic} />
            <TrainingPrintLink
              id={detail.id}
              paid={session.membership?.pro_state !== "FREE"}
            />
          </div>
        }
      />
      <section className="policy-card policy-fields" aria-label="교육 정보">
        <Facts
          rows={[
            ["교육일", detail.held_on],
            ["종류", KIND_LABEL[detail.kind]],
            ["시간", fmtHours(detail.hours)],
            ["강사", detail.instructor],
            ["비고", detail.note],
            [
              "등록",
              `${detail.created_by_name} · ${detail.created_at.slice(0, 10)}`,
            ],
          ]}
        />
      </section>
      <section className="policy-card policy-fields" aria-label="참석자">
        <h2>참석자 {detail.attendees.length}명</h2>
        <ul className="training-attendees">
          {detail.attendees.map((a) => (
            <li key={a.user_id}>{a.name}</li>
          ))}
        </ul>
      </section>
    </>
  );
}

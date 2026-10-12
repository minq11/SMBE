import { PageHeader } from "@/components/ui/page-header";
import { workSession, orderMembers } from "@/server/work-orders";
import { TrainingSessionForm } from "@/features/training/session-form";
import { TRAINING_KINDS, type TrainingKind } from "@/features/training/model";

export default async function NewTrainingPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const { actor } = await workSession("/training/new", true);
  const members = await orderMembers(actor);
  const { kind } = await searchParams;
  const initialKind = (TRAINING_KINDS as readonly string[]).includes(kind ?? "")
    ? (kind as TrainingKind)
    : undefined;
  return (
    <>
      <PageHeader title="교육 등록" />
      <TrainingSessionForm members={members} initialKind={initialKind} />
    </>
  );
}

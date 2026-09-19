import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { z } from "zod";
import { workSession, orderMembers, orderDetail } from "@/server/work-orders";
import { WorkOrderError, blankDraft } from "@/features/work-orders/model";
import { WorkOrderForm } from "@/features/work-orders/work-order-form";
import { OrderShell } from "@/features/work-orders/order-shell";
import { PageHeader } from "@/components/ui/page-header";
export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ copy?: string }>;
}) {
  const { session, actor } = await workSession("/work-orders/new", true);
  const { copy } = await searchParams;
  const members = await orderMembers(actor);
  let initial = blankDraft();
  if (copy) {
    if (!z.string().uuid().safeParse(copy).success) notFound();
    try {
      const { order } = await orderDetail(actor, copy);
      const active = new Set(members.map((m) => m.user_id));
      initial = {
        ...order.draft_data,
        startDate: "",
        endDate: "",
        participantIds: order.draft_data.participantIds.filter((id) =>
          active.has(id),
        ),
        assigneeIds: order.draft_data.assigneeIds.filter((id) =>
          active.has(id),
        ),
        risks: order.draft_data.risks.map((r) => ({
          ...r,
          responsibleId: active.has(r.responsibleId) ? r.responsibleId : "",
        })),
      };
    } catch (error) {
      if (error instanceof WorkOrderError) notFound();
      throw error;
    }
  }
  return (
    <OrderShell
      session={session}
      title={copy ? "작업지시 복사" : "새 작업지시"}
    >
      <PageHeader
        title={copy ? "작업지시 복사" : "새 작업지시"}
        description={
          copy
            ? "작업일과 승인·발급 정보는 초기화됩니다. 평가일·위험요인·참여자와 배정 인원을 다시 확인하세요."
            : "작업 정보부터 입력하고, 언제든 임시저장하세요."
        }
      />
      <WorkOrderForm
        id={randomUUID()}
        revision={0}
        initial={initial}
        members={members}
      />
    </OrderShell>
  );
}

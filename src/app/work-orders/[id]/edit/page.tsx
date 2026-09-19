import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { workSession, orderMembers, orderDetail } from "@/server/work-orders";
import { WorkOrderError } from "@/features/work-orders/model";
import { WorkOrderForm } from "@/features/work-orders/work-order-form";
import { OrderShell } from "@/features/work-orders/order-shell";
import { PageHeader } from "@/components/ui/page-header";
export default async function EditOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { session, actor } = await workSession(
    "/work-orders/" + id + "/edit",
    true,
  );
  const detail = await orderDetail(actor, id).catch((error) => {
    if (error instanceof WorkOrderError) notFound();
    throw error;
  });
  if (detail.order.status !== "DRAFT") redirect("/work-orders/" + id);
  return (
    <OrderShell session={session} title="작업지시 편집">
      <PageHeader
        title="작업지시 편집"
        description="저장하면 기존 평가 승인 연결이 해제되며 다시 검토·승인해야 합니다."
      />
      <WorkOrderForm
        id={id}
        revision={detail.order.revision}
        initial={detail.order.draft_data}
        members={await orderMembers(actor)}
      />
    </OrderShell>
  );
}

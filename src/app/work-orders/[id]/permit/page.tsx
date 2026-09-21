import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import {
  workSession,
  orderDetail,
  orderMembers,
  listLocationSuggestions,
} from "@/server/work-orders";
import { readPermit } from "@/server/ptw-service";
import { query, withTransaction } from "@/server/db";
import { WorkOrderError } from "@/features/work-orders/model";
import { OrderShell } from "@/features/work-orders/order-shell";
import { PermitRequestForm, PermitCommand } from "@/features/ptw/forms";
import "@/features/profile/profile.css";
import "@/features/ptw/ptw.css";
import { permitStatus, PERMIT_LABEL } from "@/features/ptw/model";
import { PageHeader } from "@/components/ui/page-header";
export default async function PermitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { session, actor } = await workSession(
    "/work-orders/" + id + "/permit",
  );
  const detail = await orderDetail(actor, id).catch((e) => {
    if (e instanceof WorkOrderError) notFound();
    throw e;
  });
  const p = await withTransaction((c) => readPermit(c, actor, id));
  const members = detail.isManager ? await orderMembers(actor) : [];
  const names = new Map(members.map((m) => [m.user_id, m.display_name]));
  const order = detail.order;
  const display = p
    ? PERMIT_LABEL[permitStatus(p.status, order.status, order.draft_data)]
    : "미신청";
  const events = p
    ? await query<{
        action: string;
        created_at: string;
        payload: Record<string, unknown>;
      }>(
        "SELECT action,created_at::text,payload FROM work_permit_events WHERE permit_id=$1 ORDER BY created_at",
        [p.id],
      )
    : [];
  return (
    <OrderShell session={session} title="위험작업허가">
      <PageHeader title="위험작업허가" />
      <Link href={"/work-orders/" + id}>{order.name} · 지시서 보기</Link>
      <p>
        {order.draft_data.startDate} ~ {order.draft_data.endDate} ·{" "}
        {order.draft_data.location}
      </p>
      <p>
        상태: {display} {p?.self_approval ? "· 자가 승인 건" : ""}
      </p>
      {p && (
        <section className="account-panel">
          <h2>허가 내용</h2>
          {detail.isManager && p.status === "PENDING" && (
            <p>
              승인 요청 이메일:{" "}
              {
                (
                  {
                    SENT: "발송 완료",
                    FAILED: "발송 실패 · 링크 직접 전달 필요",
                    SKIPPED: "주소/설정 없음 · 링크 직접 전달 필요",
                    PENDING: "전송 미확인 · 링크 직접 전달 필요",
                  } as Record<string, string>
                )[p.notification_status]
              }
            </p>
          )}
          <p>
            신청자: {names.get(p.applicant_id) || "지시서 작성자"} · 승인자:{" "}
            {names.get(p.approver_id) || "지정 관리자"}
          </p>
          <p>장소: {p.details.locationName}</p>
          <p>설비: {p.details.equipment}</p>
          <p>
            작업책임자: {names.get(p.details.responsibleId) || "지정 관리자"}
          </p>
          <p>
            화기작업:{" "}
            {p.details.hotWork
              ? "예 · 화재감시자 " +
                (names.get(p.details.fireWatcherId) || "지정 구성원")
              : "아니오"}
          </p>
          <p>특이사항: {p.details.notes || "없음"}</p>
          <h3>비상연락처</h3>
          {p.details.contacts.map((c, i) => (
            <p key={i}>
              {c.name} · {c.phone}
            </p>
          ))}
          {p.rejection_reason && <p>반려 사유: {p.rejection_reason}</p>}
        </section>
      )}
      {detail.isManager &&
        p?.status === "PENDING" &&
        order.status !== "CANCELED" && (
          <section className="account-panel">
            <h2>승인 처리</h2>
            {actor.userId === p.approver_id && (
              <>
                <PermitCommand
                  command="approve"
                  orderId={id}
                  revision={p.revision}
                />
                <PermitCommand
                  command="reject"
                  orderId={id}
                  revision={p.revision}
                />
              </>
            )}
            {actor.userId === p.applicant_id && (
              <>
                <PermitCommand
                  command="withdraw"
                  orderId={id}
                  revision={p.revision}
                />
                <PermitCommand
                  command="reassign"
                  orderId={id}
                  revision={p.revision}
                  members={members.filter(
                    (m) => m.role !== "WORKER" && m.user_id !== actor.userId,
                  )}
                />
              </>
            )}
          </section>
        )}
      {detail.isManager &&
        actor.userId === order.created_by &&
        ["DRAFT", "ISSUED", "IN_PROGRESS"].includes(order.status) &&
        (!p || ["REJECTED", "WITHDRAWN"].includes(p.status)) && (
          <section className="account-panel">
            <h2>허가 신청</h2>
            <p>
              등록된 장소가 없다면{" "}
              <Link href="/company/locations">장소관리</Link>에서 먼저
              등록하세요.
            </p>
            <PermitRequestForm
              orderId={id}
              revision={order.revision}
              userId={actor.userId}
              members={members}
              locations={await listLocationSuggestions(actor.companyId)}
            />
          </section>
        )}
      <section className="account-panel">
        <h2>처리 이력</h2>
        {events.map((e, i) => (
          <p key={i}>
            {new Date(e.created_at).toLocaleString("ko-KR", {
              timeZone: "Asia/Seoul",
            })}{" "}
            ·{" "}
            {(
              {
                REQUEST: "신청",
                APPROVE: "승인",
                REJECT: "반려",
                WITHDRAW: "철회",
                REASSIGN: "승인자 변경",
              } as Record<string, string>
            )[e.action] || e.action}
            {typeof e.payload.reason === "string"
              ? " · " + e.payload.reason
              : ""}
          </p>
        ))}
      </section>
    </OrderShell>
  );
}

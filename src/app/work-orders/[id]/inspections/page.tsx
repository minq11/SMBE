import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { withTransaction } from "@/server/db";
import { workSession } from "@/server/work-orders";
import { inspectionOverview } from "@/server/inspection-service";
import { WorkOrderError } from "@/features/work-orders/model";
import { OrderShell } from "@/features/work-orders/order-shell";
import { PageHeader } from "@/components/ui/page-header";
import {
  InspectionForm,
  FindingResolution,
} from "@/features/inspections/inspection-form";
import { InspectionSummary } from "@/features/inspections/inspection-summary";
import {
  sessionState,
  SESSION_LABEL,
  RESULT_LABEL,
  entryPath,
} from "@/features/inspections/model";

const at = (value: string) =>
  new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
export default async function InspectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string; via?: string; saved?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const kind =
    query.type === "TBM"
      ? "TBM"
      : query.type === "DURING_WORK"
        ? "DURING_WORK"
        : null;
  const path = entryPath(query.via);
  const { session, actor } = await workSession(
    "/work-orders/" +
      id +
      "/inspections" +
      (kind ? "?type=" + kind + "&via=" + path.toLowerCase() : ""),
  );
  const data = await withTransaction((client) =>
    inspectionOverview(client, actor, id),
  ).catch((error) => {
    if (error instanceof WorkOrderError) notFound();
    throw error;
  });
  if (!data.order.issued_at) notFound();
  const canInput =
    data.current &&
    data.order.status !== "CANCELED" &&
    (data.isManager ||
      data.current.expected_assignees.some((a) => a.userId === actor.userId));
  const alreadyTBM =
    kind === "TBM" && data.current?.tbm_users.includes(actor.userId);
  return (
    <OrderShell session={session} title="현장 점검">
      <PageHeader
        title={
          kind === "TBM"
            ? "TBM 확인"
            : kind === "DURING_WORK"
              ? "작업 중 점검"
              : "점검 기록"
        }
        description={data.order.name}
        actions={
          <Link className="btn-secondary" href={"/work-orders/" + id}>
            작업지시 보기
          </Link>
        }
      />
      {query.saved === "1" && (
        <p role="status" className="wo-notice">
          점검 기록을 저장했습니다.
        </p>
      )}
      <InspectionSummary
        id={id}
        current={data.current}
        now={data.now}
        canceled={data.order.status === "CANCELED"}
        ownId={actor.userId}
        via={query.via}
      />
      {kind && canInput && !alreadyTBM && (
        <section className="wo-section">
          {kind === "TBM" && (
            <>
              <h2>발급 당시 위험요인·감소대책</h2>
              {data.risks.map((r, i) => (
                <article className="wo-risk" key={i}>
                  <h3>{r.hazard}</h3>
                  <p className="wo-detail-text">{r.reduction_measure}</p>
                </article>
              ))}
            </>
          )}
          {kind === "DURING_WORK" && (
            <p className="wo-notice">
              TBM 미확인이어도 점검할 수 있습니다. TBM 누락 여부는 별도로
              기록됩니다.
            </p>
          )}
          <h2>{kind === "TBM" ? "TBM 체크리스트" : "작업 중 체크리스트"}</h2>
          <p>
            작업일자 {data.current!.work_date} · {at(data.current!.starts_at)} ~{" "}
            {at(data.current!.ends_at)} (한국시간)
          </p>
          <InspectionForm
            key={data.current!.id + kind}
            orderId={id}
            sessionId={data.current!.id}
            category={kind}
            path={path}
            checklist={data.checklist.filter((c) => c.category === kind)}
            managers={data.managers}
            previousActions={kind === "TBM" ? data.previousActions : []}
          />
        </section>
      )}
      {alreadyTBM && (
        <p role="status">
          이미 이 회차의 TBM을 확인했습니다. 아래 기록에서 확인하세요.
        </p>
      )}
      <section className="wo-section">
        <h2>회차별 이행 현황</h2>
        <p className="wo-muted">
          배정 인원 전원 TBM + 작업 중 점검 1건 이상이면 점검 완료입니다. 관리자
          추가 참여는 배정자 확인을 대신하지 않으며, 점검 완료와 부적합
          조치완료는 별개입니다.
        </p>
        {data.lockedSessions > 0 && (
          <p>무료 이용의 과거 열람 제한 회차: {data.lockedSessions}건</p>
        )}
        <div className="inspection-sessions">
          {data.sessions.map((s) => {
            const state = sessionState(s, new Date(data.now));
            return (
              <details key={s.id} open={s.id === data.current?.id}>
                <summary>
                  {s.work_date} ·{" "}
                  {data.order.status === "CANCELED" ? "작업 취소 · " : ""}
                  {SESSION_LABEL[state.state]} · TBM{" "}
                  {s.expected_assignees.length - state.missing.length}/
                  {s.expected_assignees.length} · 작업 중 {s.during_count}건
                </summary>
                <p>
                  {at(s.starts_at)} ~ {at(s.ends_at)}
                </p>
                <p>
                  TBM 미확인:{" "}
                  {state.missing.map((a) => a.name).join(", ") || "없음"}
                </p>
              </details>
            );
          })}
        </div>
      </section>
      <section className="wo-section">
        <h2>점검 결과</h2>
        <p className="wo-muted">
          최근 100건 표시 · QR/링크/웹은 진입경로 표식이며 위치나 실제 스캔을
          인증하지 않습니다.
        </p>
        {!data.records.length && <p>아직 점검 기록이 없습니다.</p>}
        {data.records.slice(0, 100).map((r) => (
          <details className="inspection-record" key={r.id}>
            <summary>
              {r.category === "TBM" ? "TBM" : "작업 중"} · {r.inspector_name} (
              {r.inspector_role === "WORKER" ? "작업자" : "관리자"}) ·{" "}
              {at(r.submitted_at)}
            </summary>
            <p>
              작업일자{" "}
              {data.sessions.find((s) => s.id === r.session_id)?.work_date} ·
              진입경로 {r.entry_path} · 본인 직접 입력
            </p>
            {r.results.map((result, i) => (
              <div className="wo-risk" key={i}>
                <strong>
                  {result.item_text} · {RESULT_LABEL[result.result]}
                </strong>
                <p className="wo-detail-text">
                  {result.comment || "코멘트 없음"}
                </p>
              </div>
            ))}
          </details>
        ))}
      </section>
      <section className="wo-section">
        <h2>부적합 조치 · 미조치 {data.openCount}건</h2>
        <p className="wo-muted">
          작업 종료·취소로 자동 종결되지 않습니다. 지정된 활성 관리자가 조치
          내용을 입력해야 종결됩니다. 표시 범위는 최근 100건입니다.
        </p>
        {data.findings.slice(0, 100).map((f) => (
          <article className="wo-risk" key={f.id}>
            <h3>
              {f.item_text} · {f.status === "OPEN" ? "조치대기" : "조치완료"}
            </h3>
            <p>
              {f.work_date} · 담당 {f.assigned_manager_name}
            </p>
            <p className="wo-detail-text">{f.comment || "코멘트 없음"}</p>
            {f.resolution && (
              <p className="wo-detail-text">조치 내용: {f.resolution}</p>
            )}
            {f.status === "OPEN" &&
              f.assigned_manager_id === actor.userId &&
              data.isManager && <FindingResolution id={f.id} />}
          </article>
        ))}
        {data.isManager && (
          <Link href="/inspections">내 부적합 알림함 보기</Link>
        )}
      </section>
    </OrderShell>
  );
}

import Link from "next/link";
import { FileText } from "lucide-react";
import { notFound } from "next/navigation";
import { z } from "zod";
import { withTransaction } from "@/server/db";
import { workSession } from "@/server/work-orders";
import { inspectionOverview } from "@/server/inspection-service";
import { readPermit } from "@/server/ptw-service";
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
  orderSessionsForDisplay,
} from "@/features/inspections/model";

const at = (value: string) =>
  new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
export default async function InspectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    type?: string;
    via?: string;
    saved?: string;
    session?: string;
  }>;
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
  const queryString =
    (kind ? "type=" + kind + "&via=" + path.toLowerCase() : "") +
    (query.session ? (kind ? "&" : "") + "session=" + query.session : "");
  const { session, actor } = await workSession(
    "/work-orders/" +
      id +
      "/inspections" +
      (queryString ? "?" + queryString : ""),
  );
  const data = await withTransaction((client) =>
    inspectionOverview(client, actor, id),
  ).catch((error) => {
    if (error instanceof WorkOrderError) notFound();
    throw error;
  });
  if (!data.order.issued_at) notFound();
  const permit = data.order.ptw_required
    ? await withTransaction((c) => readPermit(c, actor, id))
    : null;
  const target =
    (query.session
      ? data.sessions.find((s) => s.id === query.session)
      : null) ?? data.current;
  const targetState = target ? sessionState(target, new Date(data.now)) : null;
  const targetAssigned = target
    ? target.expected_assignees.some((a) => a.userId === actor.userId)
    : false;
  const canInput =
    !!target &&
    !!targetState?.canInput &&
    data.order.status !== "CANCELED" &&
    (data.isManager || targetAssigned);
  const alreadyTBM =
    kind === "TBM" && target?.tbm_users.includes(actor.userId);
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
            <FileText size={14} /> 작업지시 보기
          </Link>
        }
      />
      {query.saved === "1" && (
        <p role="status" className="wo-notice">
          점검 기록을 저장했습니다.
        </p>
      )}
      {data.order.ptw_required && (
        <p className="wo-notice">
          <Link href={"/work-orders/" + id + "/permit"}>
            PTW:{" "}
            {permit?.status === "APPROVED" ? "승인" : "미승인 · 현재 상태 확인"}
          </Link>
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
            작업일자 {target!.work_date} · {at(target!.starts_at)} ~{" "}
            {at(target!.ends_at)} (한국시간)
            {targetState?.state === "PAST" && " · 지난 회차 입력"}
          </p>
          <InspectionForm
            key={target!.id + kind}
            orderId={id}
            sessionId={target!.id}
            category={kind}
            path={path}
            checklist={data.checklist.filter((c) => c.category === kind)}
            managers={data.managers}
            previousActions={
              // 이전 회차 조치 팝업은 오늘 회차에서만 노출. 지난 회차 사후 입력에는 방해가 된다.
              target!.id === data.current?.id && kind === "TBM"
                ? data.previousActions
                : []
            }
          />
        </section>
      )}
      {kind && target && !canInput && targetState?.state === "FUTURE" && (
        <p className="wo-notice">
          아직 시작하지 않은 회차입니다. 작업일이 되면 입력할 수 있습니다.
        </p>
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
          {orderSessionsForDisplay(data.sessions, new Date(data.now)).map((s) => {
            const state = sessionState(s, new Date(data.now));
            const mineTBM = s.tbm_users.includes(actor.userId);
            const rowAssigned = s.expected_assignees.some(
              (a) => a.userId === actor.userId,
            );
            const showActions =
              state.canInput &&
              data.order.status !== "CANCELED" &&
              (data.isManager || rowAssigned);
            const sessionQ =
              "&session=" + s.id + "&via=" + path.toLowerCase();
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
                {showActions && (
                  <div className="wo-actions">
                    {!mineTBM && (
                      <Link
                        className="btn-primary"
                        href={
                          "/work-orders/" +
                          id +
                          "/inspections?type=TBM" +
                          sessionQ
                        }
                      >
                        TBM 확인
                      </Link>
                    )}
                    <Link
                      className="btn-secondary"
                      href={
                        "/work-orders/" +
                        id +
                        "/inspections?type=DURING_WORK" +
                        sessionQ
                      }
                    >
                      작업 중 점검
                    </Link>
                  </div>
                )}
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

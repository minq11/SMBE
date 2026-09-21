import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { withTransaction } from "@/server/db";
import {
  resolveAccessToken,
  linkActor,
  LINK_COOKIE,
} from "@/server/worker-access";
import { inspectionOverview } from "@/server/inspection-service";
import { WorkOrderError } from "@/features/work-orders/model";
import { InspectionForm } from "@/features/inspections/inspection-form";
import { SESSION_LABEL, sessionState } from "@/features/inspections/model";
import { PERMIT_LABEL, permitStatus } from "@/features/ptw/model";

const RISK_LEVEL: Record<string, string> = { HIGH: "상", MID: "중", LOW: "하" };

export const metadata = { title: "내 작업지시 · SMBE" };

const at = (value: string) =>
  new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

export default async function WorkerLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; saved?: string }>;
}) {
  const query = await searchParams;
  const token = (await cookies()).get(LINK_COOKIE)?.value;
  const grant = token
    ? await withTransaction((c) => resolveAccessToken(c, token))
    : null;
  if (!grant) redirect("/w/expired");

  const actor = linkActor(grant);
  const orderId = grant.workOrderId;
  const data = await withTransaction((client) =>
    inspectionOverview(client, actor, orderId),
  ).catch((error) => {
    if (error instanceof WorkOrderError) redirect("/w/expired");
    throw error;
  });

  const assigned = data.current?.expected_assignees.some(
    (a) => a.userId === actor.userId,
  );
  const canceled = data.order.status === "CANCELED";
  const tbmDone = data.current?.tbm_users.includes(actor.userId) ?? false;
  const kind =
    query.type === "DURING_WORK"
      ? "DURING_WORK"
      : query.type === "TBM"
        ? "TBM"
        : tbmDone
          ? "DURING_WORK"
          : "TBM";
  const open = Boolean(data.current) && !canceled && Boolean(assigned);
  const showForm = open && (kind === "DURING_WORK" || !tbmDone);
  // PTW 미승인은 작업자에게도 보여 준다. 설계상 점검을 막지는 않는다 —
  // 막는 대신 "지금 허가가 안 난 상태"를 현장이 알고 있게 하는 것이 목적이다.
  const ptw = data.order.draft_data.ptwRequired
    ? permitStatus(
        data.permit?.status ?? "NONE",
        data.order.status,
        data.order.draft_data,
        new Date(data.now),
      )
    : null;

  return (
    <main className="link-work">
      <header className="link-work-head">
        <p className="link-work-greeting">
          <strong>{grant.worker.name}</strong>님
        </p>
        <h1>{data.order.name}</h1>
        {data.current && (
          <p className="wo-muted">
            작업일자 {data.current.work_date} · {at(data.current.starts_at)} ~{" "}
            {at(data.current.ends_at)}
          </p>
        )}
      </header>

      {query.saved === "1" && (
        <p role="status" className="wo-notice">
          기록을 저장했습니다.
        </p>
      )}
      {canceled && (
        <p role="alert" className="wo-notice">
          취소된 지시서입니다. 작업·점검에 사용하지 마세요.
        </p>
      )}
      {ptw && ptw !== "APPROVED" && (
        <p role="alert" className="wo-notice">
          위험작업허가(PTW) {ptw === "NONE" ? "미신청" : PERMIT_LABEL[ptw]} 상태입니다.
          관리자에게 허가 상태를 확인하세요.
        </p>
      )}
      {ptw === "APPROVED" && (
        <p className="wo-notice">
          위험작업허가(PTW) 승인
          {data.permit?.self_approval ? " · 자가 승인 건" : ""}
        </p>
      )}
      {!canceled && !data.current && (
        <p className="wo-notice">
          지금은 입력할 수 있는 작업 회차가 없습니다. 작업 시작 2시간 전부터
          종료 2시간 후까지 입력할 수 있습니다.
        </p>
      )}
      {!canceled && data.current && !assigned && (
        <p className="wo-notice">이 회차에 배정되지 않았습니다.</p>
      )}
      {tbmDone && kind === "TBM" && (
        <p role="status" className="wo-notice">
          이미 이 회차의 TBM을 확인했습니다.
        </p>
      )}

      {showForm && kind === "TBM" && (
        <section className="wo-section">
          <h2>발급 당시 위험요인·감소대책</h2>
          {data.risks.map((r, i) => (
            <article className="wo-risk" key={i}>
              <h3>
                {r.hazard}{" "}
                <span className="wo-risk-level">
                  위험성 {RISK_LEVEL[r.initial_risk_level] ?? "-"} ·{" "}
                  {r.initial_allowable ? "허용 가능" : "허용 불가"}
                </span>
              </h3>
              <p className="wo-detail-text">{r.reduction_measure}</p>
            </article>
          ))}
          {/* 기준 원문은 길어서 항상 펼쳐 두면 체크리스트가 밀린다.
              필요한 사람만 열어 보게 접어 둔다. */}
          {data.criteria && (
            <details className="wo-criteria-help">
              <summary>위험성 수준은 무엇을 기준으로 정했나요?</summary>
              <pre className="criteria-readonly">{data.criteria}</pre>
              <p className="wo-muted">
                이 지시서가 발급될 때 회사가 정해 둔 기준입니다.
              </p>
            </details>
          )}
        </section>
      )}

      {showForm && (
        <section className="wo-section">
          <h2>{kind === "TBM" ? "TBM 체크리스트" : "작업 중 체크리스트"}</h2>
          <InspectionForm
            key={data.current!.id + kind}
            orderId={orderId}
            sessionId={data.current!.id}
            category={kind}
            path="LINK"
            checklist={data.checklist.filter((c) => c.category === kind)}
            managers={data.managers}
            previousActions={kind === "TBM" ? data.previousActions : []}
          />
        </section>
      )}

      {open && tbmDone && kind === "TBM" && (
        <p>
          <Link className="btn-secondary" href="/w?type=DURING_WORK">
            작업 중 점검 입력
          </Link>
        </p>
      )}
      {open && kind === "DURING_WORK" && !tbmDone && (
        <p>
          <Link className="btn-secondary" href="/w?type=TBM">
            TBM 확인 먼저 하기
          </Link>
        </p>
      )}

      {data.current && (
        <section className="wo-section">
          <h2>이 회차 진행 상황</h2>
          <p>
            {
              SESSION_LABEL[
                sessionState(data.current, new Date(data.now)).state
              ]
            }{" "}
            · TBM{" "}
            {data.current.expected_assignees.length -
              sessionState(data.current, new Date(data.now)).missing.length}
            /{data.current.expected_assignees.length} · 작업 중{" "}
            {data.current.during_count}건
          </p>
        </section>
      )}

      <p className="wo-muted link-work-foot">
        이 링크는 본인 전용입니다. 다른 사람에게 전달하지 마세요.
      </p>
    </main>
  );
}

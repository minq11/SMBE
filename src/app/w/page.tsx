import Link from "next/link";
import { AddToHomeHint } from "@/components/pwa/add-to-home-hint";
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
import {
  sessionState,
  SESSION_LABEL,
  orderSessionsForDisplay,
} from "@/features/inspections/model";
import { PERMIT_LABEL, permitStatus } from "@/features/ptw/model";

const RISK_LEVEL: Record<string, string> = { HIGH: "상", MID: "중", LOW: "하" };

export const metadata = { title: "내 작업지시 · 심플안전" };

const at = (value: string) =>
  new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

export default async function WorkerLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string; type?: string; saved?: string }>;
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

  const canceled = data.order.status === "CANCELED";
  const kind =
    query.type === "TBM"
      ? "TBM"
      : query.type === "DURING_WORK"
        ? "DURING_WORK"
        : null;
  const target =
    (query.session
      ? data.sessions.find((s) => s.id === query.session)
      : null) ?? null;
  const targetState = target ? sessionState(target, new Date(data.now)) : null;
  const assigned = target
    ? target.expected_assignees.some((a) => a.userId === actor.userId)
    : false;
  const tbmDone = target ? target.tbm_users.includes(actor.userId) : false;
  const showForm =
    !!target &&
    !!kind &&
    !canceled &&
    !!targetState?.canInput &&
    assigned &&
    (kind === "DURING_WORK" || !tbmDone);
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
      </header>
      <AddToHomeHint />

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
          위험작업허가(PTW) {ptw === "NONE" ? "미신청" : PERMIT_LABEL[ptw]}{" "}
          상태입니다. 관리자에게 허가 상태를 확인하세요.
        </p>
      )}
      {ptw === "APPROVED" && (
        <p className="wo-notice">
          위험작업허가(PTW) 승인
          {data.permit?.self_approval ? " · 자가 승인 건" : ""}
        </p>
      )}

      {target && !showForm && targetState?.state === "FUTURE" && (
        <p className="wo-notice">
          아직 시작하지 않은 회차입니다. 작업일이 되면 입력할 수 있습니다.
        </p>
      )}
      {target && !showForm && !assigned && targetState?.state !== "FUTURE" && (
        <p className="wo-notice">이 회차에 배정되지 않았습니다.</p>
      )}
      {target && kind === "TBM" && tbmDone && (
        <p role="status" className="wo-notice">
          이미 이 회차의 TBM을 확인했습니다.
        </p>
      )}

      {showForm && kind === "TBM" && (
        <section className="wo-section">
          <p className="wo-muted">
            작업일자 {target!.work_date} · {at(target!.starts_at)} ~{" "}
            {at(target!.ends_at)}
          </p>
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
            key={target!.id + kind}
            orderId={orderId}
            sessionId={target!.id}
            category={kind!}
            path="LINK"
            checklist={data.checklist.filter((c) => c.category === kind)}
            canAttach={data.canAttach}
            managers={data.managers}
            previousActions={
              // 이전 회차 조치 팝업은 오늘 회차에서만 노출한다.
              // 지난 회차를 뒤늦게 입력할 때 팝업이 뜨면 흐름이 어지러워진다.
              target!.id === data.current?.id && kind === "TBM"
                ? data.previousActions
                : []
            }
          />
          <p>
            <Link className="btn-secondary" href="/w">
              회차 목록으로
            </Link>
          </p>
        </section>
      )}

      {!showForm && (
        <section className="wo-section">
          <h2>회차 목록</h2>
          <p className="wo-muted">
            오늘 회차부터 처리하고, 놓친 지난 회차도 여기서 이어 입력할 수
            있습니다.
          </p>
          <ul className="link-session-list">
            {orderSessionsForDisplay(data.sessions, new Date(data.now)).map(
              (s) => {
                const state = sessionState(s, new Date(data.now));
                const mine = s.tbm_users.includes(actor.userId);
                const rowAssigned = s.expected_assignees.some(
                  (a) => a.userId === actor.userId,
                );
                const showActions = state.canInput && !canceled && rowAssigned;
                return (
                  <li
                    key={s.id}
                    className={
                      "link-session link-session-" +
                      state.state.toLowerCase() +
                      (s.id === data.current?.id ? " is-current" : "")
                    }
                  >
                    <div className="link-session-head">
                      <strong>{s.work_date}</strong>
                      <span className="link-session-badge">
                        {SESSION_LABEL[state.state]}
                      </span>
                    </div>
                    <p className="wo-muted">
                      {at(s.starts_at)} ~ {at(s.ends_at)}
                    </p>
                    <p className="wo-muted">
                      TBM {s.expected_assignees.length - state.missing.length}/
                      {s.expected_assignees.length} · 작업 중 {s.during_count}건
                      {mine ? " · 내 TBM 확인 완료" : ""}
                    </p>
                    {showActions && (
                      <div className="wo-actions">
                        {!mine && (
                          <Link
                            className="btn-primary"
                            href={`/w?session=${s.id}&type=TBM`}
                          >
                            TBM 확인
                          </Link>
                        )}
                        <Link
                          className="btn-secondary"
                          href={`/w?session=${s.id}&type=DURING_WORK`}
                        >
                          작업 중 점검
                        </Link>
                      </div>
                    )}
                    {!rowAssigned && (
                      <p className="wo-muted">이 회차에 배정되지 않았습니다.</p>
                    )}
                  </li>
                );
              },
            )}
            {!data.sessions.length && (
              <li className="wo-muted">회차가 없습니다.</li>
            )}
          </ul>
          {data.lockedSessions > 0 && (
            <p className="wo-muted">
              무료 이용의 과거 열람 제한 회차: {data.lockedSessions}건
            </p>
          )}
        </section>
      )}

      <p className="wo-muted link-work-foot">
        이 링크는 본인 전용입니다. 다른 사람에게 전달하지 마세요.
      </p>
    </main>
  );
}

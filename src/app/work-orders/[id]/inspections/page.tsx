import Link from "next/link";
import { ArrowLeft, ChevronRight, FileText } from "lucide-react";
import { notFound } from "next/navigation";
import { z } from "zod";
import { withTransaction } from "@/server/db";
import { workSession } from "@/server/work-orders";
import {
  inspectionOverview,
  inspectionRevisions,
} from "@/server/inspection-service";
import { readPermit } from "@/server/ptw-service";
import { WorkOrderError } from "@/features/work-orders/model";
import { OrderShell } from "@/features/work-orders/order-shell";
import { PageHeader } from "@/components/ui/page-header";
import {
  InspectionForm,
  FindingResolution,
} from "@/features/inspections/inspection-form";
import { InspectionSummary } from "@/features/inspections/inspection-summary";
import { AttachmentList } from "@/features/attachments/attachment-list";
import {
  BackfillForm,
  ReviseForm,
  RevisionLog,
} from "@/features/inspections/admin-forms";
import {
  sessionState,
  SESSION_LABEL,
  SESSION_TONE,
  RESULT_LABEL,
  entryPath,
  orderSessionsForDisplay,
} from "@/features/inspections/model";
import { clock, dayLabel, timeRange } from "@/features/inspections/format";
import { Facts, StatStrip, type Tone } from "@/components/ui/facts";
import { Pager } from "@/components/ui/pager";
import { pageOf, parsePage } from "@/lib/paging";

const ENTRY: Record<string, string> = { WEB: "웹", QR: "QR", LINK: "링크" };
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
    page?: string;
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
  const revisions = data.isManager
    ? await withTransaction((c) => inspectionRevisions(c, actor, id))
    : [];
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
  const alreadyTBM = kind === "TBM" && target?.tbm_users.includes(actor.userId);
  /**
   * 입력 화면과 기록 화면은 다른 물건이다. TBM 확인하러 들어온 작업자에게 회차
   * 목록·지난 기록·관리자 도구를 같이 보이면 체크리스트가 그 사이에 묻힌다.
   * 입력할 수 있을 때는 체크리스트만, 아니면 기록만.
   */
  const inputMode = !!kind && canInput && !alreadyTBM;
  const title =
    kind === "TBM"
      ? "TBM 확인"
      : kind === "DURING_WORK"
        ? "작업 중 점검"
        : "점검 기록";
  const ptwWarn =
    data.order.ptw_required && permit?.status !== "APPROVED" ? (
      <p className="wo-notice" data-tone="danger">
        <Link href={"/work-orders/" + id + "/permit"}>
          PTW 미승인 · 허가 상태 확인
        </Link>
      </p>
    ) : null;
  if (inputMode) {
    return (
      <OrderShell session={session} title={title}>
        <PageHeader
          title={title}
          description={data.order.name}
          actions={
            <Link className="btn-secondary" href={"/work-orders/" + id}>
              <FileText size={14} /> 작업지시 보기
            </Link>
          }
        />
        <StatStrip
          items={[
            { label: "회차", value: dayLabel(target!.work_date) },
            {
              label: "시간",
              value: timeRange(target!.starts_at, target!.ends_at),
            },
            targetState?.state === "PAST" && {
              label: "구분",
              value: "지난 회차",
              tone: "info",
            },
          ]}
        />
        {ptwWarn}
        {kind === "TBM" && data.risks.length > 0 && (
          <section className="wo-section tbm-risks">
            <h2>위험요인·감소대책</h2>
            <ol className="tbm-risk-list">
              {data.risks.map((r, i) => (
                <li key={i}>
                  <strong>{r.hazard}</strong>
                  <span>{r.reduction_measure}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
        {kind === "DURING_WORK" && (
          <p className="wo-notice" data-tone="info">
            TBM 미확인이어도 점검할 수 있습니다.
          </p>
        )}
        <section className="wo-section">
          <h2>체크리스트</h2>
          <InspectionForm
            key={target!.id + kind}
            orderId={id}
            sessionId={target!.id}
            category={kind!}
            path={path}
            checklist={data.checklist.filter((c) => c.category === kind)}
            canAttach={data.canAttach}
            managers={data.managers}
            previousActions={
              // 이전 회차 조치 팝업은 오늘 회차에서만 노출. 지난 회차 사후 입력에는 방해가 된다.
              target!.id === data.current?.id && kind === "TBM"
                ? data.previousActions
                : []
            }
          />
        </section>
      </OrderShell>
    );
  }
  const viaQ = "&via=" + path.toLowerCase();
  const root = "/work-orders/" + id + "/inspections";
  const now = new Date(data.now);
  const canceled = data.order.status === "CANCELED";
  /**
   * 기록은 두 층이다. 1층은 회차 목록(오늘 카드 + 날짜 줄), 2층은 회차 하나
   * (시간·미확인·단추·그 회차의 기록·사후 입력). 한 화면에 다 펼치면 작업자가
   * 어디를 봐야 하는지 몰랐다 (사장님 결정). 2층은 `?session=` 로 연다.
   */
  const sessionPage = pageOf(
    orderSessionsForDisplay(data.sessions, now),
    parsePage(query.page),
  );
  const focused = query.session
    ? (data.sessions.find((s) => s.id === query.session) ?? null)
    : null;
  if (focused) {
    const state = sessionState(focused, now);
    const mineTBM = focused.tbm_users.includes(actor.userId);
    const assigned = focused.expected_assignees.some(
      (a) => a.userId === actor.userId,
    );
    const showActions =
      state.canInput && !canceled && (data.isManager || assigned);
    const records = data.records.filter((r) => r.session_id === focused.id);
    const tbmDone = focused.expected_assignees.length - state.missing.length;
    const sessionQ = "&session=" + focused.id + viaQ;
    return (
      <OrderShell
        session={session}
        title={dayLabel(focused.work_date) + " 회차"}
      >
        <PageHeader
          title={dayLabel(focused.work_date) + " 회차"}
          description={data.order.name}
          actions={
            <Link
              className="btn-secondary"
              href={root + (path === "WEB" ? "" : "?" + viaQ.slice(1))}
            >
              <ArrowLeft size={14} /> 회차 목록
            </Link>
          }
        />
        {ptwWarn}
        {kind && !canInput && state.state === "FUTURE" && (
          <p className="wo-notice" data-tone="info">
            아직 시작하지 않은 회차입니다. 작업일이 되면 입력할 수 있습니다.
          </p>
        )}
        {alreadyTBM && (
          <p role="status" className="wo-notice" data-tone="ok">
            이미 이 회차의 TBM을 확인했습니다.
          </p>
        )}
        <StatStrip
          items={[
            {
              label: "구분",
              value: canceled ? "작업 취소" : SESSION_LABEL[state.state],
              tone: canceled ? "danger" : (SESSION_TONE[state.state] as Tone),
            },
            {
              label: "시간",
              value: timeRange(focused.starts_at, focused.ends_at),
            },
            state.state !== "FUTURE" && {
              label: "TBM",
              value: `${tbmDone}/${focused.expected_assignees.length}명`,
              tone:
                tbmDone >= focused.expected_assignees.length ? "ok" : "info",
            },
            state.state !== "FUTURE" && {
              label: "작업 중 점검",
              value: `${focused.during_count}건`,
              tone: focused.during_count > 0 ? "ok" : "plain",
            },
            state.missing.length > 0 && {
              label: "TBM 미확인",
              value: state.missing.map((a) => a.name).join(", "),
              tone: "danger",
            },
          ]}
        />
        {showActions && (
          <div className="wo-actions insp-session-actions">
            {!mineTBM && (
              <Link
                className="btn-primary"
                href={root + "?type=TBM" + sessionQ}
              >
                TBM 확인
              </Link>
            )}
            <Link
              className="btn-secondary"
              href={root + "?type=DURING_WORK" + sessionQ}
            >
              작업 중 점검
            </Link>
          </div>
        )}
        <section className="wo-section">
          <h2>점검 기록</h2>
          {records.length === 0 && (
            <p className="wo-muted">아직 점검 기록이 없습니다.</p>
          )}
          {records.map((r) => {
            const counts = { PASS: 0, FAIL: 0, NA: 0 } as Record<
              string,
              number
            >;
            for (const result of r.results)
              counts[result.result] = (counts[result.result] ?? 0) + 1;
            return (
              <details className="inspection-record" key={r.id}>
                <summary>
                  <span
                    className="wo-risk-level"
                    data-tone={r.category === "TBM" ? "info" : "plain"}
                  >
                    {r.category === "TBM" ? "TBM" : "작업 중"}
                  </span>
                  <span className="insp-rec-who">
                    <strong>{r.inspector_name}</strong>
                    <span className="wo-muted">{clock(r.submitted_at)}</span>
                    {/* 사후 입력은 펼치지 않아도 보여야 한다. 기록을 훑는 사람이
                        현장 입력과 구분하지 못하면 표시한 의미가 없다. */}
                    {r.backfilled && (
                      <span className="wo-backfill-tag">사후 입력</span>
                    )}
                  </span>
                  <span className="insp-counts">
                    {counts.FAIL > 0 && (
                      <span data-tone="danger">
                        {RESULT_LABEL.FAIL} {counts.FAIL}
                      </span>
                    )}
                    {counts.PASS > 0 && (
                      <span data-tone="ok">
                        {RESULT_LABEL.PASS} {counts.PASS}
                      </span>
                    )}
                    {counts.NA > 0 && (
                      <span>
                        {RESULT_LABEL.NA} {counts.NA}
                      </span>
                    )}
                  </span>
                </summary>
                <ul className="inspection-results">
                  {r.results.map((result, i) => (
                    <li key={i} data-result={result.result}>
                      <span>{result.item_text}</span>
                      <strong>{RESULT_LABEL[result.result]}</strong>
                      {result.comment && (
                        <p className="wo-detail-text">{result.comment}</p>
                      )}
                      {result.photos.length > 0 && (
                        <AttachmentList
                          items={result.photos}
                          canDelete={false}
                          compact
                        />
                      )}
                    </li>
                  ))}
                </ul>
                <Facts
                  className="wo-facts--tight"
                  rows={[
                    [
                      "점검자",
                      r.inspector_role === "WORKER" ? "작업자" : "관리자",
                    ],
                    ["경로", ENTRY[r.entry_path] ?? r.entry_path],
                    ["입력", r.backfilled ? "사후 입력" : "본인 입력"],
                    r.backfilled ? ["입력자", r.recorded_by_name] : null,
                  ]}
                />
                {data.isManager && (
                  <details className="wo-revise">
                    <summary>결과 수정</summary>
                    <p className="wo-muted">
                      원본은 남고, 수정 전·후와 사유가 이력이 됩니다.
                    </p>
                    <ReviseForm
                      inspectionId={r.id}
                      results={r.results}
                      managers={data.managers}
                    />
                  </details>
                )}
              </details>
            );
          })}
        </section>
        {data.isManager && (
          <section className="wo-section">
            <h2>관리자 사후 입력</h2>
            <p className="wo-muted">
              현장에서 기록하지 못한 이 회차의 점검을 대신 넣습니다.
            </p>
            <BackfillForm
              key={focused.id}
              orderId={id}
              sessionId={focused.id}
              candidates={[
                ...focused.expected_assignees.map((a) => ({
                  user_id: a.userId,
                  display_name: a.name,
                })),
                ...data.managers.filter(
                  (m) =>
                    !focused.expected_assignees.some(
                      (a) => a.userId === m.user_id,
                    ),
                ),
              ]}
              managers={data.managers}
              checklist={{
                TBM: data.checklist.filter((c) => c.category === "TBM"),
                DURING_WORK: data.checklist.filter(
                  (c) => c.category === "DURING_WORK",
                ),
              }}
            />
          </section>
        )}
      </OrderShell>
    );
  }
  return (
    <OrderShell session={session} title="점검 기록">
      <PageHeader
        title="점검 기록"
        description={data.order.name}
        actions={
          <Link className="btn-secondary" href={"/work-orders/" + id}>
            <FileText size={14} /> 작업지시 보기
          </Link>
        }
      />
      {query.saved === "1" && (
        <p role="status" className="wo-notice" data-tone="ok">
          점검 기록을 저장했습니다.
        </p>
      )}
      {ptwWarn}
      <InspectionSummary
        id={id}
        current={data.current}
        now={data.now}
        canceled={canceled}
        ownId={actor.userId}
        via={query.via}
        logLink={false}
      />
      {alreadyTBM && (
        <p role="status" className="wo-notice" data-tone="ok">
          이미 이 회차의 TBM을 확인했습니다.
        </p>
      )}
      <section className="wo-section">
        <h2>회차</h2>
        {data.lockedSessions > 0 && (
          <p className="wo-muted">
            무료 이용의 과거 열람 제한 회차 {data.lockedSessions}건
          </p>
        )}
        <div className="insp-list">
          {sessionPage.rows.map((s) => {
            const state = sessionState(s, now);
            const tbmDone = s.expected_assignees.length - state.missing.length;
            return (
              <Link
                className="insp-row"
                key={s.id}
                href={root + "?session=" + s.id + viaQ}
                aria-current={s.id === data.current?.id ? "true" : undefined}
              >
                <strong>{dayLabel(s.work_date)}</strong>
                <span
                  className="wo-risk-level"
                  data-tone={canceled ? "danger" : SESSION_TONE[state.state]}
                >
                  {canceled ? "작업 취소" : SESSION_LABEL[state.state]}
                </span>
                <StatStrip
                  compact
                  items={[
                    state.state !== "FUTURE" && {
                      label: "TBM",
                      value: `${tbmDone}/${s.expected_assignees.length}명`,
                      tone:
                        tbmDone >= s.expected_assignees.length ? "ok" : "info",
                    },
                    state.state !== "FUTURE" && {
                      label: "작업 중 점검",
                      value: `${s.during_count}건`,
                      tone: s.during_count > 0 ? "ok" : "plain",
                    },
                    state.state === "FUTURE" && {
                      label: "시간",
                      value: timeRange(s.starts_at, s.ends_at),
                    },
                  ]}
                />
                <ChevronRight size={16} className="insp-row-go" />
              </Link>
            );
          })}
        </div>
        <Pager
          page={sessionPage.page}
          pageCount={sessionPage.pageCount}
          hrefFor={(n) =>
            root +
            (path === "WEB"
              ? n > 1
                ? "?page=" + n
                : ""
              : "?" + viaQ.slice(1) + (n > 1 ? "&page=" + n : ""))
          }
        />
      </section>
      {(data.findings.length > 0 || data.isManager) && (
        <section className="wo-section">
          <h2>불량 조치 · 미조치 {data.openCount}건</h2>
          {!data.findings.length && (
            <p className="wo-muted">불량이 없습니다.</p>
          )}
          {data.findings.slice(0, 100).map((f) => (
            <article className="wo-risk" key={f.id}>
              <h3>
                {f.item_text}
                <span
                  className="wo-risk-level"
                  data-tone={f.status === "OPEN" ? "danger" : "ok"}
                >
                  {f.status === "OPEN" ? "조치대기" : "조치완료"}
                </span>
              </h3>
              <Facts
                className="wo-facts--tight"
                rows={[
                  ["회차", dayLabel(f.work_date)],
                  ["담당", f.assigned_manager_name],
                  f.comment
                    ? [
                        "코멘트",
                        <span className="wo-detail-text" key="c">
                          {f.comment}
                        </span>,
                      ]
                    : null,
                  f.resolution
                    ? [
                        "조치 내용",
                        <span className="wo-detail-text" key="r">
                          {f.resolution}
                        </span>,
                      ]
                    : null,
                ]}
              />
              {f.status === "OPEN" &&
                f.assigned_manager_id === actor.userId &&
                data.isManager && <FindingResolution id={f.id} />}
            </article>
          ))}
          {data.isManager && (
            <Link className="text-button" href="/inspections">
              내 불량 알림함 보기
            </Link>
          )}
        </section>
      )}
      {data.isManager && (
        <details className="std-fold wo-fold wo-history-fold">
          <summary>점검 수정 이력</summary>
          <RevisionLog items={revisions} />
        </details>
      )}
    </OrderShell>
  );
}

import Link from "next/link";
import Image from "next/image";
import QRCode from "qrcode";
import { Copy } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { workSession, orderDetail, orderMembers } from "@/server/work-orders";
import { workOrderOrigin } from "@/server/work-order-delivery";
import {
  WorkOrderError,
  STATUS_LABEL,
  type WorkDraft,
} from "@/features/work-orders/model";
import { OrderShell } from "@/features/work-orders/order-shell";
import {
  OrderCommand,
  PrintButton,
  CopyLinkButton,
} from "@/features/work-orders/order-controls";
import { PageHeader } from "@/components/ui/page-header";
import { JumpNav } from "@/components/ui/jump-nav";
import { dayLabel } from "@/features/inspections/format";
import { PrintSheet } from "@/features/work-orders/print-sheet";
import { PERMIT_LABEL, permitStatus } from "@/features/ptw/model";
import { InspectionSummary } from "@/features/inspections/inspection-summary";
import { sessionState } from "@/features/inspections/model";
import { withTransaction } from "@/server/db";
import { readPermit } from "@/server/ptw-service";
import type { RiskCriteria } from "@/features/company/risk-criteria";

const ACTIONS: Record<string, string> = {
  CREATE: "초안 생성",
  UPDATE: "초안 변경",
  SUBMIT_ASSESSMENT: "평가 승인 요청",
  APPROVE_ASSESSMENT: "평가 승인",
  ISSUE: "지시서 발급",
  CANCEL: "지시서 취소",
  SEND_LINKS: "링크 전달 시도",
  SUBMIT_INSPECTION: "현장 점검 저장",
  RESOLVE_FINDING: "부적합 조치완료",
};
const LEVELS: Record<string, string> = {
  HIGH: "상",
  MID: "중",
  LOW: "하",
  "": "미선택",
};
const DELIVERY: Record<string, string> = {
  SENT: "발송 완료",
  FAILED: "발송 실패",
  SKIPPED: "이메일/설정 없음",
  RETRY_PENDING: "전달 대기",
  SENDING: "전달 중",
};
const dateTime = (value: string) =>
  new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
// 화면의 날짜는 "9. 24. 10:12" 까지. 초·연도는 문서 출력물에만 있으면 된다.
const shortTime = (value: string) =>
  new Date(value).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ via?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const via = query.via === "qr" ? "qr" : query.via === "link" ? "link" : "web";
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { session, actor } = await workSession(
    "/work-orders/" + id + (via !== "web" ? "?via=" + via : ""),
  );
  const detail = await orderDetail(actor, id).catch((error) => {
    if (error instanceof WorkOrderError) notFound();
    throw error;
  });
  const { order, isManager } = detail;
  // 작성 중인 지시서는 볼 것이 아니라 고칠 것이다. 관리자에겐 편집 화면으로 바로
  // 연다 — 검토·발급, 초안 삭제도 그쪽에 있다. 발급된 뒤에만 이 조회 화면이다.
  if (isManager && order.status === "DRAFT")
    redirect("/work-orders/" + id + "/edit");
  const d = order.draft_data;
  const permit = await withTransaction((c) => readPermit(c, actor, id));
  const issued = Boolean(order.issued_at);
  const active = ["ISSUED", "IN_PROGRESS"].includes(order.status);
  const url = workOrderOrigin() + "/work-orders/" + id;
  const qr =
    issued && order.status !== "CANCELED"
      ? await QRCode.toDataURL(url + "?via=qr", { width: 240, margin: 2 })
      : null;
  const members = !issued && isManager ? await orderMembers(actor) : [];
  /**
   * 발급된 지시서는 한 장이다. 작성 폼과 같은 순서(작업 정보 → 위험성평가 →
   * 일정·인원 → 체크리스트 → QR·전달)로 이어지고, 위의 구간 칩은 내려가기만
   * 한다. 탭이었을 때는 "작업 정보" 한 구간만 보여서 나머지가 없는 줄 알았다.
   * 발급 직후에는 할 일이 있는 QR 구간(#qr)으로 바로 내려간다.
   */
  const PARTS = [
    { id: "info", label: "작업 정보" },
    { id: "risk", label: "위험성평가" },
    { id: "schedule", label: "일정·인원" },
    { id: "checklist", label: "체크리스트" },
    ...(qr ? [{ id: "qr", label: "QR·전달" }] : []),
  ];
  // 출력물은 유료 기능이다. 무료 회사는 버튼을 눌렀을 때 안내로 막는다.
  const canPrint = (session.membership?.pro_state ?? "FREE") !== "FREE";
  const panel = (key: string) => ({ id: key, className: "wo-section" });
  const names = new Map([
    ...members.map((m) => [m.user_id, m.display_name] as const),
    ...detail.assignments.map(
      (m) => [m.user_id, m.snapshot_display_name] as const,
    ),
  ]);
  const riskSnapshot = detail.snapshots.find(
    (s) => s.snapshot_kind === "RISK_ASSESSMENT",
  )?.payload as
    | {
        criteria_snapshot: RiskCriteria;
        safety_info: WorkDraft["safetyInfo"];
        items: Array<{
          hazard: string;
          initial_risk_level: string;
          initial_allowable: boolean;
          current_control?: string | null;
          reduction_measure: string;
          responsible_user_id: string | null;
          responsible_name?: string | null;
          planned_completion_date: string | null;
        }>;
        participants: Array<{ user_id: string; snapshot_display_name: string }>;
      }
    | undefined;
  const method = detail.snapshots.find((s) => s.snapshot_kind === "WORK_METHOD")
    ?.payload.method;
  const standardMeta = detail.snapshots.find(
    (s) => s.snapshot_kind === "STANDARD_META",
  )?.payload as
    | {
        standard_id: string;
        standard_name: string;
        ptw_required: boolean;
        standard_updated_at: string;
        standard_revision_no?: number | null;
      }
    | undefined;
  // 발급 전에는 연결 정보로, 발급 뒤에는 사본으로. 어느 쪽이든 "이름 (n판)".
  const linked = detail.standard;
  const linkedStandardId =
    standardMeta?.standard_id ?? linked?.standard_id ?? d.standardId ?? null;
  const linkedRevisionNo =
    standardMeta?.standard_revision_no ?? linked?.revision_no ?? null;
  const linkedBaseName = standardMeta?.standard_name ?? linked?.name ?? null;
  const linkedStandardName = linkedBaseName
    ? linkedBaseName + (linkedRevisionNo ? ` (${linkedRevisionNo}판)` : "")
    : null;
  // 지난 판이면 그 판 화면으로. 표준서가 그 뒤 개정됐다는 것도 같이 보인다.
  const linkedIsCurrent = linked ? linked.is_current : true;
  const linkedHref = !linkedStandardId
    ? null
    : !linkedIsCurrent && linkedRevisionNo
      ? `/standards/${linkedStandardId}/revisions/${linkedRevisionNo}`
      : `/standards/${linkedStandardId}`;
  const risks =
    riskSnapshot?.items.map((r) => ({
      hazard: r.hazard,
      currentControl: r.current_control ?? "",
      level: r.initial_risk_level,
      allowable: r.initial_allowable ? "yes" : "no",
      measure: r.reduction_measure,
      responsibleId: r.responsible_user_id ?? "",
      responsibleName: r.responsible_name ?? "",
      dueDate: r.planned_completion_date?.slice(0, 10) ?? "",
    })) ??
    d.risks.map((r) => ({
      ...r,
      responsibleName: names.get(r.responsibleId) ?? "",
    }));
  const safety = riskSnapshot?.safety_info ?? d.safetyInfo;
  // 사전조사는 적은 칸만 보인다. "미입력" 네 줄은 정보가 아니다.
  const safetyRows = (
    [
      ["equipment", "기계·설비"],
      ["materials", "유해물질·MSDS"],
      ["environment", "주변 환경"],
      ["history", "재해·아차사고 이력"],
    ] as const
  ).filter(([key]) => safety[key]);
  // 회차 목록이 있으면 회차 수로, 회차마다 시간이 같으면 "매일 …" 로.
  const sessionsDraft = d.sessions ?? [];
  const uniformTimes = sessionsDraft.every(
    (s) => s.startTime === d.startTime && s.endTime === d.endTime,
  );
  const periodTimes = uniformTimes
    ? `매일 ${d.startTime} ~ ${d.endTime}` +
      (d.endTime <= d.startTime ? " (다음 날 종료)" : "")
    : "회차마다 시간 다름";
  const printPeriod =
    `${d.startDate || "미입력"} ~ ${d.endDate || "미입력"}` +
    (sessionsDraft.length ? ` · ${sessionsDraft.length}회차` : "") +
    ` · ${periodTimes}`;
  const printPtw = d.ptwRequired
    ? (PERMIT_LABEL[permitStatus(permit?.status ?? "NONE", order.status, d)] ??
      "미신청")
    : "불필요";
  const assigneeNames = issued
    ? detail.assignments.map((m) => m.snapshot_display_name).join(", ")
    : d.assigneeIds
        .map((id) => names.get(id) || "소속 변경된 구성원")
        .join(", ") || "배정 없음";
  const todaySession = detail.currentSession;
  const todayDone = todaySession
    ? todaySession.expected_assignees.length -
      sessionState(todaySession, new Date(detail.inspectionNow)).missing.length
    : 0;
  return (
    <OrderShell session={session} title={order.name}>
      {qr && canPrint && (
        <PrintSheet
          name={order.name}
          period={printPeriod}
          location={d.location}
          groupLabel={d.groupLabel}
          ptw={printPtw}
          assignees={detail.assignments
            .map((m) => m.snapshot_display_name)
            .join(", ")}
          risks={risks.map((r) => ({
            hazard: r.hazard,
            level: LEVELS[r.level] ?? "-",
            measure: r.measure,
          }))}
          tbm={detail.checklist
            .filter((c) => c.category === "TBM")
            .map((c) => c.text)}
          during={detail.checklist
            .filter((c) => c.category === "DURING_WORK")
            .map((c) => c.text)}
          qr={qr}
          url={url}
          issueVersion={order.issue_version}
          issuedAt={order.issued_at ? dateTime(order.issued_at) : null}
          printedAt={dateTime(new Date().toISOString())}
        />
      )}
      {qr && !canPrint && (
        <p className="wo-sheet-blocked" aria-hidden="true">
          무료 요금제에서는 지시서 출력물을 만들 수 없습니다. 화면의 QR 과
          이메일 링크로 전달하세요.
        </p>
      )}
      <div className="wo-print">
        {/* 지시서 번호·발행 버전·출력 기준시각은 출력물(PrintSheet)에만. 화면에는
            장소 옆에 언제 발급됐는지까지. 표준서·기간·인원은 작업 정보 구간에. */}
        <PageHeader
          title={order.name}
          description={
            <>
              {d.groupLabel
                ? d.groupLabel + " · " + d.location
                : d.location || "장소 미입력"}
              {order.issued_at && " · 발급 " + shortTime(order.issued_at)}
            </>
          }
          actions={
            isManager ? (
              <div className="wo-actions wo-no-print">
                <Link
                  className="btn-secondary"
                  href={"/work-orders/new?copy=" + id}
                >
                  <Copy size={14} /> 복사
                </Link>
              </div>
            ) : undefined
          }
        />
        <div className="wo-statuses">
          <div>
            <small>작업 일정</small>
            <strong>{STATUS_LABEL[order.status]}</strong>
          </div>
          <div>
            <small>PTW</small>
            <strong>
              {d.ptwRequired ? (
                <Link href={"/work-orders/" + id + "/permit"}>
                  {permit?.status === "APPROVED" ? "승인" : "승인 대기"}
                </Link>
              ) : isManager && actor.userId === order.created_by ? (
                <Link href={"/work-orders/" + id + "/permit"}>
                  불필요 · 허가 추가
                </Link>
              ) : (
                "불필요"
              )}
            </strong>
          </div>
          <div>
            <small>오늘 TBM</small>
            <strong>
              {order.status === "CANCELED"
                ? "작업 취소"
                : todaySession
                  ? `${todayDone}/${todaySession.expected_assignees.length}명 확인`
                  : "회차 없음"}
            </strong>
          </div>
          <div>
            <small>미조치 부적합</small>
            <strong>{detail.openFindings}건</strong>
          </div>
        </div>
        {order.status === "CANCELED" && (
          <p role="status" className="wo-notice">
            취소된 지시서입니다. 사유: {order.cancel_reason}
          </p>
        )}
        {order.status === "COMPLETED" && (
          <p className="wo-notice">작업기간이 끝났습니다.</p>
        )}
        {issued && (
          <InspectionSummary
            id={id}
            current={detail.currentSession}
            now={detail.inspectionNow}
            canceled={order.status === "CANCELED"}
            ownId={actor.userId}
            via={via}
          />
        )}
        <div className="wo-no-print">
          <JumpNav items={PARTS} label="지시서 구간" />
        </div>
        <section {...panel("info")}>
          <h2>작업 정보</h2>
          <dl className="wo-facts">
            <dt>작업방법</dt>
            <dd className="wo-detail-text">
              {typeof method === "string"
                ? method
                : d.method || "작업방법 미입력"}
            </dd>
            <dt>장소</dt>
            <dd>
              {d.location || "미입력"}
              {d.groupLabel ? ` · ${d.groupLabel}` : ""}
            </dd>
            <dt>작업기간</dt>
            <dd>{printPeriod}</dd>
            <dt>PTW</dt>
            <dd>
              {d.ptwRequired ? (
                <Link href={"/work-orders/" + id + "/permit"}>
                  필요 · {printPtw}
                </Link>
              ) : (
                "불필요"
              )}
            </dd>
            {linkedStandardId && linkedHref && (
              <>
                <dt>표준서</dt>
                <dd>
                  <Link href={linkedHref}>{linkedStandardName ?? "열기"}</Link>
                  {!linkedIsCurrent && linked?.current_revision_no
                    ? ` · 그 뒤 ${linked.current_revision_no}판으로 개정됨`
                    : ""}
                </dd>
              </>
            )}
          </dl>
        </section>
        <section {...panel("risk")}>
          <h2>위험성평가</h2>
          <p className="wo-muted">
            {order.assessment_status === "APPROVED"
              ? "승인 완료"
              : order.assessment_status === "PENDING"
                ? "승인 대기"
                : "작성 중"}
            {d.performedOn && " · 실시일 " + d.performedOn}
            {" · 참여 "}
            {riskSnapshot
              ? riskSnapshot.participants
                  .map((p) => p.snapshot_display_name)
                  .join(", ")
              : d.participantIds
                  .map((id) => names.get(id) || "소속 변경된 구성원")
                  .join(", ") || "미선택"}
          </p>
          {risks.map((r, i) => (
            <article className="wo-risk" key={i}>
              <h3>
                {i + 1}. {r.hazard || "위험요인 미입력"}
                <span className="wo-risk-level">
                  {LEVELS[r.level]} ·{" "}
                  {r.allowable === "yes" ? "허용 가능" : "조치 필요"}
                </span>
              </h3>
              {r.currentControl && (
                <p className="wo-detail-text">
                  현재 안전조치: {r.currentControl}
                </p>
              )}
              <p className="wo-detail-text">{r.measure || "감소대책 미입력"}</p>
              {(r.responsibleId || r.dueDate) && (
                <p className="wo-muted">
                  {r.responsibleId &&
                    "담당 " + (r.responsibleName || "소속 변경된 구성원")}
                  {r.responsibleId && r.dueDate && " · "}
                  {r.dueDate && "예정일 " + r.dueDate}
                </p>
              )}
            </article>
          ))}
          {safetyRows.length > 0 && (
            <>
              <h3>사전조사 정보</h3>
              {safetyRows.map(([key, title]) => (
                <p className="wo-detail-text" key={key}>
                  <strong>{title}</strong> {safety[key]}
                </p>
              ))}
            </>
          )}
        </section>
        <section {...panel("schedule")}>
          <h2>일정·인원</h2>
          {/* 회차 목록이 곧 기간이다. 목록이 없는 옛 지시서만 한 줄로. */}
          {sessionsDraft.length === 0 && <p>{printPeriod}</p>}
          {sessionsDraft.length > 0 && (
            <ul className="wo-session-list">
              {sessionsDraft.map((s, i) => (
                <li
                  key={i}
                  data-today={
                    s.date === todaySession?.work_date ? "" : undefined
                  }
                >
                  {dayLabel(s.date)} {s.startTime} ~ {s.endTime}
                  {s.endTime <= s.startTime ? " (다음 날)" : ""}
                </li>
              ))}
            </ul>
          )}
          <h3>배정 인원</h3>
          <p>{assigneeNames}</p>
        </section>
        <section {...panel("checklist")}>
          <h2>체크리스트</h2>
          {(
            [
              ["TBM", "tbm", "TBM · 작업 전"],
              ["DURING_WORK", "during", "작업 중"],
            ] as const
          ).map(([category, key, title]) => (
            <div key={category}>
              <h3>{title}</h3>
              <ol className="wo-detail-list">
                {(issued
                  ? detail.checklist
                      .filter((c) => c.category === category)
                      .map((c) => c.text)
                  : d[key]
                ).map((text, i) => (
                  <li key={i}>{text || "미입력"}</li>
                ))}
              </ol>
            </div>
          ))}
        </section>
        {qr && (
          <section {...panel("qr")}>
            <h2>작업지시 QR</h2>
            <Image
              src={qr}
              width={180}
              height={180}
              alt="이 작업지시를 여는 QR 코드"
              unoptimized
              className="wo-qr"
            />
            {/* 관리자는 아래 복사 칸에 같은 주소가 있다. */}
            {!isManager && <p className="wo-detail-text">{url}</p>}
            {isManager && (
              <div className="wo-no-print">
                {/* 인쇄물은 화면 문서 전체가 아니라 현장 게시용 A4 한 장이다. */}
                <PrintButton allowed={canPrint} />
                <CopyLinkButton url={url} />
                <h3>이메일 전달 상태</h3>
                <ul className="wo-detail-list">
                  {detail.outputs.map((o) => (
                    <li key={o.user_id}>
                      {names.get(o.user_id) || "배정 인원"}:{" "}
                      {DELIVERY[o.status] || o.status}
                    </li>
                  ))}
                </ul>
                {active && (
                  <OrderCommand
                    id={id}
                    revision={order.revision}
                    command="send"
                    label="미전달 링크 다시 보내기"
                  />
                )}
              </div>
            )}
          </section>
        )}
        {isManager && (
          <details className="std-fold wo-fold wo-history-fold wo-no-print">
            <summary>변경 이력</summary>
            <ul className="wo-history">
              {detail.history.map((h, i) => (
                <li key={i}>
                  <time>{shortTime(h.at)}</time>
                  <span>
                    {ACTIONS[h.action] || h.action}
                    {h.is_self_approval ? " · 본인 승인" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
        {isManager && active && (
          <div className="wo-no-print wo-cancel-row">
            <OrderCommand
              id={id}
              revision={order.revision}
              command="cancel"
              label="지시서 취소"
              confirmText="이 작업지시를 취소하시겠습니까? 기존 기록은 보존됩니다."
            />
          </div>
        )}
      </div>
    </OrderShell>
  );
}

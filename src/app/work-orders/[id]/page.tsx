import Link from "next/link";
import Image from "next/image";
import QRCode from "qrcode";
import { ArrowLeft, Copy, Pencil } from "lucide-react";
import { notFound } from "next/navigation";
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
  PrintTimestamp,
  CopyLinkButton,
} from "@/features/work-orders/order-controls";
import { PageHeader } from "@/components/ui/page-header";
import { InspectionSummary } from "@/features/inspections/inspection-summary";
import { sessionState } from "@/features/inspections/model";
import { withTransaction } from "@/server/db";
import { readPermit } from "@/server/ptw-service";

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
export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ via?: string; tab?: string }>;
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
   * 발급된 지시서는 한 장짜리 긴 문서가 아니라 작성할 때와 같은 단계로 읽는다.
   * "3번에 뭘 넣었더라" 를 같은 자리에서 찾게 하려는 것이고, 발급 직후 정작
   * 할 일(QR 붙이기·링크 전달)이 스크롤 맨 아래 있던 문제도 같이 풀린다.
   * QR 탭은 발급 후에만 생긴다 — 없는 QR 자리를 미리 만들지 않는다.
   */
  const TABS = [
    { key: "info", label: "작업 정보" },
    { key: "risk", label: "위험성평가" },
    { key: "schedule", label: "일정·인원" },
    { key: "checklist", label: "체크리스트" },
    ...(qr ? [{ key: "qr", label: "QR·전달" }] : []),
  ];
  // 작업자에게 필요한 건 탭이 아니라 "내가 할 일" 이라, 탭은 관리자 화면에서만 쓴다.
  const tabbed = isManager;
  const tab = TABS.some((t) => t.key === query.tab) ? query.tab! : "info";
  const tabHref = (key: string) =>
    `/work-orders/${id}?tab=${key}` + (via !== "web" ? "&via=" + via : "");
  /**
   * 안 보이는 탭도 DOM 에는 남긴다. 지시서는 법정 서류라 인쇄는 언제나 전체가
   * 한 장으로 나와야 하고, 그건 hidden 을 print 에서만 푸는 것으로 해결된다.
   */
  const panel = (key: string, extra = "") => ({
    className: "wo-section wo-tabpanel" + (extra ? " " + extra : ""),
    hidden: tabbed && tab !== key,
  });
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
        criteria_snapshot: string;
        safety_info: WorkDraft["safetyInfo"];
        items: Array<{
          hazard: string;
          initial_risk_level: string;
          initial_allowable: boolean;
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
      }
    | undefined;
  const linkedStandardId = standardMeta?.standard_id ?? d.standardId ?? null;
  const linkedStandardName = standardMeta?.standard_name ?? null;
  const risks =
    riskSnapshot?.items.map((r) => ({
      hazard: r.hazard,
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
  return (
    <OrderShell session={session} title="지시서 상세">
      <div className="wo-print">
        <PageHeader
          title={order.name}
          description={
            d.groupLabel
              ? d.groupLabel + " · " + d.location
              : d.location || "장소 미입력"
          }
          actions={
            <div className="wo-actions wo-no-print">
              <Link className="btn-secondary" href="/work-orders">
                <ArrowLeft size={14} /> 목록
              </Link>
              {isManager && order.status === "DRAFT" && (
                <Link
                  className="btn-secondary"
                  href={"/work-orders/" + id + "/edit"}
                >
                  <Pencil size={14} /> 편집
                </Link>
              )}
              {isManager && (
                <Link
                  className="btn-secondary"
                  href={"/work-orders/new?copy=" + id}
                >
                  <Copy size={14} /> 복사
                </Link>
              )}
            </div>
          }
        />
        <p className="wo-print-meta">
          지시서 {id} ·{" "}
          {issued ? "발행 버전 " + order.issue_version : "작성 중"}
          {order.issued_at && " · 발급 " + dateTime(order.issued_at)} · 출력
          기준시각 <PrintTimestamp initial={new Date().toISOString()} />{" "}
          (한국시간)
        </p>
        {linkedStandardId && (
          <p className="wo-standard-chip">
            표준서 기반
            {linkedStandardName ? (
              <>
                {" · "}
                <Link href={"/standards/" + linkedStandardId}>
                  {linkedStandardName}
                </Link>
              </>
            ) : (
              <>
                {" · "}
                <Link href={"/standards/" + linkedStandardId}>표준서 열기</Link>
              </>
            )}
          </p>
        )}
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
                  필요 ·{" "}
                  {permit?.status === "APPROVED" ? "승인" : "허가 상태 확인"}
                  {permit?.self_approval ? " · 자가 승인 건" : ""}
                </Link>
              ) : isManager && actor.userId === order.created_by ? (
                <Link href={"/work-orders/" + id + "/permit"}>
                  불필요 · 추가 허가 신청
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
                : detail.currentSession
                  ? `${detail.currentSession.expected_assignees.length - sessionState(detail.currentSession, new Date(detail.inspectionNow)).missing.length}/${detail.currentSession.expected_assignees.length}명 확인`
                  : "해당 회차 없음"}
            </strong>
          </div>
          <div>
            <small>미조치 부적합</small>
            <strong>{detail.openFindings}건</strong>
          </div>
        </div>
        {order.status === "CANCELED" && (
          <p role="status" className="wo-notice">
            취소된 지시서입니다. 작업·점검에 사용하지 마세요.
            <br />
            취소 사유: {order.cancel_reason}
          </p>
        )}
        {order.status === "COMPLETED" && (
          <p className="wo-notice">
            작업기간이 종료되었습니다. 안전조치 완료를 의미하지 않습니다.
          </p>
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
        {tabbed && (
          <nav className="wo-tabs wo-no-print" aria-label="지시서 구성">
            {TABS.map((t, i) => (
              <Link
                key={t.key}
                href={tabHref(t.key)}
                aria-current={tab === t.key ? "page" : undefined}
              >
                <span>{i + 1}</span>
                {t.label}
              </Link>
            ))}
          </nav>
        )}
        <section {...panel("info")}>
          <h2>작업 정보</h2>
          <p className="wo-detail-text">
            {typeof method === "string"
              ? method
              : d.method || "작업방법 미입력"}
          </p>
        </section>
        <section {...panel("schedule")}>
          <h2>일정·인원</h2>
          <p>
            {d.startDate || "미입력"} ~ {d.endDate || "미입력"} · 매일{" "}
            {d.startTime} ~ {d.endTime}
            {d.endTime <= d.startTime ? " (다음 날 종료)" : ""}
          </p>
          <h3>배정 인원</h3>
          <p>
            {issued
              ? detail.assignments
                  .map((m) => m.snapshot_display_name)
                  .join(", ")
              : d.assigneeIds
                  .map((id) => names.get(id) || "소속 변경된 구성원")
                  .join(", ") || "배정 없음"}
          </p>
        </section>
        <section {...panel("risk")}>
          <h2>간이 위험성평가</h2>
          <p>
            {order.assessment_status === "APPROVED"
              ? "승인 완료"
              : order.assessment_status === "PENDING"
                ? "승인 대기"
                : "작성 중"}{" "}
            · 실시일 {d.performedOn || "미입력"}
            {order.approved_at && " · 승인 " + dateTime(order.approved_at)}
          </p>
          {order.assessment_status === "APPROVED" &&
            order.approved_by === order.assessment_created_by && (
              <p className="wo-muted">
                관리자 본인 평가 승인 기록이 있습니다. PTW 자가 승인과는
                별개입니다.
              </p>
            )}
          <h3>적용한 판단 기준</h3>
          <p className="wo-detail-text">
            {riskSnapshot?.criteria_snapshot ?? (d.criteria || "미입력")}
          </p>
          {risks.map((r, i) => (
            <article className="wo-risk" key={i}>
              <h3>
                {i + 1}. {r.hazard || "위험요인 미입력"}
              </h3>
              <p>
                수준: {LEVELS[r.level]} ·{" "}
                {r.allowable === "yes"
                  ? "허용 가능"
                  : r.allowable === "no"
                    ? "허용 불가 · 조치 필요"
                    : "허용 여부 미선택"}
              </p>
              <p className="wo-detail-text">{r.measure || "감소대책 미입력"}</p>
              {r.responsibleId && (
                <p>조치 담당자: {r.responsibleName || "소속 변경된 구성원"}</p>
              )}
              {r.dueDate && <p>조치 예정일: {r.dueDate}</p>}
            </article>
          ))}
          <h3>사전조사 정보</h3>
          {(
            [
              ["equipment", "기계·설비"],
              ["materials", "유해물질·MSDS"],
              ["environment", "주변 환경"],
              ["history", "재해·아차사고 이력"],
            ] as const
          ).map(([key, title]) => (
            <div key={key}>
              <strong>{title}</strong>
              <p className="wo-detail-text">{safety[key] || "미입력"}</p>
            </div>
          ))}
          <h3>평가 참여자</h3>
          <p>
            {riskSnapshot
              ? riskSnapshot.participants
                  .map((p) => p.snapshot_display_name)
                  .join(", ")
              : d.participantIds
                  .map((id) => names.get(id) || "소속 변경된 구성원")
                  .join(", ") || "미선택"}
          </p>
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
        {isManager && order.status === "DRAFT" && (
          <section {...panel("checklist", "wo-no-print")}>
            <h2>검토 및 발급</h2>
            {order.assessment_status !== "APPROVED" && !d.ptwRequired && (
              <>
                <p className="wo-muted">
                  작성한 관리자도 내용을 검토한 뒤 직접 승인하고 발급할 수
                  있습니다. 평가 승인자와 본인 승인 여부가 기록됩니다.
                </p>
                <OrderCommand
                  id={id}
                  revision={order.revision}
                  command="approveIssue"
                  label="평가 승인 후 발급"
                  confirmText="위험요인·판단 기준·감소대책·참여자 기록을 검토했으며, 평가를 승인하고 작업지시를 발급하시겠습니까? 발급 후 내용이 고정되고 배정 인원에게 이메일 링크가 발송됩니다."
                />
              </>
            )}
            {!order.assessment_status && (
              <OrderCommand
                id={id}
                revision={order.revision}
                command="request"
                label="평가 검토 요청"
              />
            )}
            {order.assessment_status === "PENDING" && (
              <>
                <p className="wo-muted">
                  다른 관리자가 평가만 먼저 승인할 수도 있습니다. 지시서
                  자체에는 별도 승인 절차가 없습니다.
                </p>
                <OrderCommand
                  id={id}
                  revision={order.revision}
                  command="approve"
                  label="위험성평가 승인"
                  confirmText="위험요인·판단 기준·대책·참여자 기록을 검토했으며, 이 평가를 승인하시겠습니까?"
                />
              </>
            )}
            {order.assessment_status === "APPROVED" && !d.ptwRequired && (
              <OrderCommand
                id={id}
                revision={order.revision}
                command="issue"
                label="작업지시 발급"
                confirmText="발급하면 내용이 고정되고 배정 인원에게 이메일 링크가 발송됩니다. 발급하시겠습니까?"
              />
            )}
            {d.ptwRequired && (
              <p className="wo-notice">
                <Link href={"/work-orders/" + id + "/permit"}>
                  위험성평가 검토 및 PTW 신청
                </Link>{" "}
                · 허가 승인 시 지시서가 자동 발급됩니다.
              </p>
            )}
          </section>
        )}
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
            <p className="wo-detail-text">{url}</p>
            <p className="wo-muted">
              로그인 후 같은 회사의 관리자 또는 배정 인원만 열람할 수 있습니다.
              출력 이후에는 링크에서 최신 상태를 확인하세요.
            </p>
            {isManager && (
              <div className="wo-no-print">
                {/* 인쇄는 탭과 무관하게 지시서 전체가 한 장으로 나간다
                    (globals.css @media print 에서 숨긴 탭을 모두 편다). */}
                <PrintButton />
                <p className="wo-muted">
                  인쇄 창에서 대상을 &lsquo;PDF로 저장&rsquo; 으로 바꾸면 PDF
                  파일이 됩니다. 어느 탭을 보고 있든 지시서 전체가 출력됩니다.
                </p>
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
                <p className="wo-muted">
                  한 번에 최대 50명에게 전달합니다. 재시도는 1분 후 가능하며,
                  발송 완료는 메일 서비스 접수 결과입니다. 수신함 도착을
                  보장하지 않습니다.
                </p>
              </div>
            )}
          </section>
        )}
        {isManager && active && (
          <section className="wo-section wo-no-print">
            <h2>지시서 취소</h2>
            <OrderCommand
              id={id}
              revision={order.revision}
              command="cancel"
              label="지시서 취소"
              confirmText="이 작업지시를 취소하시겠습니까? 기존 기록은 보존됩니다."
            />
          </section>
        )}
        {isManager && (
          <section className="wo-section wo-no-print">
            <h2>변경 이력</h2>
            <ul className="wo-history">
              {detail.history.map((h, i) => (
                <li key={i}>
                  <time>{dateTime(h.at)}</time>
                  <span>
                    {ACTIONS[h.action] || h.action}
                    {h.is_self_approval ? " · 본인 승인" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </OrderShell>
  );
}

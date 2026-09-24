import Link from "next/link";
import { OrderCommand } from "./order-controls";

/**
 * 저장된 초안의 검토·발급 명령. 편집 화면의 마지막 단계 뒤에 붙는다.
 *
 * 본인이 바로 발급하는 길은 폼의 [지금 발급하기] 가 맡는다 (저장까지 한 번에).
 * 여기 있는 것은 다른 관리자가 평가를 검토·승인하는 흐름과 PTW 안내다.
 * 이 명령들은 마지막 임시저장본에 작동하므로, 폼이 고쳐진 상태에서는
 * WorkOrderForm 이 이 블록을 잠근다.
 */
export function DraftReview({
  id,
  revision,
  assessmentStatus,
  performedOn,
  approvedAt,
  ptwRequired,
}: {
  id: string;
  revision: number;
  assessmentStatus: string | null;
  performedOn: string;
  approvedAt: string | null;
  ptwRequired: boolean;
}) {
  return (
    <>
      <h2>검토·발급</h2>
      <p>
        위험성평가{" "}
        {assessmentStatus === "APPROVED"
          ? "승인 완료"
          : assessmentStatus === "PENDING"
            ? "승인 대기"
            : "작성 중"}{" "}
        · 실시일 {performedOn || "미입력"}
        {approvedAt &&
          " · 승인 " +
            new Date(approvedAt).toLocaleString("ko-KR", {
              timeZone: "Asia/Seoul",
            })}
      </p>
      {!assessmentStatus && (
        <>
          <p className="wo-muted">
            위험성평가를 다른 관리자가 검토·승인하게 하려면 요청하세요.
          </p>
          <OrderCommand
            id={id}
            revision={revision}
            command="request"
            label="평가 검토 요청"
          />
        </>
      )}
      {assessmentStatus === "PENDING" && (
        <>
          <p className="wo-muted">
            다른 관리자가 평가만 먼저 승인할 수도 있습니다. 지시서 자체에는 별도
            승인 절차가 없습니다. 내용을 고쳐 저장하면 요청이 해제됩니다.
          </p>
          <OrderCommand
            id={id}
            revision={revision}
            command="approve"
            label="위험성평가 승인"
            confirmText="위험요인·판단 기준·대책·참여자 기록을 검토했으며, 이 평가를 승인하시겠습니까?"
          />
        </>
      )}
      {assessmentStatus === "APPROVED" && !ptwRequired && (
        <OrderCommand
          id={id}
          revision={revision}
          command="issue"
          label="작업지시 발급"
          confirmText="발급하면 내용이 고정되고 배정 인원에게 이메일 링크가 발송됩니다. 발급하시겠습니까?"
        />
      )}
      {ptwRequired && (
        <p className="wo-muted">
          위험작업허가는 위 <strong>지금 발급하기</strong>가 신청까지 함께
          합니다. 신청 상태와 승인자 변경은{" "}
          <Link href={"/work-orders/" + id + "/permit"}>위험작업허가 화면</Link>
          에서 봅니다.
        </p>
      )}
    </>
  );
}

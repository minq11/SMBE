import { query } from "./db";
import { escapeHtml, sendEmail } from "./email";
import { appOrigin } from "./config";

/**
 * 회사코드로 가입 신청이 들어왔을 때 관리자에게 알린다.
 *
 * 신청은 `JOIN_PENDING` 행 하나를 남길 뿐이라, 관리자가 인원관리 화면을 직접
 * 열어 보기 전에는 신청이 있는 줄도 모른다. 신청한 사람은 기다리다 전화를 하게
 * 된다. 그래서 메일로 먼저 알린다 (화면 알림은 홈에도 함께 둔다).
 *
 * 받는 사람은 승인 권한이 있는 **관리감독자·안전관리자**다. 작업자에게 보내면
 * 자기가 할 수 없는 일을 통보받는 셈이 된다.
 *
 * **발송 실패가 가입을 막지 않는다.** 신청은 이미 저장됐고, 메일은 거들 뿐이다.
 * 지시서·PTW 발송과 같은 규칙이다.
 */
export async function notifyJoinRequest(input: {
  companyId: string;
  companyName: string;
  applicantName: string;
}) {
  const managers = await query<{ email: string }>(
    `SELECT COALESCE(u.contact_email, u.email) AS email
       FROM company_members m JOIN users u ON u.id = m.user_id
      WHERE m.company_id = $1 AND m.status = 'ACTIVE' AND m.left_at IS NULL
        AND m.role IN ('MANAGER_SUPERVISOR','MANAGER_SAFETY')
        AND u.status = 'ACTIVE'
        AND COALESCE(u.contact_email, u.email) IS NOT NULL
      ORDER BY u.display_name LIMIT 50`,
    [input.companyId],
  );
  if (!managers.length) return { notified: 0 };

  // 인원관리 화면은 승인 대기가 있으면 그 탭을 먼저 연다.
  const url = appOrigin() + "/company/members";
  const subject = `[SMBE] ${input.applicantName} 님이 ${input.companyName} 참여를 요청했습니다`;
  const text = [
    `${input.applicantName} 님이 회사코드로 ${input.companyName} 참여를 요청했습니다.`,
    "",
    "인원관리 > 가입 승인 대기 에서 승인하거나 거절할 수 있습니다.",
    "승인 전에는 작업에 배정할 수 없으니, 현장에 바로 투입할 사람이면 먼저 승인하세요.",
    "",
    `승인하러 가기: ${url}`,
  ].join("\n");
  const applicant = escapeHtml(input.applicantName);
  const company = escapeHtml(input.companyName);
  const html =
    `<p><strong>${applicant}</strong> 님이 회사코드로 <strong>${company}</strong> 참여를 요청했습니다.</p>` +
    `<p>인원관리 &gt; 가입 승인 대기 에서 승인하거나 거절할 수 있습니다. <strong>승인 전에는 작업에 배정할 수 없으니</strong>, 현장에 바로 투입할 사람이면 먼저 승인하세요.</p>` +
    `<p><a href="${url}">승인하러 가기</a></p>`;

  let notified = 0;
  for (const manager of managers) {
    const result = await sendEmail({
      to: manager.email,
      subject,
      html,
      text,
    });
    if (result.status === "sent") notified += 1;
  }
  return { notified };
}

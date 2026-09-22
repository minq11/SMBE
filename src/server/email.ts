import "server-only";

import { Resend } from "resend";

export type SendResult =
  | { status: "sent"; id: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; error: string };

let cached: Resend | null | undefined;

function getClient(): Resend | null {
  if (cached !== undefined) return cached;
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    cached = null;
    return cached;
  }
  cached = new Resend(key);
  return cached;
}

function fromAddress(): string | null {
  const value = process.env.EMAIL_FROM?.trim();
  return value && value.length > 0 ? value : null;
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  idempotencyKey?: string;
}): Promise<SendResult> {
  const client = getClient();
  const from = fromAddress();
  if (!client) {
    return { status: "skipped", reason: "RESEND_API_KEY 미설정" };
  }
  if (!from) {
    return { status: "skipped", reason: "EMAIL_FROM 미설정" };
  }

  try {
    const result = await client.emails.send(
      {
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        replyTo: input.replyTo,
      },
      input.idempotencyKey
        ? { idempotencyKey: input.idempotencyKey }
        : undefined,
    );
    if (result.error) {
      return { status: "failed", error: result.error.message };
    }
    return { status: "sent", id: result.data?.id ?? "" };
  } catch (error) {
    return {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function inviteEmailTemplate(input: {
  companyName: string;
  inviterName: string;
  roleLabel: string;
  acceptUrl: string;
  expiresAt: Date | null;
}): { subject: string; html: string; text: string } {
  const { companyName, inviterName, roleLabel, acceptUrl, expiresAt } = input;
  const expiryLine = expiresAt
    ? `이 링크는 ${expiresAt.toLocaleDateString("ko-KR")}까지 유효합니다.`
    : "";

  const subject = `[SMBE] ${companyName} 안전관리에 초대되셨습니다`;

  const html = `<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1e2429;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e8eaee;border-radius:16px;padding:36px 32px;">
            <tr>
              <td style="padding-bottom:20px;">
                <div style="font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#1e2429;">
                  Safety must be <span style="color:#e96935;font-style:italic;">easy.</span>
                </div>
              </td>
            </tr>
            <tr>
              <td style="font-size:16px;font-weight:700;padding-bottom:8px;">
                ${escapeHtml(companyName)} 안전관리에 초대되셨습니다
              </td>
            </tr>
            <tr>
              <td style="font-size:14px;color:#4a545e;line-height:1.7;padding-bottom:20px;">
                ${escapeHtml(inviterName)} 님이 ${escapeHtml(roleLabel)} 역할로 회원님을 초대했습니다.
                아래 버튼을 눌러 로그인하시면 승인 절차 없이 바로 회사에 소속됩니다.
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:24px;">
                <a href="${escapeAttr(acceptUrl)}"
                   style="display:inline-block;padding:12px 22px;background:#e96935;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">
                  초대 수락하고 시작하기
                </a>
              </td>
            </tr>
            <tr>
              <td style="font-size:12px;color:#7a838d;line-height:1.7;padding-bottom:8px;">
                ${expiryLine ? escapeHtml(expiryLine) + "<br />" : ""}
                버튼이 열리지 않으면 아래 주소를 브라우저에 붙여넣으세요.
              </td>
            </tr>
            <tr>
              <td style="font-size:11px;color:#4a545e;word-break:break-all;padding-bottom:20px;">
                <a href="${escapeAttr(acceptUrl)}" style="color:#4a545e;">${escapeHtml(acceptUrl)}</a>
              </td>
            </tr>
            <tr>
              <td style="border-top:1px solid #eef0f3;padding-top:16px;font-size:11px;color:#b0b7bf;">
                본 메일은 SMBE 초대 링크 발송 시스템에서 자동으로 발송되었습니다.
                초대 요청을 보내신 적이 없다면 이 메일을 무시하셔도 됩니다.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `${companyName} 안전관리에 초대되셨습니다.`,
    "",
    `${inviterName} 님이 ${roleLabel} 역할로 초대했습니다.`,
    "아래 링크를 열어 로그인하시면 승인 없이 바로 소속됩니다.",
    "",
    acceptUrl,
    "",
    expiryLine,
    "",
    "본 메일은 SMBE 초대 시스템에서 자동으로 발송되었습니다.",
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}

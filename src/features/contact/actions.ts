"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { sendEmail } from "@/server/email";

export type ContactValues = {
  name?: string;
  email?: string;
  company?: string;
  topic?: string;
  message?: string;
};

export type ContactState =
  | undefined
  | { error?: string; ok?: boolean; values?: ContactValues };

const TOPIC_VALUES = ["PRE_REGISTER", "QUESTION", "OTHER"] as const;
type Topic = (typeof TOPIC_VALUES)[number];

const TOPIC_LABEL: Record<Topic, string> = {
  PRE_REGISTER: "사전 예약",
  QUESTION: "서비스 문의",
  OTHER: "기타",
};

const contactSchema = z.object({
  name: z.string().trim().min(1, "이름을 입력하세요").max(60),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("이메일 형식을 확인하세요")
    .max(180),
  company: z.string().trim().max(80).optional().or(z.literal("")),
  topic: z.enum(TOPIC_VALUES),
  message: z
    .string()
    .trim()
    .min(5, "메시지를 5자 이상 입력하세요")
    .max(2000, "메시지가 너무 깁니다"),
  website: z.string().max(0, "잘못된 요청").optional(), // honeypot: 봇이 채우면 여기가 비어있지 않음
});

function inboxAddress(): string {
  return process.env.CONTACT_INBOX?.trim() || "hi@smbe.net";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function submitContactAction(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  // 폼 리렌더 시 입력값 복원용 스냅샷
  const submitted: ContactValues = {
    name: (formData.get("name") ?? "").toString(),
    email: (formData.get("email") ?? "").toString(),
    company: (formData.get("company") ?? "").toString(),
    topic: (formData.get("topic") ?? "").toString(),
    message: (formData.get("message") ?? "").toString(),
  };

  const parsed = contactSchema.safeParse({
    name: submitted.name,
    email: submitted.email,
    company: submitted.company ?? "",
    topic: submitted.topic,
    message: submitted.message,
    website: formData.get("website") ?? "",
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "입력 값을 확인하세요",
      values: submitted,
    };
  }

  // 봇 필드에 값이 있으면 조용히 성공 응답 (스팸 봇에게 오류 힌트 주지 않기)
  if (parsed.data.website && parsed.data.website.length > 0) {
    return { ok: true };
  }

  const { name, email, company, topic, message } = parsed.data;
  const topicLabel = TOPIC_LABEL[topic];

  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "-";
  const userAgent = h.get("user-agent") ?? "-";

  const subject = `[SMBE ${topicLabel}] ${name}`;
  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1e2429;line-height:1.6;">
  <table cellpadding="0" cellspacing="0" style="max-width:600px;">
    <tr><td style="padding-bottom:12px;font-size:16px;font-weight:700;">SMBE 문의 접수</td></tr>
    <tr><td>
      <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="color:#7a838d;">유형</td><td>${escapeHtml(topicLabel)}</td></tr>
        <tr><td style="color:#7a838d;">이름</td><td>${escapeHtml(name)}</td></tr>
        <tr><td style="color:#7a838d;">이메일</td><td><a href="mailto:${escapeHtml(email)}" style="color:#e96935;">${escapeHtml(email)}</a></td></tr>
        <tr><td style="color:#7a838d;">회사</td><td>${escapeHtml(company || "-")}</td></tr>
      </table>
    </td></tr>
    <tr><td style="padding-top:12px;font-weight:700;">메시지</td></tr>
    <tr><td style="white-space:pre-wrap;background:#f6f7f9;border:1px solid #e8eaee;border-radius:8px;padding:14px;font-size:14px;">${escapeHtml(message)}</td></tr>
    <tr><td style="padding-top:16px;color:#b0b7bf;font-size:11px;">
      IP ${escapeHtml(ip)} · UA ${escapeHtml(userAgent)} · ${new Date().toISOString()}
    </td></tr>
  </table>
</body></html>`;

  const text = [
    `SMBE 문의 접수`,
    ``,
    `유형: ${topicLabel}`,
    `이름: ${name}`,
    `이메일: ${email}`,
    `회사: ${company || "-"}`,
    ``,
    `메시지:`,
    message,
    ``,
    `---`,
    `IP ${ip}`,
    `UA ${userAgent}`,
    `${new Date().toISOString()}`,
  ].join("\n");

  const result = await sendEmail({
    to: inboxAddress(),
    subject,
    html,
    text,
    replyTo: email,
  });

  if (result.status === "failed") {
    return {
      error: `문의 전송에 실패했습니다 (${result.error}). 잠시 후 다시 시도해 주세요.`,
      values: submitted,
    };
  }
  if (result.status === "skipped") {
    return {
      error:
        "지금 문의 접수가 어려워요. 직접 hi@smbe.net 으로 메일을 보내주시면 확인하겠습니다.",
      values: submitted,
    };
  }
  return { ok: true };
}

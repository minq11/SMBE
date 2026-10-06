import { z } from "zod";

/**
 * 메일·문자로 내보내는 링크의 기준 주소.
 * 발송(work-order-delivery)과 링크 토큰(worker-access) 양쪽이 쓰므로
 * 둘 사이에 순환 참조가 생기지 않도록 여기에 둔다.
 */
const UNROUTABLE = /^(0\.0\.0\.0|localhost|127\.0\.0\.1|\[::\]|::1)$/;

/**
 * APP_URL 이 밖에서 열 수 있는 주소면 그 origin, 아니면 null. 운영에서 0.0.0.0·
 * localhost 가 적혀 있으면 없는 것으로 친다 — 그 주소로 메일을 보내면 아무도 못 연다.
 * 개발에서는 localhost 를 그대로 쓴다.
 */
export function configuredOrigin(): string | null {
  const raw = process.env.APP_URL?.trim();
  if (!raw) return null;
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("APP_URL을 확인하세요.");
  if (UNROUTABLE.test(url.hostname) && process.env.NODE_ENV === "production")
    return null;
  return url.origin;
}

/** 요청 밖(크론·푸시)에서 쓰는 기준 주소. 요청 안에서는 request-origin.ts 를 쓴다. */
export function appOrigin() {
  return configuredOrigin() ?? "http://localhost:3000";
}

// No eager validation: the UI and image build must work without cloud secrets.
export function databaseUrl() {
  return z
    .string()
    .url()
    .refine((value) => {
      const url = new URL(value);
      return (
        ["postgres:", "postgresql:"].includes(url.protocol) &&
        url.hostname.endsWith(".neon.tech") &&
        ["require", "verify-full"].includes(
          url.searchParams.get("sslmode") ?? "",
        )
      );
    }, "Use a Neon PostgreSQL URL with sslmode=require or verify-full")
    .parse(process.env.DATABASE_URL);
}
export function storageConfig() {
  return z
    .object({
      region: z.string().min(1),
      bucket: z.string().min(3),
      accessKeyId: z.string().min(1),
      secretAccessKey: z.string().min(1),
      sessionToken: z.string().optional(),
    })
    .parse({
      region: process.env.AWS_REGION,
      bucket: process.env.S3_BUCKET,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      sessionToken: process.env.AWS_SESSION_TOKEN || undefined,
    });
}

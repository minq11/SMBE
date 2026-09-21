import { z } from "zod";

/**
 * 메일·문자로 내보내는 링크의 기준 주소.
 * 발송(work-order-delivery)과 링크 토큰(worker-access) 양쪽이 쓰므로
 * 둘 사이에 순환 참조가 생기지 않도록 여기에 둔다.
 */
export function appOrigin() {
  const url = new URL(process.env.APP_URL || "http://localhost:3000");
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("APP_URL을 확인하세요.");
  return url.origin;
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

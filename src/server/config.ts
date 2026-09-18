import { z } from "zod";

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

import { neon } from "@neondatabase/serverless";
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { databaseUrl, storageConfig } from "./config";

export async function checkDatabase() {
  const sql = neon(databaseUrl(), {
    fetchOptions: { signal: AbortSignal.timeout(8000) },
  });
  await sql`SELECT 1 AS connected`;
}
export async function checkStorage() {
  const config = storageConfig();
  const client = new S3Client({
    region: config.region,
    maxAttempts: 1,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      sessionToken: config.sessionToken,
    },
  });
  try {
    await client.send(new HeadBucketCommand({ Bucket: config.bucket }), {
      abortSignal: AbortSignal.timeout(8000),
    });
  } finally {
    client.destroy();
  }
}
export async function connectionStatus() {
  const [database, storage] = await Promise.allSettled([
    checkDatabase(),
    checkStorage(),
  ]);
  // Never return SDK errors: they may include hosts, account IDs or credentials.
  return {
    database: database.status === "fulfilled" ? "ok" : "unavailable",
    storage: storage.status === "fulfilled" ? "ok" : "unavailable",
  };
}

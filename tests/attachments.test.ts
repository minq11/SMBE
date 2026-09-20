import { test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "@neondatabase/serverless";
import { S3Client } from "@aws-sdk/client-s3";
import {
  confirmUpload,
  deleteAttachment,
  listAttachments,
  presignUpload,
} from "../src/server/attachments";

// No dotenv, live DB or S3 calls: fail closed for unexpected SQL/network calls.
const actor = {
  companyId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
};
let role = "MANAGER_SUPERVISOR",
  pro = "ACTIVE",
  status = "PENDING";
let writes: unknown[][] = [];
beforeEach(() => {
  role = "MANAGER_SUPERVISOR";
  pro = "ACTIVE";
  status = "PENDING";
  writes = [];
  globalThis.__smbePgPool = {
    query: async (sql: string, params: unknown[]) => {
      if (sql.includes("FROM company_members"))
        return { rows: [{ role, pro_state: pro }] };
      if (sql.includes("SELECT true AS ok")) return { rows: [{ ok: true }] };
      if (sql.includes("SELECT storage_key"))
        return {
          rows: [
            {
              storage_key: "test",
              company_id: actor.companyId,
              status,
              target_type: "standard_step",
              target_id: actor.userId,
              mime_type: "image/png",
              size_bytes: "100",
            },
          ],
        };
      if (sql.includes("SELECT id, original_filename")) return { rows: [] };
      if (sql.includes("UPDATE attachments")) {
        writes.push(params);
        assert.match(sql, /status = 'PENDING'/);
        return { rows: [] };
      }
      throw new Error("Unexpected SQL: " + sql);
    },
  } as unknown as Pool;
  mock.method(S3Client.prototype, "send", async () => {
    throw new Error("Unexpected S3 request");
  });
});
afterEach(() => {
  globalThis.__smbePgPool = undefined;
  mock.restoreAll();
});
test("worker cannot delete or confirm another attachment", async () => {
  role = "WORKER";
  await assert.rejects(deleteAttachment(actor, actor.userId), /관리자/);
  await assert.rejects(confirmUpload(actor, actor.userId), /관리자/);
  assert.equal(writes.length, 0);
});
test("Free managers can list existing photos but cannot upload", async () => {
  pro = "FREE";
  assert.deepEqual(
    await listAttachments(actor, "standard_step", actor.userId),
    [],
  );
  await assert.rejects(
    presignUpload(actor, {
      targetType: "standard_step",
      targetId: actor.userId,
      filename: "a.png",
      mimeType: "image/png",
      sizeBytes: 100,
    }),
    /Pro/,
  );
});
test("unimplemented incident targets are rejected", async () => {
  await assert.rejects(
    presignUpload(actor, {
      targetType: "incident",
      targetId: actor.userId,
      filename: "a.png",
      mimeType: "image/png",
      sizeBytes: 100,
    }),
    /아직 지원/,
  );
});
test("confirmation validates actual size and type, ignores client size", async () => {
  for (const head of [
    { ContentLength: 101, ContentType: "image/png" },
    { ContentLength: 100, ContentType: "text/html" },
    { ContentLength: 0, ContentType: "image/png" },
  ]) {
    mock.method(S3Client.prototype, "send", async () => head);
    await assert.rejects(confirmUpload(actor, actor.userId), /크기 또는 형식/);
  }
  assert.equal(writes.length, 0);
  mock.method(S3Client.prototype, "send", async () => ({
    ContentLength: 100,
    ContentType: "image/png",
  }));
  await confirmUpload(actor, actor.userId, { sizeBytes: 999 });
  assert.equal(writes[0][1], 100);
});
test("deleted attachment cannot be revived", async () => {
  status = "DELETED";
  await assert.rejects(confirmUpload(actor, actor.userId), /잘못된 상태/);
  assert.equal(writes.length, 0);
});

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
  status = "PENDING",
  targetType = "standard_step",
  uploadedBy = actor.userId;
let writes: unknown[][] = [];
beforeEach(() => {
  role = "MANAGER_SUPERVISOR";
  pro = "ACTIVE";
  status = "PENDING";
  targetType = "standard_step";
  uploadedBy = actor.userId;
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
              target_type: targetType,
              target_id: actor.userId,
              mime_type: "image/png",
              size_bytes: "100",
              uploaded_by: uploadedBy,
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
test("worker cannot touch manager-only documents", async () => {
  role = "WORKER";
  targetType = "standard_step";
  await assert.rejects(deleteAttachment(actor, actor.userId), /작업자/);
  await assert.rejects(confirmUpload(actor, actor.userId), /작업자/);
  assert.equal(writes.length, 0);
});
test("worker cannot delete or confirm someone else's attachment", async () => {
  role = "WORKER";
  targetType = "work_order";
  uploadedBy = "33333333-3333-4333-8333-333333333333";
  await assert.rejects(deleteAttachment(actor, actor.userId), /본인/);
  await assert.rejects(confirmUpload(actor, actor.userId), /본인/);
  assert.equal(writes.length, 0);
});
test("worker can confirm their own photo on a work order", async () => {
  role = "WORKER";
  targetType = "work_order";
  mock.method(S3Client.prototype, "send", async () => ({
    ContentLength: 100,
    ContentType: "image/png",
  }));
  await confirmUpload(actor, actor.userId);
  assert.equal(writes.length, 1);
});
test("Free blocks uploads whatever the role", async () => {
  pro = "FREE";
  role = "WORKER";
  targetType = "work_order";
  await assert.rejects(confirmUpload(actor, actor.userId), /Pro/);
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

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
const ORDER = "44444444-4444-4444-8444-444444444444";
const OTHER = "55555555-5555-4555-8555-555555555555";
/** 토큰 링크로 들어온 작업자. 범위가 작업지시 하나로 좁혀진다. */
const linkVisitor = { ...actor, linkWorkOrderId: ORDER };
let role = "MANAGER_SUPERVISOR",
  linkScope = true,
  pro = "ACTIVE",
  status = "PENDING",
  targetType = "standard_step",
  uploadedBy = actor.userId,
  stepRevisionStatus = "DRAFT";
let writes: unknown[][] = [];
beforeEach(() => {
  role = "MANAGER_SUPERVISOR";
  linkScope = true;
  pro = "ACTIVE";
  status = "PENDING";
  targetType = "standard_step";
  uploadedBy = actor.userId;
  stepRevisionStatus = "DRAFT";
  writes = [];
  globalThis.__smbePgPool = {
    query: async (sql: string, params: unknown[]) => {
      if (sql.includes("FROM company_members"))
        return { rows: [{ role, pro_state: pro }] };
      if (sql.includes("ws.work_order_id = $2"))
        return { rows: linkScope ? [{ ok: true }] : [] };
      if (sql.includes("SELECT true AS ok")) return { rows: [{ ok: true }] };
      if (sql.includes("JOIN standard_revisions r ON r.id = ss.revision_id"))
        return { rows: [{ status: stepRevisionStatus }] };
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
test("role never gates what a photo can be attached to", async () => {
  // 작업자도 표준서에 사진을 올린다 — 가르는 것은 요금제 하나뿐이다.
  role = "WORKER";
  targetType = "standard_step";
  mock.method(S3Client.prototype, "send", async () => ({
    ContentLength: 100,
    ContentType: "image/png",
  }));
  await confirmUpload(actor, actor.userId);
  assert.equal(writes.length, 1);
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
  await assert.rejects(confirmUpload(actor, actor.userId), /유료/);
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
    /유료/,
  );
});
test("link visitor stays inside the work order the token opens", async () => {
  role = "WORKER";
  assert.deepEqual(await listAttachments(linkVisitor, "work_order", ORDER), []);
  await assert.rejects(
    listAttachments(linkVisitor, "work_order", OTHER),
    /이 링크로/,
  );
});
test("link visitor stays inside the documents the link opens", async () => {
  // 역할 때문이 아니라 토큰이 여는 범위가 작업지시 하나이기 때문이다.
  role = "MANAGER_SUPERVISOR";
  await assert.rejects(
    listAttachments(linkVisitor, "standard_step", OTHER),
    /이 링크로/,
  );
});
test("link visitor reaches only results and findings from that work order", async () => {
  role = "WORKER";
  for (const target of ["inspection_result", "inspection_finding"] as const) {
    linkScope = true;
    assert.deepEqual(await listAttachments(linkVisitor, target, OTHER), []);
    linkScope = false;
    await assert.rejects(
      listAttachments(linkVisitor, target, OTHER),
      /이 링크로/,
    );
  }
});
test("a Free company blocks the link visitor's upload too", async () => {
  pro = "FREE";
  role = "WORKER";
  await assert.rejects(
    presignUpload(linkVisitor, {
      targetType: "work_order",
      targetId: ORDER,
      filename: "a.png",
      mimeType: "image/png",
      sizeBytes: 100,
    }),
    /유료/,
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

test("an approved edition's step photos are frozen; only a draft takes uploads and deletes", async () => {
  // 승인된 판은 고치지 않는다 (0023). 사진도 그 판의 내용이다.
  stepRevisionStatus = "APPROVED";
  await assert.rejects(
    presignUpload(actor, {
      targetType: "standard_step",
      targetId: actor.userId,
      filename: "a.png",
      mimeType: "image/png",
      sizeBytes: 100,
    }),
    /확정된 판/,
  );
  status = "READY";
  await assert.rejects(deleteAttachment(actor, actor.userId), /확정된 판/);
  assert.equal(writes.length, 0);
});

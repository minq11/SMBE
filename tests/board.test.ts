import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { PoolClient } from "@neondatabase/serverless";
import {
  activePopupNotices,
  boardStorageUsed,
  createDraft,
  deletePost,
  listPosts,
  readPost,
  savePost,
} from "../src/server/board";
import {
  docText,
  parseDoc,
  renderDoc,
  type BoardDoc,
} from "../src/features/board/model";

// Deliberately never reads DATABASE_URL or dotenv: tests cannot touch Neon.
const schema = "board_" + randomUUID().replaceAll("-", "");
const pool = new Pool({
  connectionString:
    "postgresql://postgres:smbe-test-only@127.0.0.1:55439/smbe_regression",
  options: `-c search_path=${schema},public`,
});
const setupPool = new Pool({
  connectionString:
    "postgresql://postgres:smbe-test-only@127.0.0.1:55439/smbe_regression",
});
async function transaction<T>(fn: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client as unknown as PoolClient);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
before(async () => {
  await setupPool.query(
    "CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA public",
  );
  await setupPool.query("CREATE EXTENSION IF NOT EXISTS citext SCHEMA public");
  await pool.query(`CREATE SCHEMA ${schema}`);
  for (const file of (await readdir(new URL("../db/", import.meta.url)))
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort()) {
    await pool.query(
      await readFile(new URL("../db/" + file, import.meta.url), "utf8"),
    );
  }
});
after(async () => {
  await pool.query(`DROP SCHEMA ${schema} CASCADE`);
  await pool.end();
  await setupPool.end();
});

async function user(name = "test") {
  return (
    await pool.query(
      "INSERT INTO users (display_name) VALUES ($1) RETURNING id",
      [name],
    )
  ).rows[0].id as string;
}
async function company(pro = false) {
  const userId = await user("관리자");
  const companyId = (
    await pool.query(
      `INSERT INTO companies (name, business_type, business_start_date, company_code,
       initial_employee_size_band, active_headcount, expected_annual_revenue_manwon, created_by,
       pro_state, plan, plan_started_at)
     VALUES ('test', 'test', '2026-01-01', $1, 'FROM_50', 99, 0, $2, $3, $4, $5) RETURNING id`,
      [
        randomUUID(),
        userId,
        pro ? "PRO_VOLUNTARY" : "FREE",
        pro ? "BASIC" : null,
        pro ? new Date() : null,
      ],
    )
  ).rows[0].id as string;
  await member(companyId, userId, "MANAGER_SUPERVISOR");
  const workerId = await user("작업자");
  await member(companyId, workerId, "WORKER");
  return {
    manager: { companyId, userId },
    worker: { companyId, userId: workerId },
  };
}
async function member(companyId: string, userId: string, role = "WORKER") {
  await pool.query(
    `INSERT INTO company_members (user_id, company_id, role, status, joined_via, snapshot_display_name)
     VALUES ($1, $2, $3, 'ACTIVE', 'DIRECT_JOIN', 'test')`,
    [userId, companyId, role],
  );
}

const doc = (text: string, extra: BoardDoc["content"] = []): BoardDoc => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }, ...extra],
});

test("renderDoc: whitelist only, escapes text, attachments by id", () => {
  const id = randomUUID();
  const html = renderDoc(
    parseDoc({
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "<제목>" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "굵게",
              marks: [{ type: "bold" }],
            },
            {
              type: "text",
              text: " 링크",
              marks: [{ type: "link", attrs: { href: "https://example.com" } }],
            },
          ],
        },
        { type: "attachmentImage", attrs: { id, alt: 'x"y' } },
        { type: "attachmentVideo", attrs: { id } },
      ],
    }),
  );
  assert.equal(
    html,
    `<h2>&lt;제목&gt;</h2>` +
      `<p><strong>굵게</strong><a href="https://example.com" target="_blank" rel="noopener noreferrer"> 링크</a></p>` +
      `<figure class="board-media"><img src="/api/attachments/${id}" alt="x&quot;y" loading="lazy"></figure>` +
      `<figure class="board-media"><video src="/api/attachments/${id}" controls playsinline preload="metadata"></video></figure>`,
  );
  // javascript: 링크와 알 수 없는 노드는 거절된다.
  assert.throws(
    () =>
      parseDoc({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "x",
                marks: [
                  { type: "link", attrs: { href: "javascript:alert(1)" } },
                ],
              },
            ],
          },
        ],
      }),
    /형식/,
  );
  assert.throws(
    () =>
      parseDoc({
        type: "doc",
        content: [{ type: "iframe", attrs: { src: "https://evil" } }],
      }),
    /형식/,
  );
  assert.throws(
    () =>
      parseDoc({
        type: "doc",
        content: [{ type: "attachmentImage", attrs: { id: "not-a-uuid" } }],
      }),
    /형식/,
  );
  assert.equal(docText(doc("안녕 하세요")), "안녕 하세요");
});

test("board: draft → publish, visibility by role, popup window, delete", async () => {
  const { manager, worker } = await company(false);
  const id = await transaction((c) => createDraft(c, manager, "NOTICE"));
  // 작업자는 글을 만들 수 없다.
  await assert.rejects(
    transaction((c) => createDraft(c, worker, "NOTICE")),
    /권한/,
  );
  // 초안은 관리자에게만 보인다.
  const beforePublish = await transaction((c) =>
    listPosts(c, worker, "NOTICE"),
  );
  assert.equal(beforePublish.published.length, 0);
  assert.equal(beforePublish.drafts.length, 0);
  const asManager = await transaction((c) => listPosts(c, manager, "NOTICE"));
  assert.equal(asManager.drafts.length, 1);
  await assert.rejects(
    transaction((c) => readPost(c, worker, id)),
    /찾을 수/,
  );

  // 제목 없이 발행 불가.
  await assert.rejects(
    transaction((c) =>
      savePost(c, manager, {
        id,
        title: "  ",
        body: doc("본문"),
        publish: true,
      }),
    ),
    /제목/,
  );
  // 무료 회사: 발행해도 푸시 없음.
  const saved = await transaction((c) =>
    savePost(c, manager, {
      id,
      title: "10월 안전점검",
      body: doc("전 직원 참석"),
      popup: true,
      popupFrom: "2026-10-01",
      popupUntil: "2026-10-07",
      publish: true,
    }),
  );
  assert.equal(saved.notify, null);
  const read = await transaction((c) => readPost(c, worker, id));
  assert.equal(read.post.status, "PUBLISHED");
  assert.equal(read.post.title, "10월 안전점검");
  assert.equal(read.post.popup, true);
  assert.equal(read.manager, false);

  // 팝업은 기간 안에서만 뜬다.
  const inside = await transaction((c) =>
    activePopupNotices(c, manager.companyId, "2026-10-03"),
  );
  assert.deepEqual(
    inside.map((n) => n.id),
    [id],
  );
  const outside = await transaction((c) =>
    activePopupNotices(c, manager.companyId, "2026-10-08"),
  );
  assert.equal(outside.length, 0);
  // 기간이 뒤집히면 거절.
  await assert.rejects(
    transaction((c) =>
      savePost(c, manager, {
        id,
        title: "x",
        body: doc("y"),
        popup: true,
        popupFrom: "2026-10-09",
        popupUntil: "2026-10-01",
        publish: true,
      }),
    ),
    /시작일/,
  );
  // 자료실 글은 팝업이 될 수 없다 (조용히 false).
  const resource = await transaction((c) =>
    createDraft(c, manager, "RESOURCE"),
  );
  await transaction((c) =>
    savePost(c, manager, {
      id: resource,
      title: "점검표",
      body: doc("첨부 참고"),
      popup: true,
      publish: true,
    }),
  );
  assert.equal(
    (await transaction((c) => readPost(c, worker, resource))).post.popup,
    false,
  );

  // 삭제하면 목록·조회에서 사라진다.
  await transaction((c) => deletePost(c, manager, id));
  await assert.rejects(
    transaction((c) => readPost(c, manager, id)),
    /찾을 수/,
  );
  assert.equal(
    (await transaction((c) => listPosts(c, worker, "NOTICE"))).published.length,
    0,
  );
});

test("board: paid company publishes once with push, attachments must belong to the post", async () => {
  const { manager } = await company(true);
  const id = await transaction((c) => createDraft(c, manager, "RESOURCE"));
  // 다른 글의 첨부를 본문에 끼우면 거절.
  const other = await transaction((c) => createDraft(c, manager, "RESOURCE"));
  const foreign = (
    await pool.query(
      `INSERT INTO attachments (company_id, target_type, target_id, storage_key, original_filename,
         mime_type, size_bytes, uploaded_by, status, ready_at)
       VALUES ($1, 'board_post', $2, $3, 'a.jpg', 'image/jpeg', 1000, $4, 'READY', now()) RETURNING id`,
      [manager.companyId, other, randomUUID(), manager.userId],
    )
  ).rows[0].id as string;
  await assert.rejects(
    transaction((c) =>
      savePost(c, manager, {
        id,
        title: "x",
        body: doc("본문", [
          { type: "attachmentImage", attrs: { id: foreign } },
        ]),
        publish: false,
      }),
    ),
    /첨부/,
  );
  const mine = (
    await pool.query(
      `INSERT INTO attachments (company_id, target_type, target_id, storage_key, original_filename,
         mime_type, size_bytes, uploaded_by, status, ready_at)
       VALUES ($1, 'board_post', $2, $3, 'v.mp4', 'video/mp4', 5000000, $4, 'READY', now()) RETURNING id`,
      [manager.companyId, id, randomUUID(), manager.userId],
    )
  ).rows[0].id as string;
  const first = await transaction((c) =>
    savePost(c, manager, {
      id,
      title: "지게차 교육 영상",
      body: doc("시청 후 서명", [
        { type: "attachmentVideo", attrs: { id: mine } },
      ]),
      publish: true,
    }),
  );
  assert.deepEqual(first.notify, {
    title: "지게차 교육 영상",
    body: "시청 후 서명 [동영상]",
  });
  // 다시 저장해도 두 번 알리지 않는다.
  const again = await transaction((c) =>
    savePost(c, manager, {
      id,
      title: "지게차 교육 영상 (수정)",
      body: doc("시청 후 서명"),
      publish: true,
    }),
  );
  assert.equal(again.notify, null);
  // 용량 합계는 READY + 최근 PENDING.
  assert.equal(
    await transaction((c) => boardStorageUsed(c, manager.companyId)),
    5000000 + 1000,
  );
  const list = await transaction((c) => listPosts(c, manager, "RESOURCE"));
  assert.equal(list.published[0].has_media, true);
  assert.equal(list.published[0].excerpt, "시청 후 서명");
});

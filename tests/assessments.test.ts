import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { PoolClient } from "@neondatabase/serverless";
import {
  assessmentOverview,
  listAssessments,
  readAssessment,
  readHalfYearReview,
  recordHalfYearReview,
  recordRiskAction,
} from "../src/server/assessments";

// Deliberately never reads DATABASE_URL or dotenv: tests cannot touch Neon.
const schema = "asmt_" + randomUUID().replaceAll("-", "");
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

async function company() {
  const userId = (
    await pool.query(
      "INSERT INTO users (display_name) VALUES ('관리자') RETURNING id",
    )
  ).rows[0].id as string;
  const companyId = (
    await pool.query(
      `INSERT INTO companies (name, business_type, business_start_date, company_code,
       initial_employee_size_band, active_headcount, expected_annual_revenue_manwon, created_by)
     VALUES ('test', 'test', '2026-01-01', $1, 'FROM_50', 9, 0, $2) RETURNING id`,
      [randomUUID(), userId],
    )
  ).rows[0].id as string;
  await pool.query(
    `INSERT INTO company_members (user_id, company_id, role, status, joined_via, snapshot_display_name)
     VALUES ($1, $2, 'MANAGER_SUPERVISOR', 'ACTIVE', 'DIRECT_JOIN', 'test')`,
    [userId, companyId],
  );
  const workerId = (
    await pool.query(
      "INSERT INTO users (display_name) VALUES ('작업자') RETURNING id",
    )
  ).rows[0].id as string;
  await pool.query(
    `INSERT INTO company_members (user_id, company_id, role, status, joined_via, snapshot_display_name)
     VALUES ($1, $2, 'WORKER', 'ACTIVE', 'DIRECT_JOIN', 'test')`,
    [workerId, companyId],
  );
  return {
    manager: { companyId, userId },
    worker: { companyId, userId: workerId },
  };
}

async function standard(companyId: string, userId: string, name: string) {
  return (
    await pool.query(
      `INSERT INTO standards (company_id, name, ptw_required, status, created_by)
       VALUES ($1, $2, false, 'APPROVED', $3) RETURNING id`,
      [companyId, name, userId],
    )
  ).rows[0].id as string;
}

async function assessment(
  companyId: string,
  userId: string,
  opts: {
    standardId?: string;
    kind?: string;
    performedOn: string;
    status?: string;
    items?: Array<{ hazard: string; allowable: boolean }>;
  },
) {
  const id = (
    await pool.query(
      `INSERT INTO risk_assessments
         (company_id, is_simple, name, assessment_kind, performed_on, status,
          criteria_snapshot, work_method_snapshot, safety_info, created_by,
          approved_by, approved_at, retention_until, standard_id)
       VALUES ($1, $2, $3, $4, $5::date, $6,
               '[{"level":"HIGH","description":"상","acceptance":"NOT_ACCEPTABLE"},{"level":"MID","description":"중","acceptance":"AFTER_REDUCTION"},{"level":"LOW","description":"하","acceptance":"ACCEPTABLE"}]',
               '방법', '{"equipment":"","materials":"","environment":"","history":""}',
               $7::uuid, CASE WHEN $6::text = 'APPROVED' THEN $7::uuid END,
               CASE WHEN $6::text = 'APPROVED' THEN now() END, ($5::date + interval '3 years')::date, $8::uuid)
       RETURNING id`,
      [
        companyId,
        !opts.standardId,
        opts.standardId ? "표준 평가" : "간이 평가",
        opts.kind ?? "PERIODIC",
        opts.performedOn,
        opts.status ?? "APPROVED",
        userId,
        opts.standardId ?? null,
      ],
    )
  ).rows[0].id as string;
  const items = opts.items ?? [{ hazard: "끼임", allowable: false }];
  for (let i = 0; i < items.length; i++)
    await pool.query(
      `INSERT INTO risk_assessment_items
         (assessment_id, order_no, hazard, initial_risk_level, initial_allowable, reduction_measure)
       VALUES ($1, $2, $3, 'MID', $4, '덮개')`,
      [id, i + 1, items[i].hazard, items[i].allowable],
    );
  return id;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return iso(d);
};

test("assessments: overview counts, needs-assessment standards, expiring soon", async () => {
  const { manager, worker } = await company();
  const fresh = await standard(
    manager.companyId,
    manager.userId,
    "신규 표준서",
  );
  const stale = await standard(
    manager.companyId,
    manager.userId,
    "오래된 표준서",
  );
  const soon = await standard(manager.companyId, manager.userId, "곧 만료");
  await assessment(manager.companyId, manager.userId, {
    standardId: fresh,
    performedOn: daysAgo(10),
  });
  // 정기평가 유효 12개월. 400일 전이면 만료.
  await assessment(manager.companyId, manager.userId, {
    standardId: stale,
    performedOn: daysAgo(400),
  });
  // 350일 전이면 15일 뒤 만료 → 30일 안.
  await assessment(manager.companyId, manager.userId, {
    standardId: soon,
    performedOn: daysAgo(350),
    items: [{ hazard: "소음", allowable: true }],
  });
  // 승인 대기 간이평가
  await assessment(manager.companyId, manager.userId, {
    performedOn: daysAgo(1),
    status: "PENDING",
  });
  const noAssessment = await standard(
    manager.companyId,
    manager.userId,
    "평가 없음",
  );

  const overview = await transaction((c) => assessmentOverview(c, manager));
  assert.equal(overview.pending_count, 1);
  // 승인된 평가 셋 가운데 허용 불가 항목: fresh 1 + stale 1 (soon 은 허용 가능)
  assert.equal(overview.open_action_count, 2);
  assert.deepEqual(
    overview.needs_assessment.map((s) => s.standard_id).sort(),
    [stale, noAssessment].sort(),
  );
  assert.deepEqual(
    overview.expiring_soon.map((s) => s.standard_id),
    [soon],
  );

  const list = await transaction((c) => listAssessments(c, manager));
  assert.equal(list.length, 4);
  const staleRow = list.find((r) => r.standard_id === stale)!;
  assert.equal(staleRow.expired, true);
  const pending = list.find((r) => r.status === "PENDING")!;
  assert.equal(pending.is_simple, true);

  // 작업자는 못 본다.
  await assert.rejects(
    transaction((c) => listAssessments(c, worker)),
    /권한/,
  );
});

test("assessments: post-action 허용 불가 needs a follow-up and stays open (고시 제13조)", async () => {
  const { manager } = await company();
  const std = await standard(manager.companyId, manager.userId, "프레스");
  const id = await assessment(manager.companyId, manager.userId, {
    standardId: std,
    performedOn: daysAgo(2),
    items: [{ hazard: "끼임", allowable: false }],
  });
  const item = (await transaction((c) => readAssessment(c, manager, id)))
    .items[0];
  // 조치 뒤에도 허용 불가인데 추가 대책이 없으면 거부.
  await assert.rejects(
    transaction((c) =>
      recordRiskAction(c, manager, {
        assessmentId: id,
        itemId: item.id,
        actualAction: "임시 덮개",
        actualCompletionDate: daysAgo(0),
        postRiskLevel: "MID",
        postAllowable: false,
      }),
    ),
    /추가 대책/,
  );
  await transaction((c) =>
    recordRiskAction(c, manager, {
      assessmentId: id,
      itemId: item.id,
      actualAction: "임시 덮개",
      actualCompletionDate: daysAgo(0),
      postRiskLevel: "MID",
      postAllowable: false,
      followUpMeasure: "고정 덮개 발주, 다음 달 설치",
    }),
  );
  let detail = await transaction((c) => readAssessment(c, manager, id));
  assert.equal(
    detail.items[0].follow_up_measure,
    "고정 덮개 발주, 다음 달 설치",
  );
  // 조치를 적었지만 아직 "남은 조치" 다.
  assert.equal(detail.open_action_count, 1);
  const list = await transaction((c) => listAssessments(c, manager));
  assert.equal(list.find((r) => r.id === id)!.open_action_count, 1);

  await transaction((c) =>
    recordRiskAction(c, manager, {
      assessmentId: id,
      itemId: item.id,
      actualAction: "고정 덮개 설치",
      actualCompletionDate: daysAgo(0),
      postRiskLevel: "LOW",
      postAllowable: true,
    }),
  );
  detail = await transaction((c) => readAssessment(c, manager, id));
  assert.equal(detail.open_action_count, 0);
  // 허용 가능이 되면 추가 대책은 지운다.
  assert.equal(detail.items[0].follow_up_measure, null);
});

test("assessments: half-year review records the numbers the boss signed off on", async () => {
  const { manager, worker } = await company();
  const std = await standard(manager.companyId, manager.userId, "프레스");
  await assessment(manager.companyId, manager.userId, {
    standardId: std,
    performedOn: daysAgo(1),
    items: [{ hazard: "끼임", allowable: false }],
  });
  const before = await transaction((c) => readHalfYearReview(c, manager));
  assert.equal(before.current, null);
  assert.equal(before.stats.assessments, 1);
  assert.equal(before.stats.actions_open, 1);
  assert.equal(before.stats.standards_expired, 0);

  await assert.rejects(
    transaction((c) => recordHalfYearReview(c, worker, "")),
    /권한/,
  );
  await transaction((c) =>
    recordHalfYearReview(c, manager, "남은 조치 1건은 이달 안에"),
  );
  const after = await transaction((c) => readHalfYearReview(c, manager));
  assert.ok(after.current);
  assert.equal(after.current!.note, "남은 조치 1건은 이달 안에");
  assert.equal(after.current!.reviewed_by_name, "관리자");
  assert.deepEqual(after.current!.stats, before.stats);
  assert.equal(after.history.length, 1);
});

test("assessments: read detail and record action on an approved item", async () => {
  const { manager, worker } = await company();
  const std = await standard(manager.companyId, manager.userId, "프레스");
  const id = await assessment(manager.companyId, manager.userId, {
    standardId: std,
    performedOn: daysAgo(3),
    items: [
      { hazard: "끼임", allowable: false },
      { hazard: "소음", allowable: true },
    ],
  });
  const detail = await transaction((c) => readAssessment(c, manager, id));
  assert.equal(detail.standard_name, "프레스");
  assert.equal(detail.items.length, 2);
  assert.equal(detail.open_action_count, 1);
  const item = detail.items[0];

  await assert.rejects(
    transaction((c) =>
      recordRiskAction(c, worker, {
        assessmentId: id,
        itemId: item.id,
        actualAction: "덮개 설치",
        actualCompletionDate: daysAgo(0),
        postRiskLevel: "LOW",
        postAllowable: true,
      }),
    ),
    /권한/,
  );
  await assert.rejects(
    transaction((c) =>
      recordRiskAction(c, manager, {
        assessmentId: id,
        itemId: item.id,
        actualAction: "  ",
        actualCompletionDate: daysAgo(0),
        postRiskLevel: "LOW",
        postAllowable: true,
      }),
    ),
    /조치 내용/,
  );
  await transaction((c) =>
    recordRiskAction(c, manager, {
      assessmentId: id,
      itemId: item.id,
      actualAction: "방호덮개 설치 완료",
      actualCompletionDate: daysAgo(0),
      postRiskLevel: "LOW",
      postAllowable: true,
    }),
  );
  const after = await transaction((c) => readAssessment(c, manager, id));
  assert.equal(after.open_action_count, 0);
  assert.equal(after.items[0].actual_action, "방호덮개 설치 완료");
  assert.equal(after.items[0].post_risk_level, "LOW");
  assert.equal(after.items[0].post_allowable, true);

  // 승인되지 않은 평가에는 못 적는다.
  const pending = await assessment(manager.companyId, manager.userId, {
    performedOn: daysAgo(0),
    status: "PENDING",
  });
  const p = await transaction((c) => readAssessment(c, manager, pending));
  await assert.rejects(
    transaction((c) =>
      recordRiskAction(c, manager, {
        assessmentId: pending,
        itemId: p.items[0].id,
        actualAction: "x",
        actualCompletionDate: daysAgo(0),
        postRiskLevel: "LOW",
        postAllowable: true,
      }),
    ),
    /승인된 평가/,
  );
});

import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import {
  updateOwnProfile,
  leaveOwnCompany,
} from "../src/server/profile-service";
import { randomUUID } from "node:crypto";
import {
  requestPermit,
  decidePermit,
  addLocation,
} from "../src/server/ptw-service";
import { Pool } from "pg";
import type { PoolClient } from "@neondatabase/serverless";
import {
  acceptInvite,
  mutateMember,
  refreshHeadcount,
  seatCapacityError,
} from "../src/server/membership-mutations";
import { resolveIdentity } from "../src/server/identity-mutations";
import {
  issueAccessToken,
  resolveAccessToken,
  revokeAccessToken,
  recordLinkOpen,
  linkActor,
} from "../src/server/worker-access";
import {
  submitInspection,
  resolveFinding,
  inspectionOverview,
  pendingFindings,
  inspectionSessions,
} from "../src/server/inspection-service";
import {
  sessionState,
  type InspectionInput,
  type SessionRow,
} from "../src/features/inspections/model";
import {
  saveOrder,
  requestAssessment,
  approveAssessment,
  approveAndIssueOrder,
  issueOrder,
  cancelOrder,
  readOrder,
} from "../src/server/work-order-service";
import {
  blankDraft,
  effectiveStatus,
  seoulToday,
  validateIssue,
  validateSchedule,
  shiftMinutes,
  type WorkDraft,
} from "../src/features/work-orders/model";

// Deliberately never reads DATABASE_URL or dotenv: tests cannot touch Neon.
const schema = "regression_" + randomUUID().replaceAll("-", "");
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
async function user() {
  return (
    await pool.query(
      "INSERT INTO users (display_name) VALUES ('test') RETURNING id",
    )
  ).rows[0].id as string;
}
async function fixture() {
  const userId = await user();
  const companyId = (
    await pool.query(
      `INSERT INTO companies (name, business_type, business_start_date, company_code,
       initial_employee_size_band, active_headcount, expected_annual_revenue_manwon, created_by)
     VALUES ('test', 'test', '2026-01-01', $1, 'FROM_50', 99, 0, $2) RETURNING id`,
      [randomUUID(), userId],
    )
  ).rows[0].id as string;
  const memberId = await member(companyId, userId, "MANAGER_SUPERVISOR");
  return { userId, companyId, memberId };
}
async function member(
  companyId: string,
  userId: string,
  role = "WORKER",
  status = "ACTIVE",
) {
  return (
    await pool.query(
      `INSERT INTO company_members (user_id, company_id, role, status, joined_via, snapshot_display_name)
     VALUES ($1, $2, $3, $4, 'DIRECT_JOIN', 'test') RETURNING id`,
      [userId, companyId, role, status],
    )
  ).rows[0].id as string;
}
async function invitation(
  companyId: string,
  inviter: string,
  expires = "1 day",
) {
  const token = randomUUID();
  await pool.query(
    `INSERT INTO company_invitations (company_id, inviter_id, contact_email, target_role, token, expires_at)
     VALUES ($1, $2, 'test@example.com', 'WORKER', $3, now() + $4::interval)`,
    [companyId, inviter, token, expires],
  );
  return token;
}
test("profile: validation, stale write protection and audit privacy", async () => {
  const id = await user();
  const version = (
    await pool.query("SELECT updated_at::text AS v FROM users WHERE id=$1", [
      id,
    ])
  ).rows[0].v;
  const input = { displayName: "새 이름", phone: "010-1234-5678", version };
  await transaction((c) => updateOwnProfile(c, id, input));
  await assert.rejects(
    transaction((c) => updateOwnProfile(c, id, input)),
    /다른 화면/,
  );
  await assert.rejects(
    transaction((c) => updateOwnProfile(c, id, { ...input, phone: "invalid" })),
    /전화번호/,
  );
  const audit = (
    await pool.query(
      "SELECT after_json FROM audit_logs WHERE actor_id=$1 AND action='UPDATE_PROFILE'",
      [id],
    )
  ).rows[0].after_json;
  assert.deepEqual(audit, { fields: ["display_name", "phone"] });
});

test("profile: concurrent supervisor exits retain one; cross-user exit forbidden; pending cancellation idempotent", async () => {
  const f = await fixture(),
    second = await user();
  const secondMember = await member(f.companyId, second, "MANAGER_SUPERVISOR");
  await assert.rejects(
    transaction((c) => leaveOwnCompany(c, second, f.memberId)),
    /본인의 소속/,
  );
  const results = await Promise.allSettled([
    transaction((c) => leaveOwnCompany(c, f.userId, f.memberId)),
    transaction((c) => leaveOwnCompany(c, second, secondMember)),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const pending = await user(),
    pendingMember = await member(
      f.companyId,
      pending,
      "WORKER",
      "JOIN_PENDING",
    );
  await transaction((c) => leaveOwnCompany(c, pending, pendingMember));
  await transaction((c) => leaveOwnCompany(c, pending, pendingMember));
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int n FROM audit_logs WHERE actor_id=$1 AND action='SELF_RESIGN'",
        [pending],
      )
    ).rows[0].n,
    1,
  );
});

test("profile: exit unassigns work without modifying snapshots or completed TBM", async () => {
  for (const submitted of [false, true]) {
    const f = await inspectionFixture();
    if (submitted)
      await transaction((c) => submitInspection(c, f.workerActor, f.input()));
    const membership = (
      await pool.query("SELECT id FROM company_members WHERE user_id=$1", [
        f.worker,
      ])
    ).rows[0].id;
    await transaction((c) => leaveOwnCompany(c, f.worker, membership));
    assert.equal(
      (
        await pool.query(
          "SELECT status FROM work_order_assignments WHERE work_order_id=$1 AND user_id=$2",
          [f.id, f.worker],
        )
      ).rows[0].status,
      "UNASSIGNED",
    );
    assert.equal(
      (
        await pool.query(
          "SELECT expected_assignees FROM work_sessions WHERE id=$1",
          [f.session.id],
        )
      ).rows[0].expected_assignees.length,
      1,
    );
    const sessions = await transaction((c) => inspectionSessions(c, f.id));
    assert.equal(sessions[0].expected_assignees.length, submitted ? 1 : 0);
    assert.equal(sessions[0].tbm_users.length, submitted ? 1 : 0);
    await assert.rejects(
      transaction((c) =>
        submitInspection(c, f.workerActor, f.input("DURING_WORK")),
      ),
    );
  }
});

test("profile: assigned unresolved finding prevents departure", async () => {
  const f = await inspectionFixture();
  await member(f.actor.companyId, await user(), "MANAGER_SUPERVISOR");
  const input = f.input();
  input.results[0] = {
    ...input.results[0],
    result: "FAIL",
    managerId: f.actor.userId,
  };
  await transaction((c) => submitInspection(c, f.workerActor, input));
  await assert.rejects(
    transaction((c) => leaveOwnCompany(c, f.actor.userId, f.actor.memberId)),
    /미조치 부적합/,
  );
});

test("simultaneous approval is single-use and repairs count; repeated resignation cannot decrement twice", async () => {
  const actor = await fixture();
  const id = await member(
    actor.companyId,
    await user(),
    "WORKER",
    "JOIN_PENDING",
  );
  const results = await Promise.all(
    [1, 2].map(() => transaction((c) => mutateMember(c, actor, id, "approve"))),
  );
  assert.equal(results.filter((r) => r.message).length, 1);
  assert.equal(
    (
      await pool.query("SELECT active_headcount FROM companies WHERE id=$1", [
        actor.companyId,
      ])
    ).rows[0].active_headcount,
    2,
  );
  const resigned = await Promise.all(
    [1, 2].map(() => transaction((c) => mutateMember(c, actor, id, "resign"))),
  );
  assert.equal(resigned.filter((r) => r.message).length, 1);
  assert.equal(
    (
      await pool.query("SELECT active_headcount FROM companies WHERE id=$1", [
        actor.companyId,
      ])
    ).rows[0].active_headcount,
    1,
  );
});
test("approval and rejection competing for one request have exactly one winner", async () => {
  const actor = await fixture();
  const id = await member(
    actor.companyId,
    await user(),
    "WORKER",
    "JOIN_PENDING",
  );
  const results = await Promise.all([
    transaction((c) => mutateMember(c, actor, id, "approve")),
    transaction((c) => mutateMember(c, actor, id, "reject")),
  ]);
  assert.equal(results.filter((r) => r.message).length, 1);
});
test("two supervisors cannot concurrently demote or resign the last supervisor", async () => {
  for (const op of ["role", "resign"] as const) {
    const actor = await fixture();
    const otherUser = await user();
    const other = await member(
      actor.companyId,
      otherUser,
      "MANAGER_SUPERVISOR",
    );
    const results = await Promise.all([
      transaction((c) => mutateMember(c, actor, actor.memberId, op, "WORKER")),
      transaction((c) =>
        mutateMember(c, { ...actor, userId: otherUser }, other, op, "WORKER"),
      ),
    ]);
    assert.equal(results.filter((r) => r.message).length, 1);
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM company_members WHERE company_id=$1 AND role='MANAGER_SUPERVISOR' AND status='ACTIVE'",
          [actor.companyId],
        )
      ).rows[0].n,
      1,
    );
  }
});
test("stale manager and cross-company targets are rejected", async () => {
  const actor = await fixture();
  const outsider = await fixture();
  assert.ok(
    (
      await transaction((c) =>
        mutateMember(c, actor, outsider.memberId, "resign"),
      )
    ).error,
  );
  await pool.query("UPDATE company_members SET role='WORKER' WHERE id=$1", [
    actor.memberId,
  ]);
  assert.ok(
    (await transaction((c) => mutateMember(c, actor, actor.memberId, "resign")))
      .error,
  );
});
test("two users racing for one invite produce only one membership", async () => {
  const actor = await fixture();
  const token = await invitation(actor.companyId, actor.userId);
  const ids = await Promise.all([user(), user()]);
  const results = await Promise.allSettled(
    ids.map((id) => transaction((c) => acceptInvite(c, token, id))),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (
      await pool.query("SELECT active_headcount FROM companies WHERE id=$1", [
        actor.companyId,
      ])
    ).rows[0].active_headcount,
    2,
  );
});
test("expired invite and existing membership never consume invitation", async () => {
  const actor = await fixture();
  const token = await invitation(actor.companyId, actor.userId);
  await assert.rejects(
    transaction((c) => acceptInvite(c, token, actor.userId)),
  );
  const expired = await invitation(actor.companyId, actor.userId, "-1 day");
  const id = await user();
  await assert.rejects(transaction((c) => acceptInvite(c, expired, id)));
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM company_invitations WHERE token=ANY($1) AND accepted_at IS NOT NULL",
        [[token, expired]],
      )
    ).rows[0].n,
    0,
  );
});
test("one user accepting two companies concurrently joins only one; losing token rolls back", async () => {
  const a = await fixture(),
    b = await fixture(),
    id = await user();
  const tokens = await Promise.all([
    invitation(a.companyId, a.userId),
    invitation(b.companyId, b.userId),
  ]);
  const results = await Promise.allSettled(
    tokens.map((token) => transaction((c) => acceptInvite(c, token, id))),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM company_invitations WHERE token=ANY($1) AND accepted_at IS NOT NULL",
        [tokens],
      )
    ).rows[0].n,
    1,
  );
});
test("size-band boundaries use active memberships, retaining initial declared band", async () => {
  const actor = await fixture();
  let count = 1;
  for (const [n, band] of [
    [1, "UNDER_5"],
    [4, "UNDER_5"],
    [5, "FROM_5_TO_19"],
    [19, "FROM_5_TO_19"],
    [20, "FROM_20_TO_49"],
    [49, "FROM_20_TO_49"],
    [50, "FROM_50"],
  ] as const) {
    while (count < n) {
      await member(actor.companyId, await user());
      count++;
    }
    await transaction((c) => refreshHeadcount(c, actor.companyId));
    const row = (
      await pool.query("SELECT * FROM companies WHERE id=$1", [actor.companyId])
    ).rows[0];
    assert.equal(row.active_headcount, n);
    assert.equal(row.current_employee_size_band, band);
    assert.equal(row.initial_employee_size_band, "FROM_50");
  }
});
test("OAuth duplicate email recovers transaction without merging; same-identity callbacks share one user", async () => {
  const email = randomUUID() + "@example.com";
  const first = await transaction((c) =>
    resolveIdentity(c, "GOOGLE", randomUUID(), "test", email),
  );
  const providerId = randomUUID();
  const ids = await Promise.all(
    [1, 2].map(() =>
      transaction((c) =>
        resolveIdentity(c, "NAVER", providerId, "test", email),
      ),
    ),
  );
  assert.equal(ids[0], ids[1]);
  assert.notEqual(ids[0], first);
  assert.equal(
    (await pool.query("SELECT email FROM users WHERE id=$1", [ids[0]])).rows[0]
      .email,
    null,
  );
});

async function orderFixture(ptw = false) {
  const actor = await fixture();
  const worker = await user();
  await member(actor.companyId, worker);
  const d: WorkDraft = {
    ...blankDraft(),
    name: "테스트 작업",
    method: "테스트 작업방법",
    location: "테스트 장소",
    startDate: seoulToday(new Date(Date.now() + 86400_000)),
    endDate: seoulToday(new Date(Date.now() + 86400_000)),
    criteria: "테스트 판단 기준",
    participantIds: [worker],
    assigneeIds: [worker],
    ptwRequired: ptw,
    safetyInfo: {
      equipment: "테스트",
      materials: "테스트",
      environment: "테스트",
      history: "테스트",
    },
    risks: [
      {
        hazard: "테스트 위험",
        level: "LOW",
        allowable: "yes",
        measure: "테스트 대책",
        responsibleId: worker,
        dueDate: seoulToday(new Date(Date.now() + 86400_000)),
      },
    ],
    tbm: ["테스트 TBM"],
    during: ["테스트 작업 중"],
  };
  const id = randomUUID();
  await transaction((c) => saveOrder(c, actor, id, 0, d));
  return { actor, worker, d, id };
}
async function approvedOrder(ptw = false) {
  const setup = await orderFixture(ptw);
  await transaction((c) => requestAssessment(c, setup.actor, setup.id, 1));
  const reviewer = await user();
  await member(setup.actor.companyId, reviewer, "MANAGER_SAFETY");
  await transaction((c) =>
    approveAssessment(
      c,
      { ...setup.actor, userId: reviewer },
      setup.id,
      2,
      false,
    ),
  );
  return setup;
}

async function inspectionFixture() {
  const setup = await orderFixture();
  const start = new Date(Date.now() - 3600000);
  const end = new Date(Date.now() + 3 * 3600000);
  const time = (d: Date) =>
    new Date(d.getTime() + 9 * 3600000).toISOString().slice(11, 16);
  const d = {
    ...setup.d,
    startDate: seoulToday(start),
    endDate: seoulToday(start),
    startTime: time(start),
    endTime: time(end),
  };
  await transaction((c) => saveOrder(c, setup.actor, setup.id, 1, d));
  await transaction((c) => approveAndIssueOrder(c, setup.actor, setup.id, 2));
  const session = (
    await transaction((c) => inspectionSessions(c, setup.id))
  )[0];
  const checklist = (
    await pool.query(
      "SELECT id,category FROM work_order_checklist_items WHERE work_order_id=$1",
      [setup.id],
    )
  ).rows;
  const input = (category: "TBM" | "DURING_WORK" = "TBM"): InspectionInput => ({
    id: randomUUID(),
    orderId: setup.id,
    sessionId: session.id,
    category,
    entryPath: "QR",
    confirmed: true,
    results: checklist
      .filter((c) => c.category === category)
      .map((c) => ({
        itemId: c.id,
        result: "PASS",
        comment: "",
        managerId: "",
      })),
  });
  return {
    ...setup,
    session,
    input,
    workerActor: { ...setup.actor, userId: setup.worker },
  };
}

test("inspection: during-work before TBM is allowed; all assignees and one patrol complete session", async () => {
  const f = await inspectionFixture();
  await transaction((c) =>
    submitInspection(c, f.workerActor, f.input("DURING_WORK")),
  );
  let data = await transaction((c) => inspectionOverview(c, f.actor, f.id));
  assert.equal(sessionState(data.current!).state, "OPEN");
  assert.equal(sessionState(data.current!).missing.length, 1);
  // A manager not assigned to the order participates, but cannot replace the worker.
  await transaction((c) => submitInspection(c, f.actor, f.input()));
  data = await transaction((c) => inspectionOverview(c, f.actor, f.id));
  assert.equal(sessionState(data.current!).missing.length, 1);
  await transaction((c) => submitInspection(c, f.workerActor, f.input()));
  data = await transaction((c) => inspectionOverview(c, f.workerActor, f.id));
  assert.equal(sessionState(data.current!).state, "OPEN");
  assert.equal(
    sessionState(
      data.current!,
      new Date(Date.parse(data.current!.ends_at) + 2 * 60 * 60 * 1000 + 1),
    ).state,
    "DONE",
  );
  assert.equal(data.records.length, 3);
  await transaction((c) =>
    submitInspection(c, f.workerActor, f.input("DURING_WORK")),
  );
  assert.equal(
    (await transaction((c) => inspectionOverview(c, f.actor, f.id))).current!
      .during_count,
    2,
  );
});

test("inspection: field entry is its own author and backfill stays a web action", async () => {
  const f = await inspectionFixture();
  const input = f.input();
  await transaction((c) => submitInspection(c, f.workerActor, input));
  const row = (
    await pool.query(
      "SELECT inspector_id,inspector_name,recorded_by,recorded_by_name,backfilled FROM inspections WHERE id=$1",
      [input.id],
    )
  ).rows[0];
  // 현장에서 본인이 넣었으므로 두 사람이 같고, 사후 입력 표시가 붙지 않는다.
  assert.equal(row.recorded_by, row.inspector_id);
  assert.equal(row.recorded_by_name, row.inspector_name);
  assert.equal(row.backfilled, false);
  // QR·링크로 들어온 기록을 대리 입력으로 둔갑시킬 수 없다 (0014).
  await assert.rejects(
    pool.query("UPDATE inspections SET backfilled=true WHERE id=$1", [
      input.id,
    ]),
    /inspections_backfill_is_web/,
  );
});

test("inspection: concurrent retries are idempotent; different TBM requests have one winner", async () => {
  const f = await inspectionFixture();
  const data = f.input();
  const same = await Promise.all(
    [1, 2].map(() =>
      transaction((c) => submitInspection(c, f.workerActor, data)),
    ),
  );
  assert.equal(same[0], same[1]);
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM inspections WHERE session_id=$1",
        [f.session.id],
      )
    ).rows[0].n,
    1,
  );
  await assert.rejects(
    transaction((c) => submitInspection(c, f.workerActor, f.input())),
    /이미/,
  );
  const g = await inspectionFixture();
  const different = await Promise.allSettled(
    [1, 2].map(() =>
      transaction((c) => submitInspection(c, g.workerActor, g.input())),
    ),
  );
  assert.equal(different.filter((r) => r.status === "fulfilled").length, 1);
});

test("inspection: tenant, unassigned, inactive and forged session/checklist are denied", async () => {
  const f = await inspectionFixture();
  const other = await inspectionFixture();
  await assert.rejects(
    transaction((c) => submitInspection(c, other.actor, f.input())),
  );
  const outsider = await user();
  await member(f.actor.companyId, outsider);
  await assert.rejects(
    transaction((c) =>
      submitInspection(c, { ...f.actor, userId: outsider }, f.input()),
    ),
  );
  await assert.rejects(
    transaction((c) =>
      submitInspection(c, f.workerActor, {
        ...f.input(),
        sessionId: other.session.id,
      }),
    ),
  );
  await assert.rejects(
    transaction((c) =>
      submitInspection(c, f.workerActor, {
        ...f.input(),
        results: other.input().results,
      }),
    ),
  );
  const duplicates = f.input();
  duplicates.results.push(duplicates.results[0]);
  await assert.rejects(
    transaction((c) => submitInspection(c, f.workerActor, duplicates)),
  );
  await pool.query(
    "UPDATE company_members SET left_at=now() WHERE company_id=$1 AND user_id=$2",
    [f.actor.companyId, f.worker],
  );
  await assert.rejects(
    transaction((c) => submitInspection(c, f.workerActor, f.input())),
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM inspections WHERE session_id=$1",
        [f.session.id],
      )
    ).rows[0].n,
    0,
  );
});

test("inspection: TBM requires confirmation and failed checks require active manager; no partial writes", async () => {
  const f = await inspectionFixture();
  await assert.rejects(
    transaction((c) =>
      submitInspection(c, f.workerActor, { ...f.input(), confirmed: false }),
    ),
    /확인/,
  );
  const data = f.input();
  data.results[0].result = "FAIL";
  await assert.rejects(
    transaction((c) => submitInspection(c, f.workerActor, data)),
    /관리자/,
  );
  data.results[0].managerId = f.worker;
  await assert.rejects(
    transaction((c) => submitInspection(c, f.workerActor, data)),
    /관리자/,
  );
  data.results[0].managerId = f.actor.userId;
  await transaction((c) => submitInspection(c, f.workerActor, data));
  const overview = await transaction((c) =>
    inspectionOverview(c, f.actor, f.id),
  );
  assert.equal(overview.openCount, 1);
  assert.equal(overview.records[0].entry_path, "QR");
  assert.equal(overview.records[0].inspector_id, f.worker);
  assert.equal(
    (await transaction((c) => pendingFindings(c, f.actor))).length,
    1,
  );
});

test("inspection: only designated active manager resolves; cancellation preserves open findings", async () => {
  const f = await inspectionFixture();
  const data = f.input();
  data.results[0] = {
    ...data.results[0],
    result: "FAIL",
    managerId: f.actor.userId,
  };
  await transaction((c) => submitInspection(c, f.workerActor, data));
  const finding = (await transaction((c) => pendingFindings(c, f.actor)))[0];
  const another = await user();
  await member(f.actor.companyId, another, "MANAGER_SAFETY");
  await assert.rejects(
    transaction((c) =>
      resolveFinding(
        c,
        { ...f.actor, userId: another },
        finding.id,
        "다른 관리자",
      ),
    ),
    /지정/,
  );
  await assert.rejects(
    transaction((c) => resolveFinding(c, f.workerActor, finding.id, "작업자")),
  );
  await assert.rejects(
    transaction((c) => resolveFinding(c, f.actor, finding.id, "  ")),
    /내용/,
  );
  const revision = (
    await pool.query("SELECT revision FROM work_orders WHERE id=$1", [f.id])
  ).rows[0].revision;
  await transaction((c) =>
    cancelOrder(c, f.actor, f.id, revision, "점검 후 취소"),
  );
  await assert.rejects(
    transaction((c) =>
      submitInspection(c, f.workerActor, f.input("DURING_WORK")),
    ),
    /유효/,
  );
  assert.equal(
    (await transaction((c) => pendingFindings(c, f.actor))).length,
    1,
  );
  await transaction((c) =>
    resolveFinding(c, f.actor, finding.id, "가드 수리 및 정상 동작 확인"),
  );
  assert.equal(
    (await transaction((c) => pendingFindings(c, f.actor))).length,
    0,
  );
  await assert.rejects(
    transaction((c) => resolveFinding(c, f.actor, finding.id, "덮어쓰기")),
    /이미/,
  );
  assert.equal(
    (await transaction((c) => inspectionOverview(c, f.actor, f.id))).openCount,
    0,
  );
});

test("inspection: scheduled/closed sessions reject input; next session independent of previous missing TBM", async () => {
  const f = await inspectionFixture();
  await pool.query(
    "UPDATE work_sessions SET starts_at=now()+interval '4 hours',ends_at=now()+interval '8 hours' WHERE id=$1",
    [f.session.id],
  );
  await assert.rejects(
    transaction((c) => submitInspection(c, f.workerActor, f.input())),
    /현재 회차/,
  );
  await pool.query(
    "UPDATE work_sessions SET starts_at=now()-interval '8 hours',ends_at=now()-interval '4 hours' WHERE id=$1",
    [f.session.id],
  );
  await assert.rejects(
    transaction((c) => submitInspection(c, f.workerActor, f.input())),
    /현재 회차/,
  );
  const g = await inspectionFixture();
  await pool.query(
    `INSERT INTO work_sessions(company_id,work_order_id,work_date,starts_at,ends_at,expected_assignees)
    SELECT company_id,work_order_id,work_date-1,starts_at-interval '1 day',ends_at-interval '1 day',expected_assignees FROM work_sessions WHERE id=$1`,
    [g.session.id],
  );
  await transaction((c) => submitInspection(c, g.workerActor, g.input()));
  const overview = await transaction((c) =>
    inspectionOverview(c, g.actor, g.id),
  );
  assert.equal(overview.sessions.length, 2);
  assert.equal(sessionState(overview.sessions[1]).state, "MISSED");
});

test("inspection: previous resolved actions are shared on next TBM and old open findings remain actionable", async () => {
  const f = await inspectionFixture();
  const data = f.input();
  data.results[0] = {
    ...data.results[0],
    result: "FAIL",
    managerId: f.actor.userId,
  };
  await transaction((c) => submitInspection(c, f.workerActor, data));
  const finding = (await transaction((c) => pendingFindings(c, f.actor)))[0];
  await transaction((c) =>
    resolveFinding(c, f.actor, finding.id, "차단 장치 교체"),
  );
  await pool.query(
    "UPDATE work_sessions SET work_date=work_date-1,starts_at=starts_at-interval '1 day',ends_at=ends_at-interval '1 day' WHERE id=$1",
    [f.session.id],
  );
  await pool.query("SELECT create_work_sessions($1)", [f.id]);
  await pool.query("SELECT create_work_sessions($1)", [f.id]);
  const overview = await transaction((c) =>
    inspectionOverview(c, f.workerActor, f.id),
  );
  assert.equal(overview.sessions.length, 2);
  assert.equal(overview.previousActions[0].resolution, "차단 장치 교체");
  // Past result is outside FREE read window but its open safety action stays in inbox.
  const g = await inspectionFixture();
  const failed = g.input();
  failed.results[0] = {
    ...failed.results[0],
    result: "FAIL",
    managerId: g.actor.userId,
  };
  await transaction((c) => submitInspection(c, g.workerActor, failed));
  await pool.query(
    "UPDATE work_sessions SET work_date=work_date-9,starts_at=starts_at-interval '9 days',ends_at=ends_at-interval '9 days' WHERE id=$1",
    [g.session.id],
  );
  const old = await transaction((c) => inspectionOverview(c, g.actor, g.id));
  assert.equal(old.records.length, 0);
  assert.equal(old.lockedSessions, 1);
  assert.equal(old.openCount, 1);
  const open = (await transaction((c) => pendingFindings(c, g.actor)))[0];
  await transaction((c) =>
    resolveFinding(c, g.actor, open.id, "늦은 조치 완료"),
  );
});

test("session state: overnight Korean start date, exact window boundaries, missing and completion independent of findings", () => {
  const session: SessionRow = {
    id: randomUUID(),
    work_date: "2026-09-19",
    starts_at: "2026-09-19T22:00:00+09:00",
    ends_at: "2026-09-20T06:00:00+09:00",
    expected_assignees: [{ userId: "worker", name: "작업자" }],
    tbm_users: [],
    during_count: 0,
  };
  assert.equal(
    sessionState(session, new Date("2026-09-19T19:59:59+09:00")).state,
    "SCHEDULED",
  );
  assert.equal(
    sessionState(session, new Date("2026-09-19T20:00:00+09:00")).open,
    true,
  );
  assert.equal(
    sessionState(session, new Date("2026-09-20T00:30:00+09:00")).open,
    true,
  );
  assert.equal(
    sessionState(session, new Date("2026-09-20T08:00:00+09:00")).open,
    true,
  );
  assert.equal(
    sessionState(session, new Date("2026-09-20T08:00:01+09:00")).state,
    "MISSED",
  );
  assert.equal(
    sessionState(
      { ...session, tbm_users: ["worker"], during_count: 1 },
      new Date("2026-09-20T09:00:00+09:00"),
    ).state,
    "DONE",
  );
});
test("work order: approval required; repeated concurrent issue is atomic and preserves snapshots", async () => {
  const { actor, id, worker } = await orderFixture();
  await assert.rejects(
    transaction((c) => issueOrder(c, actor, id, 1)),
    /승인/,
  );
  await transaction((c) => requestAssessment(c, actor, id, 1));
  await assert.rejects(
    transaction((c) => approveAssessment(c, actor, id, 2, false)),
    /다른 관리자/,
  );
  await transaction((c) => approveAssessment(c, actor, id, 2, true));
  const results = await Promise.allSettled(
    [1, 2].map(() => transaction((c) => issueOrder(c, actor, id, 3))),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const order = await transaction((c) =>
    readOrder(c, { ...actor, userId: worker }, id),
  );
  assert.equal(order.issue_version, 1);
  assert.equal(order.status, "ISSUED");
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM work_order_snapshots WHERE work_order_id=$1",
        [id],
      )
    ).rows[0].n,
    2,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM work_order_checklist_items WHERE work_order_id=$1",
        [id],
      )
    ).rows[0].n,
    2,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM work_order_outputs WHERE work_order_id=$1",
        [id],
      )
    ).rows[0].n,
    1,
  );
  await pool.query(
    "UPDATE risk_assessment_items SET hazard='changed source' WHERE assessment_id=$1",
    [order.risk_assessment_id],
  );
  const snapshot = (
    await pool.query(
      "SELECT payload FROM work_order_snapshots WHERE work_order_id=$1 AND snapshot_kind='RISK_ASSESSMENT'",
      [id],
    )
  ).rows[0].payload;
  assert.equal(snapshot.items[0].hazard, "테스트 위험");
  assert.equal(
    snapshot.items[0].planned_completion_date,
    seoulToday(new Date(Date.now() + 86400_000)),
  );
  assert.equal(snapshot.items[0].responsible_name, "test");
});
test("work order: explicit approve-and-issue permits self approval and records it once", async () => {
  const { actor, id } = await orderFixture();
  const results = await Promise.allSettled(
    [1, 2].map(() => transaction((c) => approveAndIssueOrder(c, actor, id, 1))),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const row = await transaction((c) => readOrder(c, actor, id));
  assert.equal(row.assessment_status, "APPROVED");
  assert.equal(row.status, "ISSUED");
  assert.equal(row.approved_by, actor.userId);
  const audit = (
    await pool.query(
      "SELECT is_self_approval FROM audit_logs WHERE target_id=$1 AND action='APPROVE_ASSESSMENT'",
      [id],
    )
  ).rows;
  assert.equal(audit.length, 1);
  assert.equal(audit[0].is_self_approval, true);
});

test("work order: failed combined issue rolls back newly created approval and snapshots", async () => {
  const { actor, id, d } = await orderFixture();
  await transaction((c) =>
    saveOrder(c, actor, id, 1, {
      ...d,
      startDate: "2020-01-01",
      endDate: "2020-01-01",
    }),
  );
  await assert.rejects(
    transaction((c) => approveAndIssueOrder(c, actor, id, 2)),
    /종료/,
  );
  const row = await transaction((c) => readOrder(c, actor, id));
  assert.equal(row.status, "DRAFT");
  assert.equal(row.risk_assessment_id, null);
  assert.equal(row.revision, 2);
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM risk_assessments WHERE company_id=$1",
        [actor.companyId],
      )
    ).rows[0].n,
    0,
  );
});

test("work order: stale edits are rejected and editing invalidates approval without deleting past assessment", async () => {
  const { actor, id, d } = await approvedOrder();
  await assert.rejects(
    transaction((c) => saveOrder(c, actor, id, 1, d)),
    /변경/,
  );
  await transaction((c) =>
    saveOrder(c, actor, id, 3, { ...d, method: "변경" }),
  );
  const order = await transaction((c) => readOrder(c, actor, id));
  assert.equal(order.risk_assessment_id, null);
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM risk_assessments WHERE company_id=$1 AND status='APPROVED'",
        [actor.companyId],
      )
    ).rows[0].n,
    1,
  );
  await assert.rejects(
    transaction((c) => issueOrder(c, actor, id, 4)),
    /승인/,
  );
});
test("work order: tenant boundary, worker permissions and assignment scope", async () => {
  const { actor, id, d, worker } = await approvedOrder();
  const outsider = await fixture();
  await assert.rejects(transaction((c) => readOrder(c, outsider, id)));
  await assert.rejects(
    transaction((c) => readOrder(c, { ...actor, userId: worker }, id)),
  );
  await assert.rejects(
    transaction((c) =>
      saveOrder(c, { ...actor, userId: worker }, randomUUID(), 0, d),
    ),
  );
  await assert.rejects(
    transaction((c) =>
      saveOrder(c, actor, randomUUID(), 0, {
        ...d,
        assigneeIds: [outsider.userId],
      }),
    ),
  );
  await transaction((c) => issueOrder(c, actor, id, 3));
  const unassigned = await user();
  await member(actor.companyId, unassigned);
  await assert.rejects(
    transaction((c) => readOrder(c, { ...actor, userId: unassigned }, id)),
  );
  await transaction((c) => readOrder(c, { ...actor, userId: worker }, id));
});
test("PTW: explicit self approval issues once and cancellation invalidates permit", async () => {
  const f = await orderFixture(true);
  const locationId = await transaction((c) =>
    addLocation(c, f.actor, "허가 테스트 장소"),
  );
  const input = {
    locationId,
    approverId: f.actor.userId,
    responsibleId: f.actor.userId,
    equipment: "용접기",
    notes: "",
    hotWork: true,
    fireWatcherId: f.worker,
    contacts: [{ name: "비상", phone: "01012345678" }],
  };
  await assert.rejects(
    transaction((c) => requestPermit(c, f.actor, f.id, 1, input, false)),
    /자가 승인/,
  );
  await transaction((c) => requestPermit(c, f.actor, f.id, 1, input, true));
  const p = (
    await pool.query("SELECT * FROM work_permits WHERE work_order_id=$1", [
      f.id,
    ])
  ).rows[0];
  assert.equal(p.status, "APPROVED");
  assert.equal(p.self_approval, true);
  const o = await transaction((c) => readOrder(c, f.actor, f.id));
  assert.equal(o.status, "ISSUED");
  await assert.rejects(
    transaction((c) => decidePermit(c, f.actor, f.id, p.revision, "approve")),
  );
  await transaction((c) => cancelOrder(c, f.actor, f.id, o.revision, "취소"));
  assert.equal(
    (
      await pool.query(
        "SELECT status FROM work_permits WHERE work_order_id=$1",
        [f.id],
      )
    ).rows[0].status,
    "INVALID",
  );
});
test("PTW: assigned approval, locking, rejection and request history", async () => {
  const f = await orderFixture(true),
    reviewer = await user();
  await member(f.actor.companyId, reviewer, "MANAGER_SAFETY");
  const locationId = await transaction((c) => addLocation(c, f.actor, "장소"));
  const input = {
    locationId,
    approverId: reviewer,
    responsibleId: f.actor.userId,
    equipment: "설비",
    notes: "",
    hotWork: false,
    fireWatcherId: "",
    contacts: [{ name: "비상", phone: "01012345678" }],
  };
  await transaction((c) => requestPermit(c, f.actor, f.id, 1, input, false));
  let o = await transaction((c) => readOrder(c, f.actor, f.id));
  assert.equal(o.status, "ISSUE_PENDING");
  await assert.rejects(
    transaction((c) => saveOrder(c, f.actor, f.id, o.revision, f.d)),
  );
  await assert.rejects(
    transaction((c) => decidePermit(c, f.actor, f.id, 1, "approve")),
    /담당자/,
  );
  const reviewerActor = { ...f.actor, userId: reviewer };
  await assert.rejects(
    transaction((c) => decidePermit(c, reviewerActor, f.id, 1, "reject", "")),
    /반려 사유/,
  );
  await transaction((c) =>
    decidePermit(c, reviewerActor, f.id, 1, "reject", "내용 보완"),
  );
  o = await transaction((c) => readOrder(c, f.actor, f.id));
  assert.equal(o.status, "DRAFT");
  await transaction((c) =>
    requestPermit(c, f.actor, f.id, o.revision, input, false),
  );
  const p = (
    await pool.query(
      "SELECT revision FROM work_permits WHERE work_order_id=$1",
      [f.id],
    )
  ).rows[0];
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      transaction((c) =>
        decidePermit(c, reviewerActor, f.id, p.revision, "approve"),
      ),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int n FROM work_permit_events WHERE permit_id=(SELECT id FROM work_permits WHERE work_order_id=$1)",
        [f.id],
      )
    ).rows[0].n,
    4,
  );
});
test("PTW: tenant targets and expired approval rejected, withdrawal returns draft", async () => {
  const f = await orderFixture(true),
    foreign = await fixture(),
    reviewer = await user();
  await member(f.actor.companyId, reviewer, "MANAGER_SAFETY");
  const locationId = await transaction((c) =>
    addLocation(c, foreign, "외부 장소"),
  );
  const input = {
    locationId,
    approverId: reviewer,
    responsibleId: f.actor.userId,
    equipment: "설비",
    notes: "",
    hotWork: false,
    fireWatcherId: "",
    contacts: [{ name: "비상", phone: "01012345678" }],
  };
  await assert.rejects(
    transaction((c) => requestPermit(c, f.actor, f.id, 1, input, false)),
    /장소/,
  );
  input.locationId = await transaction((c) =>
    addLocation(c, f.actor, "내 장소"),
  );
  await transaction((c) => requestPermit(c, f.actor, f.id, 1, input, false));
  await pool.query(
    "UPDATE work_orders SET draft_data=jsonb_set(draft_data,'{startDate}',to_jsonb(((now() AT TIME ZONE 'Asia/Seoul')::date-1)::text)) WHERE id=$1",
    [f.id],
  );
  await assert.rejects(
    transaction((c) =>
      decidePermit(c, { ...f.actor, userId: reviewer }, f.id, 1, "approve"),
    ),
    /시작일/,
  );
  await transaction((c) => decidePermit(c, f.actor, f.id, 1, "withdraw"));
  assert.equal(
    (await transaction((c) => readOrder(c, f.actor, f.id))).status,
    "DRAFT",
  );
});
test("PTW: post-issue request does not block inspections and reassign revokes old approver", async () => {
  const f = await inspectionFixture(),
    reviewer = await user(),
    replacement = await user();
  await member(f.actor.companyId, reviewer, "MANAGER_SAFETY");
  await member(f.actor.companyId, replacement, "MANAGER_SAFETY");
  const locationId = await transaction((c) =>
    addLocation(c, f.actor, "테스트 장소"),
  );
  const order = await transaction((c) => readOrder(c, f.actor, f.id));
  const input = {
    locationId,
    approverId: reviewer,
    responsibleId: f.actor.userId,
    equipment: "설비",
    notes: "",
    hotWork: false,
    fireWatcherId: "",
    contacts: [{ name: "비상", phone: "01012345678" }],
  };
  await transaction((c) =>
    requestPermit(c, f.actor, f.id, order.revision, input, false),
  );
  await transaction((c) => submitInspection(c, f.workerActor, f.input()));
  await transaction((c) =>
    decidePermit(c, f.actor, f.id, 1, "reassign", replacement),
  );
  await assert.rejects(
    transaction((c) =>
      decidePermit(c, { ...f.actor, userId: reviewer }, f.id, 2, "approve"),
    ),
    /담당자/,
  );
  await transaction((c) =>
    decidePermit(c, { ...f.actor, userId: replacement }, f.id, 2, "approve"),
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int n FROM work_sessions WHERE work_order_id=$1",
        [f.id],
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int n FROM inspections WHERE session_id=$1",
        [f.session.id],
      )
    ).rows[0].n,
    1,
  );
});
test("work order: PTW cannot be bypassed; departed assignees block issue", async () => {
  const setup = await approvedOrder(true);
  await assert.rejects(
    transaction((c) => issueOrder(c, setup.actor, setup.id, 3)),
    /PTW/,
  );
  await assert.rejects(
    transaction((c) =>
      saveOrder(c, setup.actor, setup.id, 3, {
        ...setup.d,
        ptwRequired: false,
      }),
    ),
    /PTW/,
  );
  const normal = await approvedOrder();
  await pool.query(
    "UPDATE company_members SET status='RESIGNED',left_at=now() WHERE user_id=$1",
    [normal.worker],
  );
  await assert.rejects(
    transaction((c) => issueOrder(c, normal.actor, normal.id, 3)),
    /활성 구성원/,
  );
});
test("work order: cancellation requires reason, preserves records, and blocks later mutation", async () => {
  const { actor, id, d } = await approvedOrder();
  await transaction((c) => issueOrder(c, actor, id, 3));
  await assert.rejects(transaction((c) => cancelOrder(c, actor, id, 4, "")));
  await transaction((c) => cancelOrder(c, actor, id, 4, "테스트 취소"));
  assert.equal(
    (await transaction((c) => readOrder(c, actor, id))).status,
    "CANCELED",
  );
  await assert.rejects(transaction((c) => saveOrder(c, actor, id, 5, d)));
  await assert.rejects(transaction((c) => issueOrder(c, actor, id, 5)));
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM work_order_snapshots WHERE work_order_id=$1",
        [id],
      )
    ).rows[0].n,
    2,
  );
});
test("work order: old free records deny direct access, Pro allows access", async () => {
  const { actor, id } = await approvedOrder();
  await transaction((c) => issueOrder(c, actor, id, 3));
  await pool.query(
    `UPDATE work_orders SET draft_data=jsonb_set(jsonb_set(draft_data,'{startDate}','"2020-01-01"'),'{endDate}','"2020-01-01"') WHERE id=$1`,
    [id],
  );
  await assert.rejects(
    transaction((c) => readOrder(c, actor, id)),
    /최근 1주일/,
  );
  await pool.query(
    // 유료 전환은 구간·결제 기준일을 함께 세팅해야 한다 (0012 제약).
    "UPDATE companies SET pro_state='PRO_VOLUNTARY', plan='BASIC', plan_started_at=now() WHERE id=$1",
    [actor.companyId],
  );
  assert.equal(
    (await transaction((c) => readOrder(c, actor, id))).status,
    "COMPLETED",
  );
});
test("work order: input, overnight 16h limit and Korea session window boundaries", () => {
  assert.equal(shiftMinutes("20:00", "08:00"), 720);
  assert.equal(shiftMinutes("00:00", "00:00"), 0);
  const valid = {
    ...blankDraft(),
    startDate: "2026-09-19",
    endDate: "2026-09-19",
    startTime: "08:00",
    endTime: "00:00",
    location: "test",
    assigneeIds: [randomUUID()],
  };
  assert.doesNotThrow(() => validateSchedule(valid));
  assert.throws(
    () => validateSchedule({ ...valid, endTime: "00:01" }),
    /16시간/,
  );
  assert.throws(
    () => validateSchedule({ ...valid, startDate: "2026-02-30" }),
    /작업기간/,
  );
  const draft = blankDraft();
  assert.throws(() => validateIssue(draft));
  const schedule = {
    startDate: "2026-09-19",
    endDate: "2026-09-19",
    startTime: "20:00",
    endTime: "08:00",
  };
  assert.equal(
    effectiveStatus("ISSUED", schedule, new Date("2026-09-19T17:59:59+09:00")),
    "ISSUED",
  );
  assert.equal(
    effectiveStatus("ISSUED", schedule, new Date("2026-09-19T18:00:00+09:00")),
    "IN_PROGRESS",
  );
  assert.equal(
    effectiveStatus("ISSUED", schedule, new Date("2026-09-20T09:59:59+09:00")),
    "IN_PROGRESS",
  );
  assert.equal(
    effectiveStatus("ISSUED", schedule, new Date("2026-09-20T10:00:01+09:00")),
    "COMPLETED",
  );
});

test("worker link token: opens for its assignee and dies on reissue, revoke, expiry, cancellation and departure", async () => {
  const setup = await inspectionFixture();
  const target = {
    workOrderId: setup.id,
    issueVersion: 1,
    userId: setup.worker,
  };
  const future = new Date(Date.now() + 86400_000);
  const token = await transaction((c) => issueAccessToken(c, target, future));

  const grant = await transaction((c) => resolveAccessToken(c, token));
  assert.equal(grant?.workOrderId, setup.id);
  assert.equal(grant?.worker.userId, setup.worker);
  assert.deepEqual(linkActor(grant!), {
    companyId: setup.actor.companyId,
    userId: setup.worker,
  });

  // 모양이 어긋난 토큰과 존재하지 않는 토큰은 조용히 거절한다.
  assert.equal(
    await transaction((c) => resolveAccessToken(c, "too-short")),
    null,
  );
  assert.equal(
    await transaction((c) => resolveAccessToken(c, "A".repeat(22))),
    null,
  );

  // 열람 기록은 첫 시각을 보존하고 최신값만 덮어쓴다.
  await transaction((c) =>
    recordLinkOpen(c, grant!, { ip: "203.0.113.9", userAgent: "probe/1" }),
  );
  await transaction((c) =>
    recordLinkOpen(c, grant!, { ip: "203.0.113.10", userAgent: "probe/2" }),
  );
  const opened = (
    await pool.query(
      `SELECT open_count, first_opened_at, last_opened_at, last_open_ip
         FROM work_order_access_grants WHERE work_order_id=$1 AND user_id=$2`,
      [setup.id, setup.worker],
    )
  ).rows[0];
  assert.equal(opened.open_count, 2);
  assert.equal(opened.last_open_ip, "203.0.113.10");
  assert.ok(opened.first_opened_at <= opened.last_opened_at);

  // 재발급하면 이전 링크가 그 순간 죽고, 열람 기록도 새 회차로 초기화된다.
  const reissued = await transaction((c) =>
    issueAccessToken(c, target, future),
  );
  assert.equal(await transaction((c) => resolveAccessToken(c, token)), null);
  assert.ok(await transaction((c) => resolveAccessToken(c, reissued)));
  assert.equal(
    (
      await pool.query(
        "SELECT open_count FROM work_order_access_grants WHERE work_order_id=$1 AND user_id=$2",
        [setup.id, setup.worker],
      )
    ).rows[0].open_count,
    0,
  );

  // 폐기
  await transaction((c) => revokeAccessToken(c, target));
  assert.equal(await transaction((c) => resolveAccessToken(c, reissued)), null);

  // 만료 (발급 API 는 과거 시각을 거부하므로 직접 되돌린다)
  const live = await transaction((c) => issueAccessToken(c, target, future));
  await pool.query(
    // 발급시각도 함께 되돌린다. expiry_shape 제약이 만료 < 발급을 막는다.
    `UPDATE work_order_access_grants
        SET token_issued_at = now() - interval '2 hours',
            token_expires_at = now() - interval '1 minute'
      WHERE work_order_id=$1 AND user_id=$2`,
    [setup.id, setup.worker],
  );
  assert.equal(await transaction((c) => resolveAccessToken(c, live)), null);

  // 퇴사자는 자동으로 막힌다.
  const active = await transaction((c) => issueAccessToken(c, target, future));
  assert.ok(await transaction((c) => resolveAccessToken(c, active)));
  await pool.query(
    "UPDATE company_members SET status='RESIGNED', left_at=now() WHERE company_id=$1 AND user_id=$2",
    [setup.actor.companyId, setup.worker],
  );
  assert.equal(await transaction((c) => resolveAccessToken(c, active)), null);
});

test("seat cap: paid plans block the next member, free is unlimited, and raising the plan reopens it", async () => {
  const setup = await fixture();
  const actor = { userId: setup.userId, companyId: setup.companyId };
  const capacity = () =>
    transaction((c) => seatCapacityError(c, setup.companyId));
  const setPlan = (plan: string | null) =>
    pool.query(
      plan === null
        ? `UPDATE companies SET pro_state='FREE', plan=NULL, plan_started_at=NULL WHERE id=$1`
        : `UPDATE companies SET pro_state='PRO_VOLUNTARY', plan=$2, plan_started_at=now() WHERE id=$1`,
      plan === null ? [setup.companyId] : [setup.companyId, plan],
    );

  // 무료는 인원 제한이 없다 — 무료는 기능이 제한된다.
  await pool.query("UPDATE companies SET active_headcount=999 WHERE id=$1", [
    setup.companyId,
  ]);
  assert.equal(await capacity(), null);

  // 실제 구성원 수로 판정한다 (active_headcount 캐시가 아니라).
  await setPlan("BASIC");
  assert.equal(await capacity(), null);

  const extras = [];
  for (let i = 0; i < 18; i++) extras.push(await user());
  for (const id of extras) await member(setup.companyId, id, "WORKER");

  const blocked = await capacity();
  assert.match(blocked ?? "", /Basic/);
  assert.match(blocked ?? "", /19명까지/);
  assert.match(blocked ?? "", /Standard/);

  // 승인 경로가 실제로 막히는지 (차단은 여기서 일어난다).
  const applicant = await user();
  const pending = (
    await pool.query(
      `INSERT INTO company_members(user_id,company_id,role,status,joined_via,snapshot_display_name)
       VALUES ($1,$2,'WORKER','JOIN_PENDING','DIRECT_JOIN','대기자') RETURNING id`,
      [applicant, setup.companyId],
    )
  ).rows[0].id;
  const denied = await transaction((c) =>
    mutateMember(c, actor, pending, "approve"),
  );
  assert.match(denied.error ?? "", /Basic/);
  assert.equal(
    (
      await pool.query("SELECT status FROM company_members WHERE id=$1", [
        pending,
      ])
    ).rows[0].status,
    "JOIN_PENDING",
  );

  // 구간을 올리면 다시 열린다.
  await setPlan("STANDARD");
  assert.equal(await capacity(), null);
  const allowed = await transaction((c) =>
    mutateMember(c, actor, pending, "approve"),
  );
  assert.equal(allowed.error, undefined);

  // 개별 협의 계약은 상한이 없다.
  await setPlan("ENTERPRISE");
  assert.equal(await capacity(), null);
  await setPlan(null);
});

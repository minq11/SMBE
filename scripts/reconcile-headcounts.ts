import { Pool } from "@neondatabase/serverless";
import { config } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { databaseUrl } from "../src/server/config";
import { refreshHeadcount } from "../src/server/membership-mutations";

// Run after deploying the fixed writers; default mode never writes to the DB.
config({ path: [".env.local", ".env"], quiet: true });
async function main() {
  if (process.argv.slice(2).some((arg) => arg !== "--apply")) {
    throw new Error("Usage: npm run db:reconcile-headcounts -- [--apply]");
  }
  const apply = process.argv.includes("--apply");
  const pool = new Pool({ connectionString: databaseUrl() });
  const client = await pool.connect();
  try {
    await client.query(apply ? "BEGIN" : "BEGIN READ ONLY");
    if (apply) {
      await client.query("SET LOCAL lock_timeout = '5s'");
      // Also excludes writes from an older deployment during this short repair.
      await client.query(
        "LOCK TABLE companies, company_members IN SHARE ROW EXCLUSIVE MODE",
      );
    }
    const { rows } = await client.query<{
      id: string;
      active_headcount: number;
      current_employee_size_band: string | null;
      actual_count: number;
      actual_band: string;
    }>(`
      WITH counts AS (
        SELECT c.id, c.active_headcount, c.current_employee_size_band,
          count(m.id)::int AS actual_count
        FROM companies c LEFT JOIN company_members m
          ON m.company_id = c.id AND m.status = 'ACTIVE' AND m.left_at IS NULL
        GROUP BY c.id
      ), expected AS (
        SELECT *, CASE WHEN actual_count < 5 THEN 'UNDER_5'
          WHEN actual_count < 20 THEN 'FROM_5_TO_19'
          WHEN actual_count < 50 THEN 'FROM_20_TO_49'
          ELSE 'FROM_50' END AS actual_band FROM counts
      )
      SELECT * FROM expected WHERE active_headcount <> actual_count
        OR current_employee_size_band::text IS DISTINCT FROM actual_band
      ORDER BY id
    `);
    console.log(
      `Headcount mismatches: ${rows.length}; mode: ${apply ? "apply" : "read-only"}`,
    );
    if (apply && rows.length) {
      const directory = resolve(".local-backups");
      await mkdir(directory, { recursive: true });
      const backup = resolve(directory, `headcounts-${randomUUID()}.json`);
      // A failed backup prevents the DB update. This file contains no credentials.
      await writeFile(
        backup,
        JSON.stringify({ at: new Date().toISOString(), rows }, null, 2),
        { flag: "wx", mode: 0o600 },
      );
      for (const row of rows) await refreshHeadcount(client, row.id);
      console.log(`Before/expected values saved: ${backup}`);
    }
    await client.query("COMMIT");
    console.log(
      apply ? "Reconciliation committed." : "No database changes made.",
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
void main().catch(() => {
  // Never print connection strings or raw driver errors.
  console.error(
    "Reconciliation failed; no pending transaction was committed. Check connectivity, permissions and locks.",
  );
  process.exitCode = 1;
});

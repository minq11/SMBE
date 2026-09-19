// Generate an isolated browser-test build. The production DB adapter is never
// changed: only the temporary copy connects to disposable local PostgreSQL.
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { Pool } from "pg";

const source = process.cwd();
const schema = "orders_ui_" + randomUUID().replaceAll("-", "");
const directory = await mkdtemp(join(tmpdir(), "smbe-orders-ui-"));
const pool = new Pool({
  connectionString:
    "postgresql://postgres:smbe-test-only@127.0.0.1:55439/smbe_regression",
  options: "-c search_path=" + schema + ",public",
});
const setupPool = new Pool({
  connectionString:
    "postgresql://postgres:smbe-test-only@127.0.0.1:55439/smbe_regression",
});
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Run with npm run test:orders-ui");
const env = {
  ...process.env,
  DATABASE_URL: "",
  RESEND_API_KEY: "",
  EMAIL_FROM: "",
  AUTH_SECRET: "smbe-isolated-browser-test-secret-only",
  AUTH_TRUST_HOST: "true",
  SMBE_OPERATOR_EMAILS: "",
  APP_URL: "http://127.0.0.1:3100",
  SMBE_ORDER_UI_TESTS: "1",
  SMBE_ORDER_UI_SCHEMA: schema,
};
const run = (args) =>
  execFileSync(process.execPath, [npmCli, ...args], {
    cwd: directory,
    env,
    stdio: "inherit",
  });
try {
  await setupPool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA public");
  await setupPool.query("CREATE EXTENSION IF NOT EXISTS citext SCHEMA public");
  await pool.query("CREATE SCHEMA " + schema);
  for (const migration of [
    "0001_init.sql",
    "0002_company_required_fields.sql",
    "0003_work_orders.sql",
    "0004_inspections.sql",
  ]) {
    await pool.query(await readFile(join(source, "db", migration), "utf8"));
  }
  const omitted = new Set([
    "node_modules",
    ".next",
    ".git",
    ".local-backups",
    "test-results",
    "playwright-report",
    ".claude",
  ]);
  await cp(source, directory, {
    recursive: true,
    filter: (path) =>
      !relative(source, path)
        .split(sep)
        .some((part) => omitted.has(part) || part.startsWith(".env")),
  });
  const dbPath = join(directory, "src/server/db.ts");
  const original = await readFile(dbPath, "utf8");
  const patched = original
    .replace(
      'import { Pool, type PoolClient } from "@neondatabase/serverless";',
      'import { Pool as TcpPool } from "pg";\nimport type { Pool as NeonPool, PoolClient } from "@neondatabase/serverless";\nconst Pool = TcpPool as unknown as typeof NeonPool;\ntype Pool = NeonPool;',
    )
    .replace('import { databaseUrl } from "./config";', "")
    .replace(
      "connectionString: databaseUrl()",
      'connectionString: "postgresql://postgres:smbe-test-only@127.0.0.1:55439/smbe_regression", options: "-c search_path=' +
        schema +
        ',public"',
    );
  if (patched === original || patched.includes("databaseUrl()"))
    throw new Error("Test DB adapter replacement failed");
  await writeFile(dbPath, patched);
  console.log("Isolated UI verification: " + directory);
  run(["ci", "--no-audit", "--no-fund"]);
  run(["run", "build"]);
  run([
    "exec",
    "--",
    "playwright",
    "test",
    "tests/work-orders.spec.ts",
    "tests/inspections.spec.ts",
    "tests/preview.spec.ts",
    "--workers=1",
  ]);
} finally {
  await pool.query("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
  await pool.end();
  await setupPool.end();
  await cp(
    join(directory, "test-results"),
    join(source, "test-results", "orders-ui"),
    { recursive: true },
  ).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
  console.log(
    "Screenshots and traces retained in: " + join(directory, "test-results"),
  );
}

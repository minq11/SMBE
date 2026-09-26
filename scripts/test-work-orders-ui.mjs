// Generate an isolated browser-test build. The production DB adapter is never
// changed: only the temporary copy connects to disposable local PostgreSQL.
import { cp, mkdir, readFile, rm, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { Pool } from "pg";

const source = process.cwd();
const schema = "orders_ui_" + randomUUID().replaceAll("-", "");
// 작업 폴더는 하나를 계속 쓴다. 매번 새 폴더에 npm ci(약 50초)를 하던 것을, 설치한
// node_modules 와 .next 빌드 캐시를 남겨 재사용한다. 소스는 매번 새로 덮는다.
// 같은 폴더를 쓰므로 이 스크립트를 동시에 두 번 돌리지 않는다.
const directory = join(tmpdir(), "smbe-orders-ui-work");
const kept = new Set(["node_modules", ".next", ".installed-lock"]);
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
  // 오늘의 안전소식 시험용 운영자. 토큰에 이 이메일을 넣은 사용자만 운영자다.
  SMBE_OPERATOR_EMAILS: "operator@test.local",
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
  await setupPool.query(
    "CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA public",
  );
  await setupPool.query("CREATE EXTENSION IF NOT EXISTS citext SCHEMA public");
  await pool.query("CREATE SCHEMA " + schema);
  for (const migration of (await readdir(join(source, "db")))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort()) {
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
  await mkdir(directory, { recursive: true });
  // 지난번 소스를 지운다 (지운 파일이 남아 빌드에 섞이지 않게). 설치물·캐시는 남긴다.
  for (const name of await readdir(directory))
    if (!kept.has(name))
      await rm(join(directory, name), { recursive: true, force: true });
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
  // 잠금 파일이 그대로면 설치도 그대로다.
  const lock = await readFile(join(source, "package-lock.json"), "utf8");
  const installed = await readFile(
    join(directory, ".installed-lock"),
    "utf8",
  ).catch(() => "");
  if (installed !== lock) {
    run(["ci", "--no-audit", "--no-fund"]);
    await writeFile(join(directory, ".installed-lock"), lock);
  }
  run(["run", "build"]);
  run([
    "exec",
    "--",
    "playwright",
    "test",
    ...(process.argv.length > 2
      ? process.argv.slice(2)
      : [
          "tests/work-orders.spec.ts",
          "tests/inspections.spec.ts",
          "tests/preview.spec.ts",
          "tests/mobile-layout.spec.ts",
          "tests/profile.spec.ts",
          "tests/ptw.spec.ts",
          "tests/standards.spec.ts",
          "tests/board.spec.ts",
        ]),
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
  // 결과는 위에서 저장소의 test-results/orders-ui 로 옮겼다. 작업 폴더는 하나라
  // 디스크가 쌓이지 않는다 (전에는 돌릴 때마다 1.1GB 복사본이 새로 생겼다).
  await rm(join(directory, "test-results"), { recursive: true, force: true });
  console.log("Screenshots and traces: test-results/orders-ui");
}

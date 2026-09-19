import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "@neondatabase/serverless";
import { config } from "dotenv";
import { databaseUrl } from "../src/server/config";

config({ path: [".env.local", ".env"], quiet: true });

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, "..", "db");

async function readMigrations() {
  const entries = await fs.readdir(migrationsDir);
  return entries
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({
      version: name.replace(/\.sql$/, ""),
      file: path.join(migrationsDir, name),
    }));
}

async function main() {
  const url = databaseUrl();
  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    const applied = await client.query<{ version: string }>(
      "SELECT version FROM schema_migrations",
    );
    const appliedSet = new Set(applied.rows.map((row) => row.version));

    const migrations = await readMigrations();
    if (migrations.length === 0) {
      console.log("no migrations found in db/");
      return;
    }

    for (const { version, file } of migrations) {
      if (appliedSet.has(version)) {
        console.log(`skip  ${version}`);
        continue;
      }
      const sqlText = await fs.readFile(file, "utf8");
      console.log(`apply ${version}`);
      await client.query("BEGIN");
      try {
        await client.query(sqlText);
        await client.query(
          "INSERT INTO schema_migrations (version) VALUES ($1)",
          [version],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    console.log("done");
  } finally {
    client.release();
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

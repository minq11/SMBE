import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
import { databaseUrl } from "../src/server/config";

config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const sql = neon(databaseUrl());
  const tables = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `;
  const types = await sql`
    SELECT t.typname AS name,
           string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS values
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    GROUP BY t.typname
    ORDER BY t.typname
  `;
  const migrations = await sql`
    SELECT version, applied_at
    FROM schema_migrations
    ORDER BY version
  `;
  console.log("tables:");
  for (const row of tables as { table_name: string }[]) {
    console.log("  " + row.table_name);
  }
  console.log("\nenums:");
  for (const row of types as { name: string; values: string }[]) {
    console.log(`  ${row.name}: ${row.values}`);
  }
  console.log("\napplied migrations:");
  for (const row of migrations as { version: string; applied_at: Date }[]) {
    console.log(`  ${row.version} @ ${row.applied_at.toISOString()}`);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

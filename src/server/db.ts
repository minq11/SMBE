import "server-only";
import { Pool, type PoolClient } from "@neondatabase/serverless";
import { databaseUrl } from "./config";

// Neon serverless Pool uses WebSocket. Node 22+ has native WebSocket, so
// no extra polyfill is required. Kept as a module-level singleton so hot
// reloads in dev do not exhaust the connection budget.

declare global {
  var __smbePgPool: Pool | undefined;
}

function getPool(): Pool {
  if (!globalThis.__smbePgPool) {
    globalThis.__smbePgPool = new Pool({ connectionString: databaseUrl() });
  }
  return globalThis.__smbePgPool;
}

export async function query<T extends Record<string, unknown>>(
  text: string,
  params?: readonly unknown[],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params as unknown[]);
  return result.rows;
}

export async function queryOne<T extends Record<string, unknown>>(
  text: string,
  params?: readonly unknown[],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const value = await fn(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

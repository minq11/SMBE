import type { PoolClient } from "@neondatabase/serverless";

export async function resolveIdentity(
  client: PoolClient,
  providerCode: string,
  providerUserId: string,
  displayName: string,
  email: string | null,
): Promise<string> {
  // Serialize callbacks for the same OAuth identity, then recheck after waiting.
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    JSON.stringify([providerCode, providerUserId]),
  ]);
  const { rows: identities } = await client.query<{ user_id: string }>(
    "SELECT user_id FROM user_identities WHERE provider = $1 AND provider_user_id = $2",
    [providerCode, providerUserId],
  );
  if (identities[0]) return identities[0].user_id;
  let userId: string;
  await client.query("SAVEPOINT create_user");
  try {
    const { rows } = await client.query<{ id: string }>(
      "INSERT INTO users (display_name, email) VALUES ($1, $2) RETURNING id",
      [displayName, email],
    );
    userId = rows[0].id;
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    // 다른 provider로 이미 가입된 이메일이면 자동 병합하지 않고 이메일 없이 새 계정으로 생성한다.
    // 병합 규칙은 v5.5 확인사항.
    if (email && code === "23505") {
      await client.query("ROLLBACK TO SAVEPOINT create_user");
      const { rows } = await client.query<{ id: string }>(
        "INSERT INTO users (display_name, email) VALUES ($1, NULL) RETURNING id",
        [displayName],
      );
      userId = rows[0].id;
    } else {
      throw error;
    }
  }
  await client.query("RELEASE SAVEPOINT create_user");
  await client.query(
    "INSERT INTO user_identities (user_id, provider, provider_user_id) VALUES ($1, $2, $3)",
    [userId, providerCode, providerUserId],
  );
  return userId;
}

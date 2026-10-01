import type { PoolClient } from "@neondatabase/serverless";

async function findUserIdByEmail(
  client: PoolClient,
  email: string,
): Promise<string | null> {
  // users.email 은 citext 라 대소문자 차이는 알아서 같은 값으로 본다.
  // partial unique index 가 걸려 있어 결과는 0 또는 1 행이다.
  const { rows } = await client.query<{ id: string }>(
    "SELECT id FROM users WHERE email = $1",
    [email],
  );
  return rows[0]?.id ?? null;
}

/**
 * 소셜 로그인 한 건을 앱 계정(users.id)으로 바꾼다.
 *
 * 같은 사람인지 판단하는 근거는 둘이다.
 *
 * 1. `(provider, provider_user_id)` — 같은 소셜 계정으로 다시 들어온 경우.
 * 2. **이메일** — 다른 소셜 계정이지만 같은 사람인 경우. 구글·네이버·카카오는
 *    모두 자기들이 확인한 계정 이메일만 넘기므로 "같은 이메일 = 같은 사람"
 *    으로 보고 기존 계정에 identity 행만 붙인다.
 *
 * 2번이 없으면 같은 사람이 구글로 한 번, 네이버로 한 번 로그인했을 때 계정이
 * 둘로 갈라진다. 두 번째 계정에는 company_members 행이 없어서 사용자는
 * "소속된 회사가 없습니다" 화면을 보고 자기 데이터가 사라졌다고 생각한다.
 * 네이버가 넘기는 이메일이 반드시 naver.com 이 아니라 구글과 같은 주소일 수
 * 있어서(네이버 계정은 외부 메일로도 만든다) 실제로 자주 일어난다.
 *
 * 이메일이 없으면(카카오 이메일 미동의) 병합할 근거가 없으므로 새 계정을
 * 만든다. 이미 이메일 없이 만들어진 계정도 나중에 다른 provider 로 들어오면
 * 붙일 수가 없다 — 대조할 값이 없기 때문이다.
 *
 * 탈퇴(`users.status = 'WITHDRAWN'`)는 아직 구현되어 있지 않다. 구현할 때
 * **탈퇴 계정의 이메일을 비우거나 익명화**해야 한다. 그대로 두면 여기서 탈퇴한
 * 계정에 새 로그인이 붙어 조용히 되살아난다.
 */
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

  let userId = email ? await findUserIdByEmail(client, email) : null;

  if (!userId) {
    await client.query("SAVEPOINT create_user");
    try {
      const { rows } = await client.query<{ id: string }>(
        "INSERT INTO users (display_name, email) VALUES ($1, $2) RETURNING id",
        [displayName, email],
      );
      userId = rows[0].id;
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (!email || code !== "23505") throw error;
      // 위 advisory lock 은 같은 identity 끼리만 줄을 세운다. 이메일만 같고
      // identity 가 다른 콜백이 SELECT 와 INSERT 사이에 끼어들면 여기로 온다.
      // 트랜잭션을 되살리고 그쪽이 만든 계정에 붙는다 (결과는 병합과 같다).
      await client.query("ROLLBACK TO SAVEPOINT create_user");
      userId = await findUserIdByEmail(client, email);
      if (!userId) throw error;
    }
    await client.query("RELEASE SAVEPOINT create_user");
  }

  await client.query(
    "INSERT INTO user_identities (user_id, provider, provider_user_id) VALUES ($1, $2, $3)",
    [userId, providerCode, providerUserId],
  );
  return userId;
}

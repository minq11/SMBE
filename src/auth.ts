import "server-only";
import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import Naver from "next-auth/providers/naver";
import Kakao from "next-auth/providers/kakao";
import { queryOne, withTransaction } from "@/server/db";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    appUserId?: string;
  }
}

type ProviderCode = "GOOGLE" | "NAVER" | "KAKAO";

function toProviderCode(providerId: string): ProviderCode | null {
  switch (providerId) {
    case "google":
      return "GOOGLE";
    case "naver":
      return "NAVER";
    case "kakao":
      return "KAKAO";
    default:
      return null;
  }
}

const UNIQUE_VIOLATION = "23505";

async function resolveAppUserId(
  providerCode: ProviderCode,
  providerUserId: string,
  displayName: string,
  email: string | null,
): Promise<string> {
  const existing = await queryOne<{ user_id: string }>(
    "SELECT user_id FROM user_identities WHERE provider = $1 AND provider_user_id = $2",
    [providerCode, providerUserId],
  );
  if (existing) return existing.user_id;

  return withTransaction(async (client) => {
    let userId: string;
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
      if (email && code === UNIQUE_VIOLATION) {
        const { rows } = await client.query<{ id: string }>(
          "INSERT INTO users (display_name, email) VALUES ($1, NULL) RETURNING id",
          [displayName],
        );
        userId = rows[0].id;
      } else {
        throw error;
      }
    }
    await client.query(
      "INSERT INTO user_identities (user_id, provider, provider_user_id) VALUES ($1, $2, $3)",
      [userId, providerCode, providerUserId],
    );
    return userId;
  });
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  providers: [
    Google,
    Naver,
    Kakao,
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!account?.provider || !account.providerAccountId) return false;
      const providerCode = toProviderCode(account.provider);
      if (!providerCode) return false;

      const displayName =
        user.name ?? (profile as { name?: string } | null)?.name ?? "사용자";
      const email = user.email ?? null;

      const appUserId = await resolveAppUserId(
        providerCode,
        account.providerAccountId,
        displayName,
        email,
      );
      (user as { appUserId?: string }).appUserId = appUserId;
      return true;
    },
    async jwt({ token, user }) {
      const appUserId = (user as { appUserId?: string } | undefined)?.appUserId;
      if (appUserId) token.appUserId = appUserId;
      return token;
    },
    async session({ session, token }) {
      if (token.appUserId) {
        session.user.id = token.appUserId;
      }
      return session;
    },
  },
});

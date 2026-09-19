import "server-only";
import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import Naver from "next-auth/providers/naver";
import Kakao from "next-auth/providers/kakao";
import { queryOne, withTransaction } from "@/server/db";
import { resolveIdentity } from "@/server/identity-mutations";

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
    return resolveIdentity(
      client,
      providerCode,
      providerUserId,
      displayName,
      email,
    );
  });
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  providers: [Google, Naver, Kakao],
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

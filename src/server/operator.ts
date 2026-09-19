import "server-only";

import { notFound } from "next/navigation";
import { auth } from "@/auth";

function operatorList(): Set<string> {
  const raw = process.env.SMBE_OPERATOR_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function isCurrentUserOperator(): Promise<boolean> {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) return false;
  return operatorList().has(email);
}

/**
 * 운영자만 접근 허용. 아니면 404 (403보다 존재 자체를 감춤).
 * 로그인 안 된 경우도 마찬가지로 404.
 */
export async function requireOperator(): Promise<{
  userId: string;
  email: string;
}> {
  const session = await auth();
  const userId = session?.user?.id;
  const email = session?.user?.email?.trim().toLowerCase();
  if (!userId || !email || !operatorList().has(email)) {
    notFound();
  }
  return { userId, email };
}

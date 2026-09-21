import { NextResponse, type NextRequest } from "next/server";
import { withTransaction } from "@/server/db";
import {
  resolveAccessToken,
  recordLinkOpen,
  LINK_COOKIE,
} from "@/server/worker-access";

/**
 * 작업자 링크 진입점. 토큰을 검증해 쿠키로 바꾸고 URL 에서 토큰을 지운다.
 *
 * 경로에 토큰이 남으면 액세스 로그·브라우저 히스토리·화면 공유에 그대로 노출된다.
 * 여기서 한 번 교환하고 /w 로 보내면 이후 주소창에는 토큰이 보이지 않는다.
 *
 * 쿠키를 설정해야 하므로 페이지가 아니라 Route Handler 다
 * (서버 컴포넌트 렌더 중에는 쿠키를 쓸 수 없다).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const grant = await withTransaction((c) => resolveAccessToken(c, token));

  // 만료·폐기·재발급·취소·퇴사 중 무엇에 걸렸는지는 알리지 않는다.
  if (!grant)
    return NextResponse.redirect(new URL("/w/expired", request.url), 303);

  // 증빙용 기록. 실패해도 진입을 막지 않는다.
  await withTransaction((c) =>
    recordLinkOpen(c, grant, {
      ip: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    }),
  ).catch(() => {});

  const response = NextResponse.redirect(new URL("/w", request.url), 303);
  response.cookies.set(LINK_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    expires: new Date(grant.expiresAt),
  });
  return response;
}

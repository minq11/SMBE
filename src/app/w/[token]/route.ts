import { NextResponse, type NextRequest } from "next/server";
import { withTransaction } from "@/server/db";
import { configuredOrigin } from "@/server/config";
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
 *
 * 되돌려 보내는 주소는 `request.url` 로 만들지 않는다. 프록시 뒤의 Node 서버는 그 값이
 * `http://0.0.0.0:3000/...` 이라, 작업자가 메일 링크를 누르면 0.0.0.0 으로 튕겼다
 * (사장님 2026-10-06). APP_URL 이 있으면 그것, 없으면 상대 경로(브라우저가 지금 도메인
 * 으로 푼다).
 */
function target(path: string) {
  const origin = configuredOrigin();
  return origin ? origin + path : path;
}
function redirectTo(path: string) {
  // NextResponse.redirect 는 절대 주소만 받는다. 상대 경로는 Location 을 직접 적는다.
  return new NextResponse(null, {
    status: 303,
    headers: { Location: target(path) },
  });
}
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const grant = await withTransaction((c) => resolveAccessToken(c, token));

  // 만료·폐기·재발급·취소·퇴사 중 무엇에 걸렸는지는 알리지 않는다.
  if (!grant) return redirectTo("/w/expired");

  // 증빙용 기록. 실패해도 진입을 막지 않는다.
  await withTransaction((c) =>
    recordLinkOpen(c, grant, {
      ip: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    }),
  ).catch(() => {});

  const response = redirectTo("/w");
  // 프록시 뒤에서는 request.nextUrl 이 http 로 보인다. 실제 바깥 프로토콜로 판단한다.
  const https =
    (request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "")) ===
      "https" || configuredOrigin()?.startsWith("https://") === true;
  response.cookies.set(LINK_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: https,
    path: "/",
    expires: new Date(grant.expiresAt),
  });
  return response;
}

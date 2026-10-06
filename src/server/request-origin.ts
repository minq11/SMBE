import "server-only";
import { headers } from "next/headers";
import { configuredOrigin } from "./config";

/**
 * 요청 안에서 쓰는 링크 기준 주소. APP_URL 이 제대로 있으면 그것, 없으면(또는
 * 0.0.0.0·localhost 처럼 밖에서 열 수 없는 주소면) 지금 요청의 호스트 — 프록시
 * 뒤에서는 x-forwarded-host/proto. 작업자에게 가는 메일 링크가 0.0.0.0 으로 나가던
 * 것을 막는다 (사장님 2026-10-06). 요청 밖(크론·푸시)은 appOrigin() 을 쓴다.
 */
export async function requestOrigin(): Promise<string> {
  const configured = configuredOrigin();
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

import { timingSafeEqual } from "node:crypto";
import { connectionStatus } from "@/server/infrastructure";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const token = process.env.HEALTHCHECK_TOKEN;
  const supplied = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${token ?? ""}`;
  if (
    !token ||
    token.length < 32 ||
    Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
  ) {
    return Response.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const services = await connectionStatus();
  const ready = Object.values(services).every((status) => status === "ok");
  return Response.json(
    { status: ready ? "ready" : "not_ready", services },
    { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}

export const dynamic = "force-dynamic";
export function GET() {
  return Response.json(
    { status: "ok", service: "smbe", mode: "preview" },
    { headers: { "Cache-Control": "no-store" } },
  );
}

import { cookies } from "next/headers";
import { z } from "zod";
import { getCurrentSession } from "@/server/session";
import { isCurrentUserOperator } from "@/server/operator";
import { withTransaction } from "@/server/db";
import { LINK_COOKIE, resolveAccessToken } from "@/server/worker-access";
import { AttachmentError, presignRead } from "@/server/attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 첨부의 안정된 주소. 자료실 본문의 <img>·<video> 가 이 주소를 가리킨다.
 *
 * 서명 URL 은 5분이면 죽으므로 본문에 박아 둘 수 없다. 대신 이 라우트가 매번
 * 회사 소속을 확인하고 짧은 서명 URL 로 보낸다. 브라우저는 302 를 따라가
 * S3 에서 받는다 (동영상의 range 요청도 그대로 된다).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return new Response("Not found", { status: 404 });
  try {
    const actor = await currentActor();
    if (!actor) return new Response("Unauthorized", { status: 401 });
    const url = await presignRead(actor, id);
    return new Response(null, {
      status: 302,
      headers: {
        Location: url,
        // 서명 URL 수명(5분)보다 짧게 캐시해 같은 화면에서 재요청을 줄인다.
        "Cache-Control": "private, max-age=240",
      },
    });
  } catch (error) {
    if (error instanceof AttachmentError)
      return new Response("Not found", { status: 404 });
    throw error;
  }
}

async function currentActor() {
  const session = await getCurrentSession();
  if (session?.membership && session.membership.status === "ACTIVE")
    return {
      companyId: session.membership.company_id,
      userId: session.user.id,
      operator: await isCurrentUserOperator(),
    };
  const token = (await cookies()).get(LINK_COOKIE)?.value;
  const grant = token
    ? await withTransaction((c) => resolveAccessToken(c, token))
    : null;
  if (!grant) return null;
  return {
    companyId: grant.worker.companyId,
    userId: grant.worker.userId,
    linkWorkOrderId: grant.workOrderId,
  };
}

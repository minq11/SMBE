import { isCurrentUserOperator } from "@/server/operator";
import { workSession } from "@/server/work-orders";

/**
 * 자료실 화면의 세션. 작업지시와 같은 로그인·소속 확인에 운영자 여부를 얹는다 —
 * 오늘의 안전소식은 운영자만 쓰고, 그 판단은 서버(server/board.ts)가 이 값으로 한다.
 */
export async function boardSession(path: string) {
  const { session, actor } = await workSession(path);
  return {
    session,
    actor: { ...actor, operator: await isCurrentUserOperator() },
  };
}

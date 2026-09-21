import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { PoolClient } from "@neondatabase/serverless";
import { queryOne, query } from "./db";
import { workOrderOrigin } from "./work-order-delivery";
import type { Actor } from "./work-order-service";
import { WorkOrderError } from "../features/work-orders/model";

/**
 * 작업지시 링크 접근 토큰.
 *
 * 토큰은 work_order_outputs 행(작업지시 × 발급회차 × 작업자)에 1:1로 붙는 임의 문자열이다.
 * 토큰 안에는 아무 정보도 담지 않는다 — 이름·소속을 담으면 문자·로그·브라우저 히스토리에
 * 평문으로 남고, 발급 후 폐기할 수 없게 된다. 토큰은 포인터일 뿐이고 실제 정보는 DB에 있다.
 *
 * 이 토큰이 보장하는 것은 "이 번호로 보낸 링크가 열렸다"까지다. 본인 확인 수단이 아니다.
 * 설계 배경: docs/worker-access.md
 */

/** 128비트. base64url 22자 — SMS 90바이트 안에 안내 문구와 함께 들어가는 길이. */
const TOKEN_BYTES = 16;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export type WorkOrderLinkGrant = {
  readonly kind: "work-order-link";
  readonly outputId: string;
  readonly workOrderId: string;
  readonly issueVersion: number;
  /** 기존 서비스에 그대로 흘러들지 않도록 한 겹 감싼다. linkActor()로만 꺼낸다. */
  readonly worker: {
    readonly companyId: string;
    readonly userId: string;
    readonly name: string;
  };
  readonly expiresAt: string;
};

/**
 * 링크 권한을 기존 서비스의 Actor로 변환하는 유일한 통로.
 * 호출 지점이 grep 되도록 함수로 둔다. 변환 이후의 권한 검사는 기존 서비스가 그대로 한다
 * (memberAccess·회차 배정 확인 등) — 링크라고 해서 우회되는 경로를 만들지 않는다.
 */
export function linkActor(grant: WorkOrderLinkGrant): Actor {
  return { companyId: grant.worker.companyId, userId: grant.worker.userId };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function workerLinkUrl(token: string): string {
  return `${workOrderOrigin()}/w/${token}`;
}

/**
 * 토큰 발급. 원문은 이 반환값이 유일한 사본이며 DB에는 해시만 남는다.
 * 같은 행에 다시 발급하면 이전 토큰은 즉시 무효가 된다.
 */
export async function issueAccessToken(
  client: PoolClient,
  outputId: string,
  expiresAt: Date,
): Promise<string> {
  if (!(expiresAt.getTime() > Date.now()))
    throw new WorkOrderError("만료 시각은 현재보다 뒤여야 합니다.");

  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const { rowCount } = await client.query(
    `UPDATE work_order_outputs
     SET access_token_hash=$2, token_issued_at=now(), token_expires_at=$3,
         token_revoked_at=NULL
     WHERE id=$1`,
    [outputId, hashToken(token), expiresAt.toISOString()],
  );
  if (!rowCount) throw new WorkOrderError("전달 기록을 찾을 수 없습니다.");
  return token;
}

export async function revokeAccessToken(
  client: PoolClient,
  outputId: string,
): Promise<void> {
  await client.query(
    "UPDATE work_order_outputs SET token_revoked_at=now() WHERE id=$1 AND token_revoked_at IS NULL",
    [outputId],
  );
}

type GrantRow = {
  output_id: string;
  work_order_id: string;
  issue_version: number;
  company_id: string;
  user_id: string;
  display_name: string;
  expires_at: string;
};

/**
 * 토큰 검증. 하나라도 어긋나면 null 이며, 어디서 걸렸는지는 밖으로 알리지 않는다.
 *
 * 통과 조건:
 *  - 폐기되지 않았고 만료 전
 *  - 작업지시가 발급·진행 중이며 취소되지 않음
 *  - 토큰의 발급회차가 작업지시의 현재 회차와 일치 (재발급하면 옛 링크가 죽는다)
 *  - 작업자가 아직 그 회사의 활성 구성원
 */
export async function resolveAccessToken(
  token: string,
): Promise<WorkOrderLinkGrant | null> {
  if (!TOKEN_PATTERN.test(token)) return null;

  const row = await queryOne<GrantRow>(
    `SELECT o.id AS output_id, o.work_order_id, o.issue_version,
            w.company_id, u.id AS user_id, u.display_name,
            o.token_expires_at::text AS expires_at
     FROM work_order_outputs o
     JOIN work_orders w ON w.id = o.work_order_id
     JOIN users u ON u.id = o.user_id
     JOIN company_members m
       ON m.user_id = o.user_id AND m.company_id = w.company_id
      AND m.status = 'ACTIVE' AND m.left_at IS NULL
     WHERE o.access_token_hash = $1
       AND o.token_revoked_at IS NULL
       AND o.token_expires_at > now()
       AND o.issue_version = w.issue_version
       AND w.status IN ('ISSUED','IN_PROGRESS')
       AND w.canceled_at IS NULL`,
    [hashToken(token)],
  );
  if (!row) return null;

  return {
    kind: "work-order-link",
    outputId: row.output_id,
    workOrderId: row.work_order_id,
    issueVersion: row.issue_version,
    worker: {
      companyId: row.company_id,
      userId: row.user_id,
      name: row.display_name,
    },
    expiresAt: row.expires_at,
  };
}

/**
 * 열람 기록. 증빙용이므로 실패해도 화면을 막지 않는다.
 * IP·User-Agent는 개인정보이므로 최신 1건만 덮어쓴다 (보존 정책: docs/worker-access.md).
 */
export async function recordLinkOpen(
  grant: WorkOrderLinkGrant,
  meta: { ip?: string | null; userAgent?: string | null },
): Promise<void> {
  await query(
    `UPDATE work_order_outputs
     SET open_count = open_count + 1,
         first_opened_at = COALESCE(first_opened_at, now()),
         last_opened_at = now(),
         last_open_ip = $2,
         last_open_agent = LEFT($3, 300)
     WHERE id = $1`,
    [grant.outputId, meta.ip ?? null, meta.userAgent ?? null],
  );
}

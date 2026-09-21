import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { PoolClient } from "@neondatabase/serverless";

import { appOrigin } from "./config";
import type { Actor } from "./work-order-service";
import { WorkOrderError } from "../features/work-orders/model";

/**
 * 작업지시 링크 접근 토큰.
 *
 * 토큰은 work_order_access_grants 행(작업지시 × 발급회차 × 작업자)에 1:1로 붙는 임의 문자열이다.
 * 발송 기록(work_order_outputs)과 분리돼 있다 — 채널이 여럿이어도 링크는 하나여야 한다.
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
  readonly grantId: string;
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
  return `${appOrigin()}/w/${token}`;
}

/** 링크 진입 시 토큰을 담는 쿠키. URL 에서 토큰을 지우기 위한 교환 수단이다. */
export const LINK_COOKIE = "smbe_work_link";

/**
 * 토큰 유효기간: 작업 종료일 자정(KST) + 12시간.
 * 작업이 끝난 뒤 뒤늦게 확인하는 경우를 감안하되 무기한으로 두지 않는다.
 */
export function linkExpiry(endDate: string): Date {
  return new Date(Date.parse(endDate + "T23:59:59+09:00") + 12 * 3600_000);
}

/**
 * 토큰 발급. 원문은 이 반환값이 유일한 사본이며 DB에는 해시만 남는다.
 * 같은 행에 다시 발급하면 이전 토큰은 즉시 무효가 된다.
 */
export async function issueAccessToken(
  client: PoolClient,
  target: { workOrderId: string; issueVersion: number; userId: string },
  expiresAt: Date,
): Promise<string> {
  if (!(expiresAt.getTime() > Date.now()))
    throw new WorkOrderError("만료 시각은 현재보다 뒤여야 합니다.");

  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  // 재발급은 같은 행을 덮어쓴다. 이전 토큰은 해시가 바뀌는 순간 죽는다.
  // 열람 기록은 발급 이력이 아니라 이 회차의 사실이므로 함께 초기화한다.
  await client.query(
    `INSERT INTO work_order_access_grants
       (work_order_id, issue_version, user_id, access_token_hash, token_expires_at)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (work_order_id, issue_version, user_id) DO UPDATE
       SET access_token_hash=EXCLUDED.access_token_hash,
           token_issued_at=now(),
           token_expires_at=EXCLUDED.token_expires_at,
           token_revoked_at=NULL,
           first_opened_at=NULL,
           last_opened_at=NULL,
           open_count=0,
           last_open_ip=NULL,
           last_open_agent=NULL`,
    [
      target.workOrderId,
      target.issueVersion,
      target.userId,
      hashToken(token),
      expiresAt.toISOString(),
    ],
  );
  return token;
}

export async function revokeAccessToken(
  client: PoolClient,
  target: { workOrderId: string; issueVersion: number; userId: string },
): Promise<void> {
  await client.query(
    `UPDATE work_order_access_grants SET token_revoked_at=now()
      WHERE work_order_id=$1 AND issue_version=$2 AND user_id=$3
        AND token_revoked_at IS NULL`,
    [target.workOrderId, target.issueVersion, target.userId],
  );
}

type GrantRow = {
  grant_id: string;
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
  client: PoolClient,
  token: string,
): Promise<WorkOrderLinkGrant | null> {
  if (!TOKEN_PATTERN.test(token)) return null;

  const { rows } = await client.query<GrantRow>(
    `SELECT g.id AS grant_id, g.work_order_id, g.issue_version,
            w.company_id, u.id AS user_id, u.display_name,
            g.token_expires_at::text AS expires_at
     FROM work_order_access_grants g
     JOIN work_orders w ON w.id = g.work_order_id
     JOIN users u ON u.id = g.user_id
     JOIN company_members m
       ON m.user_id = g.user_id AND m.company_id = w.company_id
      AND m.status = 'ACTIVE' AND m.left_at IS NULL
     WHERE g.access_token_hash = $1
       AND g.token_revoked_at IS NULL
       AND g.token_expires_at > now()
       AND g.issue_version = w.issue_version
       AND w.status IN ('ISSUED','IN_PROGRESS')
       AND w.canceled_at IS NULL`,
    [hashToken(token)],
  );
  const row = rows[0];
  if (!row) return null;

  return {
    kind: "work-order-link",
    grantId: row.grant_id,
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
  client: PoolClient,
  grant: WorkOrderLinkGrant,
  meta: { ip?: string | null; userAgent?: string | null },
): Promise<void> {
  await client.query(
    `UPDATE work_order_access_grants
     SET open_count = open_count + 1,
         first_opened_at = COALESCE(first_opened_at, now()),
         last_opened_at = now(),
         last_open_ip = $2,
         last_open_agent = LEFT($3, 300)
     WHERE id = $1`,
    [grant.grantId, meta.ip ?? null, meta.userAgent ?? null],
  );
}

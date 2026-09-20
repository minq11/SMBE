"use client";

import { useState, useTransition } from "react";
import { Check, ShieldCheck, UserMinus, UserPlus, X } from "lucide-react";
import type { MembershipRole } from "@/server/session";
import type { CompanyOverview, MemberRow, OpenInviteRow } from "@/server/members";
import {
  approvePendingAction,
  changeRoleAction,
  rejectPendingAction,
  resignMemberAction,
} from "./actions";
import { InvitePanel } from "./invite-panel";

type Tab = "active" | "pending" | "resigned";

const ROLE_LABEL: Record<MembershipRole, string> = {
  MANAGER_SUPERVISOR: "관리감독자",
  MANAGER_SAFETY: "안전관리자",
  WORKER: "작업자",
};

const JOIN_VIA_LABEL: Record<MemberRow["joined_via"], string> = {
  COMPANY_CREATE: "회사 생성자",
  INVITE_LINK: "초대 링크",
  DIRECT_JOIN: "회사코드 가입",
};

export function MembersView({
  overview,
  members,
  openInvites,
  origin,
  managerRole,
  currentUserId,
}: {
  overview: CompanyOverview;
  members: MemberRow[];
  openInvites: OpenInviteRow[];
  origin: string;
  managerRole: MembershipRole;
  currentUserId: string;
}) {
  const [tab, setTab] = useState<Tab>(
    overview.pending_count > 0 ? "pending" : "active",
  );

  const grouped = {
    active: members.filter((m) => m.status === "ACTIVE" && !m.left_at),
    pending: members.filter((m) => m.status === "JOIN_PENDING" && !m.left_at),
    resigned: members.filter((m) => m.status === "RESIGNED" || m.left_at),
  };

  const rows = grouped[tab];

  return (
    <>
      <MetaStrip overview={overview} />

      <InvitePanel
        origin={origin}
        openInvites={openInvites}
        managerRole={managerRole}
      />

      <div className="stack">
        <div className="tabs" role="tablist" aria-label="인원 상태">
          <TabButton
            label="재직"
            count={grouped.active.length}
            active={tab === "active"}
            onClick={() => setTab("active")}
          />
          <TabButton
            label="가입 승인 대기"
            count={grouped.pending.length}
            active={tab === "pending"}
            onClick={() => setTab("pending")}
            highlight={grouped.pending.length > 0}
          />
          <TabButton
            label="퇴사자"
            count={grouped.resigned.length}
            active={tab === "resigned"}
            onClick={() => setTab("resigned")}
          />
        </div>

        {rows.length === 0 ? (
          <div className="panel">
            <EmptyForTab tab={tab} />
          </div>
        ) : (
          <ul className="row-list" role="list">
            {rows.map((row) => (
              <li key={row.member_id}>
                <MemberRowView
                  row={row}
                  tab={tab}
                  managerRole={managerRole}
                  currentUserId={currentUserId}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function MetaStrip({ overview }: { overview: CompanyOverview }) {
  const tierLabel = overview.pro_state === "FREE" ? "무료티어" : "Pro티어";
  return (
    <dl className="meta-strip">
      <div>
        <dt>현재 인원</dt>
        <dd>{overview.active_count}</dd>
      </div>
      <div>
        <dt>요금제</dt>
        <dd>{tierLabel}</dd>
      </div>
      <div>
        <dt>회사코드</dt>
        <dd className="mono">{overview.company_code}</dd>
      </div>
    </dl>
  );
}

function TabButton({
  label,
  count,
  active,
  onClick,
  highlight,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  highlight?: boolean;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`tab${active ? " is-active" : ""}${
        highlight && !active ? " has-highlight" : ""
      }`}
      onClick={onClick}
    >
      {label}
      <span className="tab-count">{count}</span>
    </button>
  );
}

function EmptyForTab({ tab }: { tab: Tab }) {
  const text: Record<Tab, string> = {
    active: "재직 중인 구성원이 없어요. 초대 링크로 관리자·작업자를 연결해 보세요.",
    pending:
      "가입 승인 대기 중인 요청이 없어요. 회사코드로 가입한 사람이 있으면 여기 표시됩니다.",
    resigned: "퇴사한 구성원이 없어요.",
  };
  return (
    <div className="empty-state">
      <strong>목록이 비어 있어요</strong>
      <p>{text[tab]}</p>
    </div>
  );
}

function MemberRowView({
  row,
  tab,
  managerRole,
  currentUserId,
}: {
  row: MemberRow;
  tab: Tab;
  managerRole: MembershipRole;
  currentUserId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isSelf = row.user_id === currentUserId;
  const runAction = (fn: () => Promise<{ error?: string } | undefined>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result?.error) setError(result.error);
    });
  };

  return (
    <div className={`row row--static${error ? " has-error" : ""}`}>
      <span className="row-main">
        <strong>
          {row.display_name || row.snapshot_display_name}
          {isSelf && <span className="row-tag">나</span>}
        </strong>
        <small>
          <RoleBadge role={row.role} /> · {JOIN_VIA_LABEL[row.joined_via]} ·
          가입 {new Date(row.joined_at).toLocaleDateString("ko-KR")}
          {row.left_at && (
            <> · 퇴사 {new Date(row.left_at).toLocaleDateString("ko-KR")}</>
          )}
        </small>
      </span>
      <span className="row-meta">
        <span className="row-contact">
          {row.email ?? row.phone ?? "연락처 미등록"}
        </span>
      </span>
      <span className="row-actions">
        {tab === "pending" && (
          <>
            <button
              type="button"
              className="ghost-button ghost-button--primary"
              disabled={pending}
              onClick={() =>
                runAction(() => approvePendingAction(row.member_id))
              }
            >
              <Check size={13} /> 승인
            </button>
            <button
              type="button"
              className="ghost-button ghost-button--danger"
              disabled={pending}
              onClick={() =>
                runAction(() => rejectPendingAction(row.member_id))
              }
            >
              <X size={13} /> 거부
            </button>
          </>
        )}
        {tab === "active" && (
          <>
            <RoleChanger
              memberId={row.member_id}
              currentRole={row.role}
              isSelf={isSelf}
              managerRole={managerRole}
            />
            <button
              type="button"
              className="ghost-button ghost-button--danger"
              disabled={pending}
              onClick={() => {
                if (
                  !confirm(
                    `${row.display_name} 님을 퇴사 처리할까요? 배정된 작업이 있으면 자동 해제되고 과거 기록은 보존됩니다.`,
                  )
                )
                  return;
                runAction(() => resignMemberAction(row.member_id));
              }}
            >
              <UserMinus size={13} /> 퇴사
            </button>
          </>
        )}
      </span>
      {error && <span className="row-error">{error}</span>}
    </div>
  );
}

function RoleBadge({ role }: { role: MembershipRole }) {
  const cls =
    role === "MANAGER_SUPERVISOR"
      ? "role-badge role-badge--supervisor"
      : role === "MANAGER_SAFETY"
        ? "role-badge role-badge--safety"
        : "role-badge role-badge--worker";
  return (
    <span className={cls}>
      {role !== "WORKER" && <ShieldCheck size={11} />}
      {ROLE_LABEL[role]}
    </span>
  );
}

function RoleChanger({
  memberId,
  currentRole,
  isSelf,
  managerRole,
}: {
  memberId: string;
  currentRole: MembershipRole;
  isSelf: boolean;
  managerRole: MembershipRole;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // 어떤 역할로 바꿀 수 있는지 계산
  const options: MembershipRole[] = [];
  if (currentRole !== "WORKER") options.push("WORKER");
  if (currentRole !== "MANAGER_SAFETY") options.push("MANAGER_SAFETY");
  if (managerRole === "MANAGER_SUPERVISOR" && !isSelf) {
    if (currentRole !== "MANAGER_SUPERVISOR") options.push("MANAGER_SUPERVISOR");
  }
  // 관리감독자 → 다른 역할은 본인만
  if (currentRole === "MANAGER_SUPERVISOR" && !isSelf) {
    return null;
  }
  if (options.length === 0) return null;

  const submit = (role: MembershipRole) => {
    startTransition(async () => {
      const fd = new FormData();
      fd.append("member_id", memberId);
      fd.append("role", role);
      await changeRoleAction(undefined, fd);
      setOpen(false);
    });
  };

  return (
    <div className="role-changer">
      <button
        type="button"
        className="ghost-button"
        disabled={pending}
        onClick={() => setOpen((v) => !v)}
      >
        <UserPlus size={13} /> 역할 변경
      </button>
      {open && (
        <div className="role-changer-menu" role="menu">
          {options.map((role) => (
            <button
              type="button"
              key={role}
              className="role-changer-item"
              disabled={pending}
              onClick={() => submit(role)}
            >
              {ROLE_LABEL[role]}으로 변경
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

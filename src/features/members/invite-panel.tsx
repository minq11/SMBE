"use client";

import { useActionState, useEffect, useState } from "react";
import { Check, Copy, Link2, X } from "lucide-react";
import type { MembershipRole } from "@/server/session";
import type { OpenInviteRow } from "@/server/members";
import { createInviteAction, revokeInviteAction, type ActionState } from "./actions";

const ROLE_LABEL: Record<MembershipRole, string> = {
  MANAGER_SUPERVISOR: "관리감독자",
  MANAGER_SAFETY: "안전관리자",
  WORKER: "작업자",
};

export function InvitePanel({
  origin,
  openInvites,
  managerRole,
}: {
  origin: string;
  openInvites: OpenInviteRow[];
  managerRole: MembershipRole;
}) {
  const [open, setOpen] = useState(openInvites.length === 0);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createInviteAction,
    undefined,
  );
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  const createdToken = state?.inviteToken ?? null;
  const createdUrl = createdToken ? `${origin}/invite/${createdToken}` : null;
  const emailStatus = state?.inviteEmail;
  const emailErr = state?.inviteEmailError;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
    } catch {
      // 클립보드 접근 실패 시 조용히 무시
    }
  };

  return (
    <section className="invite-panel">
      <header className="invite-panel-head">
        <div>
          <strong>구성원 초대</strong>
          <p>
            이메일로 자동 발송되며, 링크를 연 사람은 로그인 후 승인 없이 바로
            소속됩니다. 유효기간 14일.
          </p>
        </div>
        <button
          type="button"
          className="ghost-button"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "접기" : "초대하기"}
        </button>
      </header>

      {open && (
        <form action={formAction} className="invite-form">
          <div className="invite-form-row">
            <label className="form-field invite-field">
              <span>대상 역할</span>
              <select name="target_role" defaultValue="WORKER" required>
                <option value="WORKER">작업자</option>
                <option value="MANAGER_SAFETY">안전관리자</option>
                {managerRole === "MANAGER_SUPERVISOR" && (
                  <option value="MANAGER_SUPERVISOR">관리감독자</option>
                )}
              </select>
            </label>
            <label className="form-field invite-field">
              <span>이메일 (선택)</span>
              <input
                type="email"
                name="contact_email"
                placeholder="worker@example.com"
                autoComplete="off"
              />
            </label>
            <label className="form-field invite-field">
              <span>전화번호 (선택)</span>
              <input
                type="tel"
                name="contact_phone"
                placeholder="010-0000-0000"
                autoComplete="off"
              />
            </label>
          </div>
          <p className="invite-form-hint">
            이메일을 입력하면 초대 메일이 자동으로 발송됩니다. 전화번호만 입력한
            경우 문자 발송은 준비 중이라 링크를 직접 전달해 주세요.
          </p>
          {state?.error && <div className="form-error">{state.error}</div>}
          <div className="invite-form-actions">
            <button type="submit" className="primary-button" disabled={pending}>
              {pending ? "발송 중..." : "초대하기"}
            </button>
          </div>
        </form>
      )}

      {createdUrl && (
        <div className="invite-result">
          <div className="invite-result-copy">
            <span className="invite-result-label">
              초대 링크
              {emailStatus === "sent" && (
                <span className="invite-result-status invite-result-status--ok">
                  · 이메일 발송 완료
                </span>
              )}
              {emailStatus === "failed" && (
                <span
                  className="invite-result-status invite-result-status--warn"
                  title={emailErr ?? undefined}
                >
                  · 이메일 발송 실패, 링크를 직접 전달하세요
                </span>
              )}
              {emailStatus === "skipped" && (
                <span
                  className="invite-result-status invite-result-status--warn"
                  title={emailErr ?? undefined}
                >
                  · 발송 미설정, 링크를 직접 전달하세요
                </span>
              )}
              {emailStatus === "none" && (
                <span className="invite-result-status invite-result-status--warn">
                  · 문자 발송 준비 중, 링크를 직접 전달하세요
                </span>
              )}
            </span>
            <code>{createdUrl}</code>
          </div>
          <button
            type="button"
            className="ghost-button"
            onClick={() => copy(createdUrl)}
          >
            {copied === createdUrl ? (
              <>
                <Check size={14} /> 복사됨
              </>
            ) : (
              <>
                <Copy size={14} /> 복사
              </>
            )}
          </button>
        </div>
      )}

      {openInvites.length > 0 && (
        <div className="invite-list">
          <p className="invite-list-caption">
            아직 수락되지 않은 초대 · {openInvites.length}건
          </p>
          <ul className="row-list" role="list">
            {openInvites.map((invite) => {
              const url = `${origin}/invite/${invite.token}`;
              const contact =
                invite.contact_email ?? invite.contact_phone ?? "연락처 미지정";
              return (
                <li key={invite.invite_id}>
                  <div className="row row--static">
                    <span className="row-main">
                      <strong>
                        <Link2 size={13} style={{ marginRight: 6 }} />
                        {contact}
                      </strong>
                      <small>
                        {ROLE_LABEL[invite.target_role as MembershipRole]} ·
                        발송 {new Date(invite.sent_at).toLocaleDateString("ko-KR")}
                        {invite.expires_at && (
                          <>
                            {" "}
                            · 만료{" "}
                            {new Date(invite.expires_at).toLocaleDateString(
                              "ko-KR",
                            )}
                          </>
                        )}
                      </small>
                    </span>
                    <span className="row-actions">
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => copy(url)}
                      >
                        {copied === url ? (
                          <>
                            <Check size={13} /> 복사됨
                          </>
                        ) : (
                          <>
                            <Copy size={13} /> 링크 복사
                          </>
                        )}
                      </button>
                      <form
                        action={async () => {
                          await revokeInviteAction(invite.invite_id);
                        }}
                      >
                        <button
                          type="submit"
                          className="ghost-button ghost-button--danger"
                        >
                          <X size={13} /> 폐기
                        </button>
                      </form>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

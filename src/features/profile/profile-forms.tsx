"use client";
import { useActionState } from "react";
import { saveProfileAction, leaveCompanyAction } from "./actions";
export function ProfileForm({
  name,
  phone,
  version,
}: {
  name: string;
  phone: string | null;
  version: string;
}) {
  const [state, action, pending] = useActionState(saveProfileAction, undefined);
  return (
    <form action={action} className="account-form">
      <input type="hidden" name="version" value={state?.version ?? version} />
      <label>
        이름
        <input
          name="displayName"
          autoComplete="name"
          defaultValue={name}
          required
          maxLength={60}
        />
      </label>
      <label>
        전화번호 <span className="account-muted">(선택)</span>
        <input
          type="tel"
          name="phone"
          autoComplete="tel"
          defaultValue={phone ?? ""}
          maxLength={30}
          placeholder="010-1234-5678"
        />
      </label>
      <p className="account-muted">
        이름 변경은 앞으로 표시되는 정보에 적용됩니다. 기존 지시서·점검 기록의
        이름은 유지됩니다.
      </p>
      {state?.error && (
        <p role="alert" className="account-error">
          {state.error}
        </p>
      )}
      {state?.message && <p role="status">{state.message}</p>}
      <button className="primary-button" disabled={pending}>
        {pending ? "저장 중…" : "내 정보 저장"}
      </button>
    </form>
  );
}
export function LeaveCompanyForm({
  memberId,
  pendingApproval,
  blocked,
}: {
  memberId: string;
  pendingApproval: boolean;
  blocked: boolean;
}) {
  const [state, action, pending] = useActionState(
    leaveCompanyAction,
    undefined,
  );
  return (
    <form action={action} className="account-form">
      <input type="hidden" name="memberId" value={memberId} />
      <label className="account-confirm">
        <input type="checkbox" name="confirm" required disabled={blocked} />
        <span>
          {pendingApproval
            ? "가입 신청을 취소하고 소속 대기를 해제합니다."
            : "회사 소속이 해제되고 진행 중인 작업 배정이 해제됨을 확인했습니다. 이전 업무 기록은 회사에 남습니다."}
        </span>
      </label>
      {state?.error && (
        <p role="alert" className="account-error">
          {state.error}
        </p>
      )}
      <button className="secondary-button" disabled={pending || blocked}>
        {pending
          ? "처리 중…"
          : pendingApproval
            ? "가입 신청 취소"
            : "본인 퇴사 처리"}
      </button>
    </form>
  );
}

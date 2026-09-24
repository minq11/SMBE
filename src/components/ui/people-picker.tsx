"use client";
import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Search, UserPlus, X } from "lucide-react";
import { PickerDialog } from "./picker-dialog";

export type Person = { user_id: string; display_name: string };

/**
 * 사람 고르기 — 참여자·배정 인원.
 *
 * 18px 체크박스를 손가락으로 맞히는 대신, 이름 전체가 44px 높이의 칩이다.
 * 속은 여전히 체크박스라 스크린리더·키보드·테스트에는 체크박스로 보인다.
 * 구성원이 많으면 이름 검색을 위에 둔다.
 */
export function PeoplePicker({
  legend,
  members,
  selected,
  onToggle,
  searchFrom = 8,
}: {
  legend: string;
  members: Person[];
  selected: string[];
  onToggle: (id: string) => void;
  /** 이 인원 이상이면 검색칸을 보인다 */
  searchFrom?: number;
}) {
  const [q, setQ] = useState("");
  const inputId = useId();
  const needle = q.trim().toLowerCase();
  const visible = needle
    ? members.filter((m) => m.display_name.toLowerCase().includes(needle))
    : members;
  return (
    <fieldset className="people-picker">
      <legend>{legend}</legend>
      {members.length >= searchFrom && (
        <label className="people-picker-search" htmlFor={inputId}>
          <Search size={14} aria-hidden="true" />
          <input
            id={inputId}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="이름 검색"
            aria-label={legend + " 이름 검색"}
            enterKeyHint="search"
            autoComplete="off"
          />
        </label>
      )}
      {members.length === 0 && (
        <p className="wo-muted">구성원이 없습니다. 인원관리에서 초대하세요.</p>
      )}
      <div className="people-picker-chips">
        {visible.map((m) => {
          const on = selected.includes(m.user_id);
          return (
            <label
              key={m.user_id}
              className={`people-chip${on ? " is-on" : ""}`}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => onToggle(m.user_id)}
              />
              <span className="people-chip-mark" aria-hidden="true">
                {on && <Check size={14} />}
              </span>
              {m.display_name}
            </label>
          );
        })}
        {members.length > 0 && visible.length === 0 && (
          <p className="wo-muted">&lsquo;{q}&rsquo; 에 맞는 이름이 없습니다.</p>
        )}
      </div>
    </fieldset>
  );
}

/**
 * 인원이 많아질 때의 사람 고르기 — 고른 사람만 화면에 칩으로 남고, 목록은 팝업에서.
 * 칩의 × 로 뺀다. 팝업 속 목록은 위와 같은 체크 칩이라 테스트·스크린리더에는
 * 체크박스로 보인다. 표준서 신규 작성·위험성평가 다시하기가 쓴다 (사장님 결정).
 */
export function PeoplePickerDialog({
  legend,
  members,
  selected,
  onToggle,
  buttonLabel = "인원 선택",
  inviteHref,
}: {
  legend: string;
  members: Person[];
  selected: string[];
  onToggle: (id: string) => void;
  buttonLabel?: string;
  /** 있으면 창 안에 "구성원 초대" (새 탭) — 쓰던 폼을 두고 초대하러 간다 */
  inviteHref?: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  // 초대하러 새 탭에 다녀오면 목록을 서버에서 다시 받는다. 그 사이 합류한 사람이
  // 보이게 — 전에는 "임시저장하고 다시 여세요" 라고 적어 두었다. 폼 상태는 남는다.
  const [invited, setInvited] = useState(false);
  useEffect(() => {
    if (!invited) return;
    const back = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", back);
    return () => document.removeEventListener("visibilitychange", back);
  }, [invited, router]);
  const invite = inviteHref ? (
    <Link
      href={inviteHref}
      target="_blank"
      rel="noopener"
      className="text-button"
      onClick={() => setInvited(true)}
    >
      <UserPlus size={14} /> 구성원 초대
    </Link>
  ) : null;
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const visible = needle
    ? members.filter((m) => m.display_name.toLowerCase().includes(needle))
    : members;
  const chosen = members.filter((m) => selected.includes(m.user_id));
  return (
    <fieldset className="people-picker people-picker--dialog">
      <legend>{legend}</legend>
      {members.length === 0 ? (
        <p className="wo-muted">
          구성원이 없습니다. {invite ?? "인원관리에서 초대하세요."}
        </p>
      ) : (
        <div className="people-picker-summary">
          {chosen.map((m) => (
            <span
              key={m.user_id}
              className="people-chip is-on people-chip--picked"
            >
              <span className="people-chip-mark" aria-hidden="true">
                <Check size={14} />
              </span>
              {m.display_name}
              <button
                type="button"
                className="people-chip-remove"
                aria-label={`${m.display_name} 빼기`}
                onClick={() => onToggle(m.user_id)}
              >
                <X size={14} />
              </button>
            </span>
          ))}
          {chosen.length === 0 && (
            <p className="wo-muted">아직 고른 사람이 없습니다.</p>
          )}
          <button
            type="button"
            className="ghost-button people-picker-open"
            onClick={() => setOpen(true)}
          >
            <UserPlus size={14} /> {buttonLabel}
            {chosen.length > 0 ? ` (${chosen.length}명)` : ""}
          </button>
        </div>
      )}
      <PickerDialog
        open={open}
        onClose={() => setOpen(false)}
        title={legend}
        query={q}
        onQuery={setQ}
        searchLabel={legend + " 이름 검색"}
        extra={invite}
      >
        <div className="people-picker-chips">
          {visible.map((m) => {
            const on = selected.includes(m.user_id);
            return (
              <label
                key={m.user_id}
                className={`people-chip${on ? " is-on" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => onToggle(m.user_id)}
                />
                <span className="people-chip-mark" aria-hidden="true">
                  {on && <Check size={14} />}
                </span>
                {m.display_name}
              </label>
            );
          })}
          {members.length > 0 && visible.length === 0 && (
            <p className="wo-muted">
              &lsquo;{q}&rsquo; 에 맞는 이름이 없습니다.
            </p>
          )}
        </div>
      </PickerDialog>
    </fieldset>
  );
}

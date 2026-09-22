"use client";
import { useId, useState } from "react";
import { Check, Search } from "lucide-react";

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

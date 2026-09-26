"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, Plus, Trash2 } from "lucide-react";
import { FloatField } from "@/components/ui/float-field";
import {
  generateSessions,
  seoulToday,
  shiftMinutes,
  validDate,
  type WorkSessionDraft,
} from "./model";

const DAY_KO = ["일", "월", "화", "수", "목", "금", "토"];
function dayLabel(date: string) {
  if (!validDate(date)) return "";
  // 날짜 글자를 그대로 쓴다. 기기·서버 시간대로 환산하면 하루가 밀린다.
  const d = new Date(date + "T00:00:00Z");
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} (${DAY_KO[d.getUTCDay()]})`;
}
function nextDay(date: string) {
  if (!validDate(date)) return seoulToday();
  return new Date(Date.parse(date + "T00:00:00Z") + 86400_000)
    .toISOString()
    .slice(0, 10);
}
function hoursText(s: WorkSessionDraft) {
  const m = shiftMinutes(s.startTime, s.endTime);
  if (!m) return "시간을 확인하세요";
  return `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ""}${
    s.endTime <= s.startTime ? " · 다음 날 종료" : ""
  }${m > 960 ? " · 16시간 초과" : ""}`;
}

/**
 * 작업 회차 편집 (사장님 결정). [작업 회차 만들기] 팝업에 기간과 시간을 적어 확정하면
 * 날짜마다 회차가 화면에 나오고, 하나씩 고치고 지우고 더한다. 전에는 발급 순간에
 * 기간의 매일이 몰래 회차가 됐다 — 휴무일이 빈 회차로 남고, 사람이 회차를 본 적이
 * 없었다. 검증(중복 날짜·16시간·최소 1회차)은 model.ts sessionProblem 이 발급 때 한다.
 */
export function SessionEditor({
  value,
  onChange,
}: {
  value: WorkSessionDraft[];
  onChange: (sessions: WorkSessionDraft[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  const today = seoulToday();
  const last = value[value.length - 1];
  const [range, setRange] = useState({
    startDate: value[0]?.date ?? today,
    endDate: last?.date ?? today,
    startTime: value[0]?.startTime ?? "09:00",
    endTime: last?.endTime ?? "17:00",
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  const preview = generateSessions(
    range.startDate,
    range.endDate,
    range.startTime,
    range.endTime,
  );
  const rangeMinutes = shiftMinutes(range.startTime, range.endTime);
  const rangeProblem =
    preview.length === 0
      ? "시작일과 마감일을 확인하세요."
      : !rangeMinutes || rangeMinutes > 960
        ? "하루 작업시간은 0시간 초과, 16시간 이하여야 합니다."
        : null;
  const dates = new Set<string>();
  const dup = new Set<string>();
  for (const s of value) {
    if (dates.has(s.date)) dup.add(s.date);
    dates.add(s.date);
  }
  const update = (i: number, patch: Partial<WorkSessionDraft>) =>
    onChange(value.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  return (
    <div className="wo-sessions" role="group" aria-label="작업 회차">
      <div className="wo-sessions-head">
        <span className="wo-sessions-title">
          작업 회차 {value.length > 0 ? `(${value.length}회차)` : ""}
        </span>
        {value.length > 0 && (
          <button
            type="button"
            className="ghost-button"
            onClick={() => setOpen(true)}
          >
            <CalendarDays size={14} /> 작업 회차 만들기
          </button>
        )}
      </div>
      {value.length === 0 ? (
        /* 회차가 없으면 빈 자리가 "비었다" 고 말해야 한다. 회색 한 줄은 안내로만
           읽혀 단추를 누를 생각을 못 했다 (사장님). 노란 빈 칸 전체가 단추다. */
        <button
          type="button"
          className="wo-sessions-empty"
          aria-label="작업 회차 만들기"
          onClick={() => setOpen(true)}
        >
          <CalendarDays size={22} />
          <strong>작업 회차가 아직 없습니다</strong>
          <span>여기를 눌러 시작일·마감일과 시간을 적으세요</span>
        </button>
      ) : (
        <ol className="wo-session-list">
          {value.map((s, i) => (
            <li
              key={i}
              className={`wo-session-row${dup.has(s.date) ? " is-dup" : ""}`}
            >
              <span className="wo-session-no">{i + 1}</span>
              <FloatField
                id={`wo-session-date-${i}`}
                label={`회차 ${i + 1} 날짜`}
                type="date"
                value={s.date}
                onChange={(e) => update(i, { date: e.target.value })}
              />
              <FloatField
                id={`wo-session-start-${i}`}
                label={`회차 ${i + 1} 시작`}
                type="time"
                value={s.startTime}
                onChange={(e) => update(i, { startTime: e.target.value })}
              />
              <FloatField
                id={`wo-session-end-${i}`}
                label={`회차 ${i + 1} 종료`}
                type="time"
                value={s.endTime}
                onChange={(e) => update(i, { endTime: e.target.value })}
              />
              <button
                type="button"
                className="icon-button wo-session-remove"
                aria-label={`회차 ${i + 1} 삭제`}
                onClick={() => onChange(value.filter((_, j) => j !== i))}
              >
                <Trash2 size={15} />
              </button>
              <small className="wo-session-hint">
                {dayLabel(s.date)} · {hoursText(s)}
                {dup.has(s.date) ? " · 같은 날짜가 두 번" : ""}
              </small>
            </li>
          ))}
        </ol>
      )}
      {value.length > 0 && (
        <button
          type="button"
          className="text-button"
          onClick={() =>
            onChange([
              ...value,
              {
                date: nextDay(last.date),
                startTime: last.startTime,
                endTime: last.endTime,
              },
            ])
          }
        >
          <Plus size={13} /> 회차 추가
        </button>
      )}

      <dialog
        ref={ref}
        className="confirm-dialog wo-session-dialog"
        aria-label="작업 회차 만들기"
        onClose={() => setOpen(false)}
        onCancel={(e) => {
          e.preventDefault();
          setOpen(false);
        }}
      >
        {open && (
          <div className="confirm-dialog-body">
            <h2>작업 회차 만들기</h2>
            <p className="wo-muted">
              한국시간 기준입니다. 종료시간이 시작시간보다 이르면 다음 날 끝나는
              야간작업으로 봅니다. 날짜마다 회차 하나가 생깁니다.
            </p>
            <div className="wo-columns">
              <FloatField
                id="wo-range-start"
                label="시작일"
                type="date"
                value={range.startDate}
                onChange={(e) =>
                  setRange((r) => ({ ...r, startDate: e.target.value }))
                }
              />
              <FloatField
                id="wo-range-end"
                label="마감일"
                type="date"
                value={range.endDate}
                onChange={(e) =>
                  setRange((r) => ({ ...r, endDate: e.target.value }))
                }
              />
              <FloatField
                id="wo-range-start-time"
                label="시작시간"
                type="time"
                value={range.startTime}
                onChange={(e) =>
                  setRange((r) => ({ ...r, startTime: e.target.value }))
                }
              />
              <FloatField
                id="wo-range-end-time"
                label="마감시간"
                type="time"
                value={range.endTime}
                onChange={(e) =>
                  setRange((r) => ({ ...r, endTime: e.target.value }))
                }
              />
            </div>
            <p className="wo-session-preview" role="status">
              {rangeProblem
                ? rangeProblem
                : `${preview.length}회차 · 하루 ${Math.floor(rangeMinutes / 60)}시간${
                    rangeMinutes % 60 ? ` ${rangeMinutes % 60}분` : ""
                  }${range.endTime <= range.startTime ? " · 다음 날 종료" : ""}${
                    value.length > 0
                      ? " · 지금 회차 목록을 새로 만든 목록으로 바꿉니다"
                      : ""
                  }`}
            </p>
            <div className="confirm-dialog-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setOpen(false)}
              >
                취소
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={Boolean(rangeProblem)}
                onClick={() => {
                  onChange(preview);
                  setOpen(false);
                }}
              >
                회차 만들기
              </button>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}

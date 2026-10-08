"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ChevronDown, CircleCheckBig, LockOpen, Square, SquareCheckBig, ArrowRight, RotateCcw, MessageSquare } from "lucide-react";
import { FloatTextarea } from "@/components/ui/float-field";
import { useToast } from "@/components/ui/toast";
import { FormErrorDialog } from "@/components/ui/form-error-dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { koDate } from "@/features/assessments/model";
import {
  actionDoneAction,
  closeIncidentAction,
  dutyDoneAction,
  reopenIncidentAction,
} from "./actions";
import { DUTY_LABEL, shortDay, type Duty, type IncidentAction } from "./model";

const doneClock = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

/**
 * 할 일 목록 — 사고 상세의 맨 위. 한 줄이 법이 요구하는 일 하나이고, 끝내면
 * 초록 체크, 기한이 지났으면 빨간 날짜. 끝낼 때 증빙 메모(누구에게 보고했는지,
 * 언제 제출했는지)를 적는다. "재발방지대책 이행" 은 아래 대책이 다 끝나면 저절로.
 */
export function DutyList({
  incidentId,
  duties,
  today,
  locked,
  paid,
  riskAssessmentHref,
}: {
  incidentId: string;
  duties: Duty[];
  today: string;
  locked: boolean;
  /** 멤버십 — 근로자 공유의 문자 공지. */
  paid: boolean;
  /** 수시 위험성평가로 가는 길 (표준서가 있을 때). */
  riskAssessmentHref: string | null;
}) {
  return (
    <ol className="inc-duties" role="list">
      {duties.map((d) => (
        <DutyRow
          key={d.id}
          incidentId={incidentId}
          duty={d}
          today={today}
          locked={locked}
          paid={paid}
          extraHref={d.kind === "RISK_ASSESSMENT" ? riskAssessmentHref : null}
        />
      ))}
    </ol>
  );
}

function DutyRow({
  incidentId,
  duty,
  today,
  locked,
  paid,
  extraHref,
}: {
  incidentId: string;
  duty: Duty;
  today: string;
  locked: boolean;
  paid: boolean;
  extraHref: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(duty.note);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const done = Boolean(duty.done_at);
  const overdue = !done && Boolean(duty.due_on) && duty.due_on! < today;
  // 저절로 끝나는 할 일: 재발방지대책 이행(대책이 다 끝나면), 수시 위험성평가(표준서가
  // 있으면 새 회차 평가를 등록해야 끝난다 — "끝냈습니다" 로 넘길 수 없다. 사장님
  // 2026-10-06). 표준서가 없는 사고만 손으로 끝낸다.
  const auto =
    duty.kind === "PREVENTION" ||
    (duty.kind === "RISK_ASSESSMENT" && Boolean(extraHref));
  const { show: toast, toast: toastEl } = useToast();
  const sms = () =>
    toast(
      paid ? (
        "문자 공지는 준비 중입니다. 지금은 공지사항·TBM 으로 알리세요."
      ) : (
        <>
          문자 공지는 멤버십에 가입된 회사만 쓸 수 있습니다.{" "}
          <Link href="/billing">요금제 보기</Link>
        </>
      ),
    );
  const label = DUTY_LABEL[duty.kind];

  const submit = (next: boolean) =>
    start(async () => {
      setError(null);
      const r = await dutyDoneAction({
        incidentId,
        dutyId: duty.id,
        done: next,
        note,
      });
      if (!r.ok) setError(r.error);
      else {
        setOpen(false);
        router.refresh();
      }
    });

  return (
    <li
      className={`inc-duty${done ? " is-done" : ""}${overdue ? " is-overdue" : ""}`}
    >
      <div className="inc-duty-row">
        <span className="inc-duty-mark" aria-hidden="true">
          {done ? <SquareCheckBig size={20} /> : <Square size={20} />}
        </span>
        <span className="inc-duty-main">
          <strong>{label.title}</strong>
          <small>
            {label.basis}
            {duty.due_on && !done ? (
              <>
                {" · "}
                <span className="inc-duty-due">
                  {overdue ? "기한 지남 " : "기한 "}
                  {shortDay(duty.due_on)}
                </span>
              </>
            ) : null}
            {done && (
              <>
                {" · "}
                <span className="inc-duty-done">
                  <Check size={12} /> {doneClock(duty.done_at!)}
                  {duty.done_by_name ? ` ${duty.done_by_name}` : ""}
                </span>
              </>
            )}
          </small>
          {duty.note && !open && <p className="inc-duty-note">{duty.note}</p>}
        </span>
        {!locked && (
          <span className="inc-duty-actions">
            {extraHref && !done && (
              <Link href={extraHref} className="go-link">
                  평가하러 가기 <ArrowRight size={14} />
                </Link>
            )}
            {!auto && (
              <button
                type="button"
                className={done ? "btn-secondary" : "btn-primary"}
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
              >
                {done ? "고치기" : "끝내기"}
                <ChevronDown size={14} className={open ? "is-flipped" : ""} />
              </button>
            )}
          </span>
        )}
      </div>
      {open && (
        <div className="inc-duty-form">
          <FloatTextarea
            className="float-field--flush"
            id={`duty-note-${duty.id}`}
            label="증빙 메모"
            rows={2}
            maxLength={1000}
            hint={label.hint}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {duty.kind === "SHARE" && !done && (
            <p className="inc-duty-share">
              <button type="button" className="btn-secondary" onClick={sms}>
                <MessageSquare size={14} /> 문자로 공지
              </button>
            </p>
          )}
          <div className="inc-duty-buttons">
            {done && (
              <button
                type="button"
                className="btn-secondary"
                disabled={pending}
                onClick={() => submit(false)}
              >
                <RotateCcw size={14} /> 끝내기 취소
              </button>
            )}
            <button
              type="button"
              className="btn-primary"
              disabled={pending}
              onClick={() => submit(true)}
            >
              <Check size={14} />{" "}
                {pending ? "저장 중…" : done ? "메모 저장" : "끝냈습니다"}
            </button>
          </div>
        </div>
      )}
      <FormErrorDialog message={error} nonce={error} />
      {toastEl}
    </li>
  );
}

/** 재발방지대책 이행. 위험성평가 조치 기록과 같은 모양(계획 → 실제). */
export function ActionList({
  incidentId,
  actions,
  today,
  locked,
}: {
  incidentId: string;
  actions: IncidentAction[];
  today: string;
  locked: boolean;
}) {
  if (actions.length === 0)
    return (
      <p className="wo-muted">재발방지대책이 없습니다. 고치기에서 적으세요.</p>
    );
  return (
    <ul className="inc-cards" role="list">
      {actions.map((a, i) => (
        <ActionRow
          key={a.id}
          incidentId={incidentId}
          index={i}
          action={a}
          today={today}
          locked={locked}
        />
      ))}
    </ul>
  );
}

function ActionRow({
  incidentId,
  index,
  action,
  today,
  locked,
}: {
  incidentId: string;
  index: number;
  action: IncidentAction;
  today: string;
  locked: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(action.note);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const done = Boolean(action.done_at);
  const overdue = !done && Boolean(action.due_on) && action.due_on! < today;

  const submit = (next: boolean) =>
    start(async () => {
      setError(null);
      const r = await actionDoneAction({
        incidentId,
        actionId: action.id,
        done: next,
        note,
      });
      if (!r.ok) setError(r.error);
      else {
        setOpen(false);
        router.refresh();
      }
    });

  return (
    <li className={`inc-card${done ? " is-done" : ""}`}>
      <div className="inc-card-head">
        <strong>
          대책 {index + 1}
          {done ? (
            <span className="inc-duty-done">
              {" "}
              <Check size={12} /> 완료 {koDate(action.done_at)}
            </span>
          ) : null}
        </strong>
        {!locked && (
          <button
            type="button"
            className={done ? "btn-secondary" : "btn-primary"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {done ? "고치기" : "완료 적기"}
            <ChevronDown size={14} className={open ? "is-flipped" : ""} />
          </button>
        )}
      </div>
      <p className="inc-measure">{action.measure}</p>
      <dl className="wo-facts wo-facts--tight">
        <div>
          <dt>담당</dt>
          <dd>{action.responsible_name ?? "미정"}</dd>
        </div>
        <div>
          <dt>기한</dt>
          <dd data-tone={overdue ? "danger" : undefined}>
            {action.due_on ? koDate(action.due_on) : "없음"}
            {overdue ? " · 지남" : ""}
          </dd>
        </div>
      </dl>
      {action.note && !open && <p className="inc-duty-note">{action.note}</p>}
      {open && (
        <div className="inc-duty-form">
          <FloatTextarea
            className="float-field--flush"
            id={`action-note-${action.id}`}
            label="실제 조치 내용"
            rows={2}
            maxLength={1000}
            hint="무엇을 어떻게 했는지"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="inc-duty-buttons">
            {done && (
              <button
                type="button"
                className="btn-secondary"
                disabled={pending}
                onClick={() => submit(false)}
              >
                <RotateCcw size={14} /> 끝내기 취소
              </button>
            )}
            <button
              type="button"
              className="btn-primary"
              disabled={pending}
              onClick={() => submit(true)}
            >
              <Check size={14} />{" "}
                {pending ? "저장 중…" : done ? "메모 저장" : "완료했습니다"}
            </button>
          </div>
        </div>
      )}
      <FormErrorDialog message={error} nonce={error} />
    </li>
  );
}

/** 종결·다시 열기. 종결은 확인 창을 거친다 — 그 뒤엔 잠긴다. */
export function CloseButtons({
  incidentId,
  status,
  remaining,
}: {
  incidentId: string;
  status: "OPEN" | "CLOSED";
  /** 남은 할 일 + 남은 대책 수. 0 이어야 종결할 수 있다. */
  remaining: number;
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (
    fn: () => Promise<{ ok: true } | { ok: false; error: string }>,
  ) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error);
      else router.refresh();
    });

  return (
    <>
      {dialog}
      <FormErrorDialog
        message={error}
        nonce={error}
        title="처리하지 못했습니다"
      />
      {status === "CLOSED" ? (
        <button
          type="button"
          className="btn-secondary"
          disabled={pending}
          onClick={async () => {
            if (
              await confirm(
                "종결된 사고를 다시 엽니다. 할 일과 내용을 고칠 수 있게 됩니다.",
                { confirmLabel: "다시 열기" },
              )
            )
              run(() => reopenIncidentAction(incidentId));
          }}
        >
          <LockOpen size={14} /> 다시 열기
        </button>
      ) : (
        <button
          type="button"
          className="btn-primary"
          disabled={pending || remaining > 0}
          title={remaining > 0 ? `남은 할 일 ${remaining}개` : undefined}
          onClick={async () => {
            if (
              await confirm(
                "할 일이 모두 끝났습니다. 종결하면 기록이 잠기고 3년 보관됩니다.",
                { confirmLabel: "종결" },
              )
            )
              run(() => closeIncidentAction(incidentId));
          }}
        >
          <CircleCheckBig size={14} /> 종결
        </button>
      )}
    </>
  );
}

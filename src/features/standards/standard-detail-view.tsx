"use client";

import { useTransition } from "react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import Link from "next/link";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  CircleAlert,
  Pencil,
  Plus,
  ShieldCheck,
} from "lucide-react";
import {
  ASSESSMENT_KIND_LABEL,
  type StandardDetail,
} from "@/features/standards/constants";
import {
  AttachmentList,
  type AttachmentItem,
} from "@/features/attachments/attachment-list";
import { AttachmentUploader } from "@/features/attachments/attachment-uploader";
import {
  approveRevisionAction,
  archiveStandardAction,
  discardRevisionAction,
  startRevisionAction,
} from "./actions";
import { FormErrorDialog } from "@/components/ui/form-error-dialog";
import { useState } from "react";

export type AttachmentMap = Record<string, AttachmentItem[]>;

const RISK_LABEL = { HIGH: "상", MID: "중", LOW: "하" } as const;

export function StandardDetailView({
  detail,
  isPro = false,
  stepAttachments = {},
  riskBefore = {},
  riskAfter = {},
}: {
  detail: StandardDetail;
  isPro?: boolean;
  stepAttachments?: AttachmentMap;
  riskBefore?: AttachmentMap;
  riskAfter?: AttachmentMap;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [errorTitle, setErrorTitle] = useState<string | undefined>(undefined);
  const invalidatePath = `/standards/${detail.standard_id}`;

  const { confirm, dialog } = useConfirm();
  const run = (
    action: (form: FormData) => Promise<{ error?: string } | undefined | void>,
  ) =>
    startTransition(async () => {
      setError(null);
      setErrorTitle(undefined);
      const form = new FormData();
      form.set("standard_id", detail.standard_id);
      const result = await action(form);
      if (result?.error) setError(result.error);
    });
  const onStartRevision = async () => {
    if (
      !(await confirm(
        `${detail.name} 표준서의 개정본을 만드시겠습니까? 개정본은 기존 표준서를 복사하여 만들어지며, 수정하여 확정하면 됩니다.`,
        { title: "표준서 개정", confirmLabel: "확인" },
      ))
    )
      return;
    run(startRevisionAction);
  };
  const onApprove = async () => {
    if (
      !(await confirm(
        `${detail.draft?.revision_no}판으로 확정합니다. 확정된 판은 고칠 수 없고, 이후 지시서와 위험성평가는 이 판을 가리킵니다.`,
        { title: "개정 확정", confirmLabel: "확정" },
      ))
    )
      return;
    run(approveRevisionAction);
  };
  const onDiscard = async () => {
    if (
      !(await confirm(
        "작성 중인 개정 초안을 버릴까요? 현재 판은 그대로입니다.",
        {
          title: "개정 초안 버리기",
          confirmLabel: "버리기",
          danger: true,
        },
      ))
    )
      return;
    run(discardRevisionAction);
  };
  const onArchive = async () => {
    if (detail.draft) {
      setErrorTitle("폐기할 수 없습니다");
      setError(
        `작성 중인 ${detail.draft.revision_no}판 개정 초안이 있습니다. 먼저 초안을 버리거나 확정한 뒤 폐기하세요.`,
      );
      return;
    }
    if (
      !(await confirm(
        `${detail.name} 을 폐기할까요? 폐기된 표준서는 새 지시서 작성에서 선택할 수 없습니다. 기존에 발급된 지시서에는 영향이 없습니다.`,
        { title: "표준서 폐기", confirmLabel: "폐기", danger: true },
      ))
    )
      return;
    run(archiveStandardAction);
  };

  const active = detail.status === "APPROVED";
  const archived = detail.status === "ARCHIVED";
  const current = detail.current_assessment;
  const noValid = !current || current.expired;

  return (
    <>
      {dialog}
      <FormErrorDialog message={error} nonce={error} title={errorTitle} />
      <Link href="/standards" className="text-button std-back-link">
        <ArrowLeft size={13} /> 표준서 목록
      </Link>

      <header className="std-detail-hero">
        <div>
          <span className="std-detail-tag">
            {active ? "확정됨" : archived ? "폐기" : "작성 중"}
            {detail.ptw_required ? " · PTW 필요" : ""}
          </span>
          <h1>{detail.name}</h1>
          <p className="std-detail-meta">
            {detail.revision
              ? `${detail.revision.revision_no}판 · 확정 ${new Date(
                  detail.revision.approved_at ?? detail.revision.created_at,
                ).toLocaleDateString("ko-KR")} · ${
                  detail.revision.approved_by_name ??
                  detail.revision.created_by_name
                }`
              : `생성 ${new Date(detail.created_at).toLocaleDateString("ko-KR")}`}
          </p>
        </div>
        {/* 첫 줄은 이 표준서로 할 일(지시서), 둘째 줄은 표준서 자체를 다루는 것 셋. */}
        <div className="std-detail-actions">
          {active && !noValid && (
            <Link
              href={`/work-orders/new?standard=${detail.standard_id}`}
              className="primary-button"
            >
              <ShieldCheck size={14} /> 이 표준서로 지시서 작성
              <ArrowRight size={13} />
            </Link>
          )}
          {!archived && (
            <div className="std-detail-actions-row">
              {!detail.draft && (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={onStartRevision}
                  disabled={pending}
                >
                  <Pencil size={13} /> 표준서 개정
                </button>
              )}
              <Link
                href={`/standards/${detail.standard_id}/assessments/new`}
                className="ghost-button"
              >
                <Plus size={13} /> 위험성평가 회차 추가
              </Link>
              <button
                type="button"
                className="ghost-button ghost-button--danger"
                onClick={onArchive}
                disabled={pending}
              >
                <Archive size={13} /> 폐기
              </button>
            </div>
          )}
        </div>
      </header>

      {detail.draft && (
        <div className="std-info-banner std-draft-banner" role="status">
          <Pencil size={16} />
          <div>
            <strong>
              {detail.draft.revision_no}판 개정 작성 중 ·{" "}
              {detail.draft.created_by_name} ·{" "}
              {new Date(detail.draft.created_at).toLocaleDateString("ko-KR")}
            </strong>
            <p>
              현재 {detail.revision?.revision_no ?? "-"}판은 그대로입니다.
              초안을 고친 뒤 확정하면 새 판이 됩니다.
            </p>
            <div className="std-draft-actions">
              <Link
                href={`/standards/${detail.standard_id}/edit`}
                className="btn-primary"
              >
                이어서 수정
              </Link>
              <button
                type="button"
                className="btn-secondary"
                onClick={onApprove}
                disabled={pending}
              >
                이대로 확정
              </button>
              <button
                type="button"
                className="text-button"
                onClick={onDiscard}
                disabled={pending}
              >
                버리기
              </button>
            </div>
          </div>
        </div>
      )}

      {active && noValid && (
        <div className="std-warn-banner" role="alert">
          <CircleAlert size={16} />
          <div>
            <strong>유효한 위험성평가가 없거나 만료됐습니다.</strong>
            <p>
              지시서 발급에 사용하려면{" "}
              <Link href={`/standards/${detail.standard_id}/assessments/new`}>
                정기 위험성평가 회차를 새로 등록
              </Link>{" "}
              하세요. 산안법상 정기 위험성평가는 매년, 최초 위험성평가는 3년마다 실시가
              권장됩니다.
            </p>
          </div>
        </div>
      )}

      {current && !current.expired && (
        <div className="std-info-banner">
          <ShieldCheck size={16} />
          <div>
            <strong>
              이 표준서의 위험성평가: {ASSESSMENT_KIND_LABEL[current.kind]} (
              {new Date(current.performed_on).toLocaleDateString("ko-KR")})
            </strong>
            <br/>
            <p>
              유효기간{" "}
              {current.valid_until
                ? `${new Date(current.valid_until).toLocaleDateString("ko-KR")}까지`
                : "상시"}{" "}
            </p>
          </div>
        </div>
      )}

      <section className="std-detail-section">
        <h2>작업 단계</h2>
        {detail.steps.length > 0 ? (
          <ol className="std-detail-list std-detail-list--with-attach">
            {detail.steps.map((s) => (
              <li key={s.id}>
                <div className="std-detail-step-text">{s.step_text}</div>
                {(stepAttachments[s.id]?.length ?? 0) > 0 && (
                  <AttachmentList
                    items={stepAttachments[s.id] ?? []}
                    invalidatePath={invalidatePath}
                    canDelete={false}
                    emptyLabel=""
                    compact
                  />
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="std-form-note">등록된 단계가 없습니다.</p>
        )}
        {/* 확정된 판은 사진도 고정이다. 붙이거나 지우는 건 개정 초안에서. */}
        {!isPro && detail.steps.length > 0 && (
          <p className="attach-uploader-hint">
            유료 요금제에서 작업 단계별 사진을 첨부할 수 있습니다.
          </p>
        )}
        {isPro && !archived && detail.steps.length > 0 && (
          <p className="attach-uploader-hint">
            사진을 붙이거나 지우려면 개정을 시작해 초안에서 하세요. 확정된 판은
            사진도 그대로 남습니다.
          </p>
        )}
      </section>

      <section className="std-detail-section">
        <h2>안전/품질 체크리스트</h2>
        <div className="std-detail-checklist">
          <div>
            <span className="std-detail-sublabel">작업 전 (TBM)</span>
            <ul>
              {detail.checklist_tbm.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </div>
          <div>
            <span className="std-detail-sublabel">작업 중</span>
            <ul>
              {detail.checklist_during.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {current && (
        <section className="std-detail-section">
          <h2>이 표준서의 위험성평가</h2>
          {/* 판단 기준 표는 여기서 보이지 않는다 (사장님 결정). 회사정보 > 판단 기준과 평가 상세에서 본다. */}
          <dl className="std-detail-info">
            <div>
              <dt>설비</dt>
              <dd>{current.safety_info.equipment}</dd>
            </div>
            <div>
              <dt>물질</dt>
              <dd>{current.safety_info.materials}</dd>
            </div>
            <div>
              <dt>주변 환경</dt>
              <dd>{current.safety_info.environment}</dd>
            </div>
            <div>
              <dt>재해·아차사고</dt>
              <dd>{current.safety_info.history}</dd>
            </div>
          </dl>
          <div className="std-detail-risks">
            <span className="std-detail-sublabel">위험요인 · 감소대책</span>
            <ol>
              {current.risks.map((r) => (
                <li key={r.id} className="std-detail-risk">
                  <p className="std-detail-risk-head">
                    <strong>{r.hazard}</strong>
                    <span
                      className={`std-detail-risk-badge std-detail-risk-badge--${r.initial_risk_level.toLowerCase()}`}
                    >
                      {RISK_LABEL[r.initial_risk_level]}
                    </span>
                    <span className="std-detail-risk-allow">
                      {r.initial_allowable ? "허용 가능" : "허용 불가"}
                    </span>
                  </p>
                  {r.current_control && (
                    <p className="std-detail-risk-control">
                      현재 조치: {r.current_control}
                    </p>
                  )}
                  <p className="std-detail-risk-measure">
                    → {r.reduction_measure}
                  </p>
                  <div className="std-risk-attach">
                    <RiskAttach
                      title="조치 전"
                      items={riskBefore[r.id] ?? []}
                      targetId={r.id}
                      targetType="risk_item_before"
                      isPro={isPro}
                      invalidatePath={invalidatePath}
                    />
                    <RiskAttach
                      title="조치 후"
                      items={riskAfter[r.id] ?? []}
                      targetId={r.id}
                      targetType="risk_item_after"
                      isPro={isPro}
                      invalidatePath={invalidatePath}
                    />
                  </div>
                </li>
              ))}
            </ol>
            {!isPro && (
              <p className="attach-uploader-hint">
                유료 요금제에서 조치 전·후 사진을 첨부할 수 있습니다.
              </p>
            )}
          </div>
          {current.participant_names.length > 0 && (
            <p className="std-detail-participants">
              <span className="std-detail-sublabel">위험성평가 참여자</span>
              <span>{current.participant_names.join(", ")}</span>
            </p>
          )}
        </section>
      )}

      <section className="std-detail-section">
        <h2>개정 이력 ({detail.revisions.length}판)</h2>
        <ul className="std-assessment-history" role="list">
          {detail.revisions.map((r) => (
            <li
              key={r.id}
              className={`std-assessment-row${r.status === "APPROVED" ? " is-current" : ""}`}
            >
              <span className="std-assessment-kind">{r.revision_no}판</span>
              <span className="std-assessment-date">
                {r.status === "DRAFT" ? "작성" : "확정"}{" "}
                {new Date(r.approved_at ?? r.created_at).toLocaleDateString(
                  "ko-KR",
                )}{" "}
                · {r.approved_by_name ?? r.created_by_name}
              </span>
              {r.change_note && (
                <span className="std-assessment-valid">{r.change_note}</span>
              )}
              <span
                className={`std-assessment-status std-assessment-status--${
                  r.status === "APPROVED"
                    ? "approved"
                    : r.status === "DRAFT"
                      ? "pending"
                      : "draft"
                }`}
              >
                {r.status === "APPROVED"
                  ? "현재 판"
                  : r.status === "DRAFT"
                    ? "작성 중"
                    : "지난 판"}
              </span>
              {r.status !== "DRAFT" && (
                <Link
                  href={`/standards/${detail.standard_id}/revisions/${r.revision_no}`}
                  className="text-button"
                >
                  보기
                </Link>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="std-detail-section">
        <h2>위험성평가 회차 이력 ({detail.assessments.length}건)</h2>
        {detail.assessments.length === 0 ? (
          <p className="std-form-note">등록된 위험성평가가 없습니다.</p>
        ) : (
          <ul className="std-assessment-history" role="list">
            {detail.assessments.map((a) => (
              <li
                key={a.assessment_id}
                className={`std-assessment-row${a.is_current ? " is-current" : ""}${
                  a.expired ? " is-expired" : ""
                }`}
              >
                <span className="std-assessment-kind">
                  {ASSESSMENT_KIND_LABEL[a.kind]}
                </span>
                <span className="std-assessment-date">
                  실시일 {new Date(a.performed_on).toLocaleDateString("ko-KR")}
                </span>
                {a.valid_until && (
                  <span className="std-assessment-valid">
                    유효 ~ {new Date(a.valid_until).toLocaleDateString("ko-KR")}
                  </span>
                )}
                <span
                  className={`std-assessment-status std-assessment-status--${a.status.toLowerCase()}`}
                >
                  {a.status === "APPROVED"
                    ? "승인"
                    : a.status === "PENDING"
                      ? "승인 대기"
                      : a.status === "DRAFT"
                        ? "작성 중"
                        : "반려"}
                </span>
                {a.is_current && (
                  <span className="std-assessment-badge std-assessment-badge--current">
                    현재 사용 중
                  </span>
                )}
                {a.expired && (
                  <span className="std-assessment-badge std-assessment-badge--expired">
                    만료
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function RiskAttach({
  title,
  items,
  targetId,
  targetType,
  isPro,
  invalidatePath,
}: {
  title: string;
  items: AttachmentItem[];
  targetId: string;
  targetType: "risk_item_before" | "risk_item_after";
  isPro: boolean;
  invalidatePath: string;
}) {
  if (!isPro && items.length === 0) return null;
  return (
    <div className="std-risk-attach-col">
      <span className="std-risk-attach-title">{title}</span>
      <AttachmentList
        items={items}
        invalidatePath={invalidatePath}
        canDelete={isPro}
        emptyLabel="없음"
        compact
      />
      {isPro && (
        <AttachmentUploader
          targetType={targetType}
          targetId={targetId}
          invalidatePath={invalidatePath}
          label="사진 추가"
        />
      )}
    </div>
  );
}

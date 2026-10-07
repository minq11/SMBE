"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Save, RotateCcw, Trash2, ArrowLeft } from "lucide-react";
import { FloatField, FloatTextarea } from "@/components/ui/float-field";
import {
  FormErrorDialog,
  useFormError,
} from "@/components/ui/form-error-dialog";
import { HelpDialog } from "@/components/ui/help-dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { type PolicyInput, type SafetyPolicy } from "./model";
import { saveSafetyPolicyAction } from "./actions";

export function PolicyForm({
  initial,
  previous,
  storageKey,
}: {
  initial: PolicyInput;
  previous: SafetyPolicy | null;
  storageKey: string;
}) {
  const [data, setData] = useState(initial);
  const [backup, setBackup] = useState<PolicyInput | null>(null);
  const [pending, start] = useTransition();
  const err = useFormError();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const href = `/company/safety-policy?year=${initial.year}`;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      // 미완성 입력도 복구하되 다른 연도·버전의 문서를 덮어쓰지는 않는다.
      const stored = JSON.parse(raw) as PolicyInput;
      const strings = [
        stored.policy,
        stored.goals,
        stored.representative,
        stored.establishedOn,
      ];
      if (
        stored.year !== initial.year ||
        stored.revision !== initial.revision ||
        !strings.every((v) => typeof v === "string") ||
        stored.policy.length > 4000 ||
        stored.goals.length > 2000 ||
        stored.representative.length > 100 ||
        stored.establishedOn.length > 10
      ) {
        localStorage.removeItem(storageKey);
        return;
      }
      const timer = setTimeout(() => setBackup(stored), 0);
      return () => clearTimeout(timer);
    } catch {
      /* 기기 저장소가 없어도 작성 가능 */
    }
  }, [initial.year, initial.revision, storageKey]);
  const change = (next: PolicyInput) => {
    setData(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* 저장소 제한 */
    }
  };
  const clearBackup = () => {
    setBackup(null);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* 저장소 제한 */
    }
  };
  return (
    <form
      className="policy-form-page"
      onSubmit={(event) => {
        event.preventDefault();
        start(async () => {
          err.clear();
          try {
            const result = await saveSafetyPolicyAction(data);
            if (result.error) return err.show(result.error);
            if (result.saved) {
              clearBackup();
              router.push(href);
              router.refresh();
            }
          } catch {
            err.show("저장하지 못했습니다. 잠시 후 다시 시도하세요.");
          }
        });
      }}
    >
      {backup && (
        <section className="policy-card">
          <p>이 기기에 작성 중인 내용이 있습니다.</p>
          <div className="form-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={clearBackup}
            >
              <Trash2 size={14} /> 버리기
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                change(backup);
                setBackup(null);
              }}
            >
              <RotateCcw size={14} /> 이어서 작성
            </button>
          </div>
        </section>
      )}
      <fieldset
        className="policy-card policy-fields"
        disabled={pending || backup !== null}
      >
        <legend>{initial.year}년 방침·목표</legend>
        <div className="policy-tools">
          <HelpDialog title="방침·목표 작성" variant="icon">
            <p>
              기본 방침을 우리 현장에 맞게 고치고, 올해 실행할 목표를 적습니다.
            </p>
            <p>예: 작업 전 TBM 매일 실시, 발견한 위험요인 7일 안에 조치.</p>
            <p>
              대표자명은 게시 문서에 표시됩니다. 저장은 전자서명이나 별도 승인이
              아닙니다.
            </p>
          </HelpDialog>
          {previous && (
            <button
              type="button"
              className="btn-secondary"
              onClick={async () => {
                if (
                  await confirm(
                    "입력한 방침·목표·대표자명을 작년 내용으로 바꿉니다. 연도와 작성일은 유지합니다.",
                    { title: "작년 내용 가져오기", confirmLabel: "가져오기" },
                  )
                ) {
                  change({
                    ...data,
                    policy: previous.policy,
                    goals: previous.goals,
                    representative: previous.representative,
                  });
                }
              }}
            >
              <Copy size={14} /> 작년 내용 가져오기
            </button>
          )}
        </div>
        <FloatTextarea
          id="safety-policy"
          label="안전보건 방침"
          value={data.policy}
          rows={8}
          maxLength={4000}
          required
          onChange={(e) => change({ ...data, policy: e.target.value })}
        />
        <FloatTextarea
          id="safety-goals"
          label="연간 안전보건 목표"
          hint="작업 전 TBM 매일 실시, 위험요인 7일 안에 조치"
          value={data.goals}
          rows={5}
          maxLength={2000}
          required
          onChange={(e) => change({ ...data, goals: e.target.value })}
        />
        <div className="policy-fields-row">
          <FloatField
            id="policy-representative"
            label="대표자명"
            value={data.representative}
            maxLength={100}
            required
            onChange={(e) =>
              change({ ...data, representative: e.target.value })
            }
          />
          <FloatField
            id="policy-date"
            label="작성일"
            type="date"
            value={data.establishedOn}
            required
            onChange={(e) => change({ ...data, establishedOn: e.target.value })}
          />
        </div>
      </fieldset>
      <div className="form-actions policy-save">
        <Link className="go-link" href={href}>
          <ArrowLeft size={14} /> 돌아가기
        </Link>
        <button
          type="submit"
          className="btn-primary"
          disabled={pending || backup !== null}
        >
          <Save size={14} /> {pending ? "저장 중…" : "저장"}
        </button>
      </div>
      <FormErrorDialog message={err.message} nonce={err.nonce} />
      {dialog}
    </form>
  );
}

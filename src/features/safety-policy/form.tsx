"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Save, PenLine, Trash2, ArrowLeft, Plus } from "lucide-react";
import { FloatField, FloatTextarea } from "@/components/ui/float-field";
import {
  FormErrorDialog,
  useFormError,
} from "@/components/ui/form-error-dialog";
import { HelpDialog } from "@/components/ui/help-dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  budgetTotals,
  policyDraftSchema,
  type Budget,
  type PolicyInput,
  type SafetyPolicy,
} from "./model";

const QUARTERS = [1, 2, 3, 4] as const;
/** 폼에서는 네 분기 줄이 늘 보인다. 저장할 때 빈 줄은 뺀다. */
function fourQuarters(spent: Budget["spent"]): Budget["spent"] {
  return QUARTERS.map(
    (quarter) =>
      spent.find((s) => s.quarter === quarter) ?? {
        quarter,
        amount: 0,
        note: "",
      },
  );
}
/** 만원 칸: 숫자만 받고 0 은 빈칸으로 보인다. */
const manwonValue = (n: number) => (n === 0 ? "" : String(n));
const manwonParse = (raw: string) =>
  Math.min(100_000_000, Number(raw.replace(/\D/g, "")) || 0);
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
  const [data, setData] = useState<PolicyInput>({
    ...initial,
    budget: { ...initial.budget, spent: fourQuarters(initial.budget.spent) },
  });
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
      const parsed = policyDraftSchema.safeParse(JSON.parse(raw));
      if (
        !parsed.success ||
        parsed.data.year !== initial.year ||
        parsed.data.revision !== initial.revision
      ) {
        localStorage.removeItem(storageKey);
        return;
      }
      const stored = parsed.data;
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
            // 이름도 금액도 없는 예산 줄, 금액도 내용도 없는 분기 줄은 보내지 않는다.
            const budget: Budget = {
              items: data.budget.items.filter(
                (i) => i.name.trim() || i.planned > 0,
              ),
              spent: data.budget.spent.filter(
                (q) => q.amount > 0 || q.note.trim(),
              ),
            };
            const result = await saveSafetyPolicyAction({ ...data, budget });
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
              data-tone="danger"
              onClick={clearBackup}
            >
              <Trash2 size={14} /> 버리기
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                change(backup);
                setBackup(null);
              }}
            >
              <PenLine size={14} /> 이어서 작성
            </button>
          </div>
        </section>
      )}
      <fieldset
        className="policy-card policy-fields"
        disabled={pending || backup !== null}
        aria-labelledby="policy-fields-head"
      >
        {/* 제목 왼쪽, 물음표 오른쪽 (헌법 4장). legend 는 자리를 못 잡아 h2 로. */}
        <div className="wo-section-head">
          <h2 id="policy-fields-head">{initial.year}년 방침·목표</h2>
          <HelpDialog title="방침·목표 작성" variant="icon">
            <dl className="help-rows">
              <dt>무엇</dt>
              <dd>
                기본 방침을 우리 현장에 맞게 고치고, 올해 실행할 목표를
                적습니다.
              </dd>
              <dt>예</dt>
              <dd>작업 전 TBM 매일 실시, 발견한 위험요인 7일 안에 조치.</dd>
              <dt>게시</dt>
              <dd>대표자명과 작성일이 게시 문서에 찍힙니다.</dd>
            </dl>
          </HelpDialog>
        </div>
        {previous && (
          <div className="policy-tools">
            <button
              type="button"
              className="btn-secondary"
              onClick={async () => {
                if (
                  await confirm(
                    "입력한 방침·목표·대표자명·예산 항목을 작년 내용으로 바꿉니다. 연도와 작성일은 유지합니다.",
                    { title: "작년 내용 가져오기", confirmLabel: "가져오기" },
                  )
                ) {
                  change({
                    ...data,
                    policy: previous.policy,
                    goals: previous.goals,
                    representative: previous.representative,
                    // 예산 항목·편성액은 가져오고 집행은 올해 것이라 비운다.
                    budget: {
                      items: previous.budget.items,
                      spent: fourQuarters([]),
                    },
                  });
                }
              }}
            >
              <Copy size={14} /> 작년 내용 가져오기
            </button>
          </div>
        )}
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
      <fieldset
        className="policy-card policy-fields"
        disabled={pending || backup !== null}
        aria-labelledby="policy-budget-head"
      >
        <div className="wo-section-head">
          <h2 id="policy-budget-head">안전보건 예산</h2>
          <HelpDialog title="안전보건 예산" variant="icon">
            <dl className="help-rows">
              <dt>무엇</dt>
              <dd>
                올해 안전에 쓸 돈을 항목별로 편성하고, 분기마다 쓴 금액을 한 줄
                적습니다. 단위는 만원.
              </dd>
              <dt>예</dt>
              <dd>
                보호구 120 · 점검·정비 300 · 교육 50 → 1분기 안전화 6켤레 40.
              </dd>
              <dt>왜</dt>
              <dd>
                중대재해처벌법 시행령 4조 3호. 예산을 편성하고 그대로 집행한
                기록이 경영책임자의 의무 이행 증거입니다.
              </dd>
            </dl>
          </HelpDialog>
        </div>
        <ol className="policy-budget-list" aria-label="예산 항목">
          {data.budget.items.map((item, i) => (
            <li key={i}>
              <FloatField
                id={`budget-name-${i}`}
                label={`항목 ${i + 1}`}
                value={item.name}
                maxLength={60}
                onChange={(e) =>
                  change({
                    ...data,
                    budget: {
                      ...data.budget,
                      items: data.budget.items.map((it, j) =>
                        j === i ? { ...it, name: e.target.value } : it,
                      ),
                    },
                  })
                }
              />
              <FloatField
                id={`budget-planned-${i}`}
                label="편성 (만원)"
                inputMode="numeric"
                value={manwonValue(item.planned)}
                onChange={(e) =>
                  change({
                    ...data,
                    budget: {
                      ...data.budget,
                      items: data.budget.items.map((it, j) =>
                        j === i
                          ? { ...it, planned: manwonParse(e.target.value) }
                          : it,
                      ),
                    },
                  })
                }
              />
              <button
                type="button"
                className="icon-button"
                aria-label={`항목 ${i + 1} 삭제`}
                onClick={() =>
                  change({
                    ...data,
                    budget: {
                      ...data.budget,
                      items: data.budget.items.filter((_, j) => j !== i),
                    },
                  })
                }
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ol>
        <div className="policy-budget-foot">
          <button
            type="button"
            className="btn-secondary btn--sm"
            disabled={data.budget.items.length >= 12}
            onClick={() =>
              change({
                ...data,
                budget: {
                  ...data.budget,
                  items: [...data.budget.items, { name: "", planned: 0 }],
                },
              })
            }
          >
            <Plus size={13} /> 항목 추가
          </button>
          <p className="policy-budget-total">
            편성 합계{" "}
            <strong>
              {budgetTotals(data.budget).planned.toLocaleString("ko-KR")}
            </strong>{" "}
            만원
          </p>
        </div>
        <h3 className="policy-budget-sub">집행</h3>
        <ol
          className="policy-budget-list policy-budget-list--spent"
          aria-label="분기별 집행"
        >
          {data.budget.spent.map((q, i) => (
            <li key={q.quarter}>
              <span className="policy-budget-quarter">{q.quarter}분기</span>
              <FloatField
                id={`budget-spent-${q.quarter}`}
                label="집행 (만원)"
                inputMode="numeric"
                value={manwonValue(q.amount)}
                onChange={(e) =>
                  change({
                    ...data,
                    budget: {
                      ...data.budget,
                      spent: data.budget.spent.map((sp, j) =>
                        j === i
                          ? { ...sp, amount: manwonParse(e.target.value) }
                          : sp,
                      ),
                    },
                  })
                }
              />
              <FloatField
                id={`budget-note-${q.quarter}`}
                label="내용"
                hint="안전화 6켤레"
                value={q.note}
                maxLength={200}
                onChange={(e) =>
                  change({
                    ...data,
                    budget: {
                      ...data.budget,
                      spent: data.budget.spent.map((sp, j) =>
                        j === i ? { ...sp, note: e.target.value } : sp,
                      ),
                    },
                  })
                }
              />
            </li>
          ))}
        </ol>
      </fieldset>
      <div className="form-actions sticky-actions">
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

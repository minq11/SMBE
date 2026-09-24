"use client";
import { useActionState, useState } from "react";
import { permitAction, bulkApproveAction } from "./actions";
import Link from "next/link";
import {
  FloatField,
  FloatSelect,
  FloatTextarea,
} from "@/components/ui/float-field";
import type { PermitInput } from "@/server/ptw-service";
import type { MemberOption } from "@/features/work-orders/model";
export function PermitList({
  rows,
}: {
  rows: {
    orderId: string;
    revision: number;
    name: string;
    summary: string;
    canApprove: boolean;
  }[];
}) {
  const [state, action, pending] = useActionState(bulkApproveAction, undefined);
  return (
    <form action={action} className="account-form">
      {rows.map((r) => (
        <section key={r.orderId} className="account-panel">
          <label className="account-confirm">
            <input
              type="checkbox"
              name="target"
              disabled={!r.canApprove || pending}
              value={JSON.stringify({
                orderId: r.orderId,
                revision: r.revision,
              })}
            />
            <span>
              <Link href={"/work-orders/" + r.orderId + "/permit"}>
                {r.name}
              </Link>
              <br />
              {r.summary}
            </span>
          </label>
        </section>
      ))}
      <button disabled={pending} className="primary-button">
        선택 허가 일괄 승인
      </button>
      {state?.error && <p role="alert">{state.error}</p>}
      {state?.message && <p role="status">{state.message}</p>}
    </form>
  );
}
export function PermitRequestForm({
  orderId,
  revision,
  userId,
  members,
  locations,
}: {
  orderId: string;
  revision: number;
  userId: string;
  members: MemberOption[];
  locations: { id: string; label: string }[];
}) {
  const [state, action, pending] = useActionState(permitAction, undefined);
  const [data, setData] = useState<PermitInput>({
    approverId: "",
    responsibleId: userId,
    locationId: "",
    equipment: "",
    notes: "",
    hotWork: false,
    fireWatcherId: "",
    contacts: [{ name: "", phone: "" }],
  });
  const managers = members.filter((m) => m.role !== "WORKER");
  return (
    <form action={action} className="account-form">
      <input type="hidden" name="command" value="request" />
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="revision" value={revision} />
      <input type="hidden" name="payload" value={JSON.stringify(data)} />
      <FloatSelect
        id="permit-request-location"
        className="float-field--flush"
        label="작업 장소"
        required
        value={data.locationId}
        onChange={(e) => setData({ ...data, locationId: e.target.value })}
      >
        <option value="">등록된 장소 선택</option>
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.label}
          </option>
        ))}
      </FloatSelect>
      {(["approverId", "responsibleId"] as const).map((key) => (
        <FloatSelect
          key={key}
          id={"permit-request-" + key}
          className="float-field--flush"
          label={key === "approverId" ? "승인자" : "작업책임자"}
          required
          value={data[key]}
          onChange={(e) => setData({ ...data, [key]: e.target.value })}
        >
          <option value="">관리자 선택</option>
          {managers.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.display_name}
            </option>
          ))}
        </FloatSelect>
      ))}
      <FloatField
        id="permit-request-equipment"
        className="float-field--flush"
        label="대상 설비"
        required
        maxLength={2000}
        hint="예: 용접기, 크레인"
        value={data.equipment}
        onChange={(e) => setData({ ...data, equipment: e.target.value })}
      />
      <FloatTextarea
        id="permit-request-notes"
        className="float-field--flush"
        label="특이사항"
        maxLength={4000}
        value={data.notes}
        onChange={(e) => setData({ ...data, notes: e.target.value })}
      />
      <label className="account-confirm">
        <input
          type="checkbox"
          checked={data.hotWork}
          onChange={(e) => setData({ ...data, hotWork: e.target.checked })}
        />
        화기작업
      </label>
      {data.hotWork && (
        <FloatSelect
          id="permit-request-fire-watcher"
          className="float-field--flush"
          label="화재감시자"
          required
          value={data.fireWatcherId}
          onChange={(e) => setData({ ...data, fireWatcherId: e.target.value })}
        >
          <option value="">구성원 선택</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.display_name}
            </option>
          ))}
        </FloatSelect>
      )}
      <h3>비상연락처</h3>
      {data.contacts.map((c, i) => (
        <fieldset key={i}>
          <legend>연락처 {i + 1}</legend>
          <FloatField
            id={`permit-contact-${i}-name`}
            label="이름"
            required
            maxLength={100}
            value={c.name}
            onChange={(e) =>
              setData({
                ...data,
                contacts: data.contacts.map((v, j) =>
                  j === i ? { ...v, name: e.target.value } : v,
                ),
              })
            }
          />
          <FloatField
            id={`permit-contact-${i}-phone`}
            label="전화번호"
            required
            type="tel"
            inputMode="tel"
            maxLength={30}
            value={c.phone}
            onChange={(e) =>
              setData({
                ...data,
                contacts: data.contacts.map((v, j) =>
                  j === i ? { ...v, phone: e.target.value } : v,
                ),
              })
            }
          />
          {data.contacts.length > 1 && (
            <button
              type="button"
              onClick={() =>
                setData({
                  ...data,
                  contacts: data.contacts.filter((_, j) => j !== i),
                })
              }
            >
              연락처 삭제
            </button>
          )}
        </fieldset>
      ))}
      {data.contacts.length < 10 && (
        <button
          type="button"
          onClick={() =>
            setData({
              ...data,
              contacts: [...data.contacts, { name: "", phone: "" }],
            })
          }
        >
          연락처 추가
        </button>
      )}
      <label className="account-confirm">
        <input required name="confirm" type="checkbox" />
        위험성평가를 검토·승인하고 허가를 신청합니다. 승인 대기 중 지시서 내용은
        잠깁니다.
      </label>
      {data.approverId === userId && (
        <label className="account-confirm">
          <input required name="confirmSelf" type="checkbox" />
          본인이 허가를 승인하며 자가 승인 이력이 남음을 확인합니다.
        </label>
      )}
      {state?.error && <p role="alert">{state.error}</p>}
      {state?.message && <p role="status">{state.message}</p>}
      <div className="form-actions sticky-actions">
        <button disabled={pending} className="primary-button">
          {pending
            ? "처리 중…"
            : data.approverId === userId
              ? "신청&승인"
              : "평가 승인 후 허가 신청"}
        </button>
      </div>
    </form>
  );
}
export function PermitCommand({
  command,
  orderId,
  revision,
  members = [],
}: {
  command: "approve" | "reject" | "withdraw" | "reassign";
  orderId: string;
  revision: number;
  members?: MemberOption[];
}) {
  const [state, action, pending] = useActionState(permitAction, undefined);
  const labels = {
    approve: "허가 승인",
    reject: "반려",
    withdraw: "신청 철회",
    reassign: "승인자 변경",
  };
  return (
    <form action={action} className="account-form">
      <input type="hidden" name="command" value={command} />
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="revision" value={revision} />
      {command === "reject" && (
        <FloatTextarea
          id="permit-reject-reason"
          className="float-field--flush"
          label="반려 사유"
          name="value"
          required
          maxLength={1000}
        />
      )}
      {command === "reassign" && (
        <FloatSelect
          id="permit-reassign-approver"
          className="float-field--flush"
          label="새 승인자"
          name="value"
          required
          defaultValue=""
        >
          <option value="">관리자 선택</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.display_name}
            </option>
          ))}
        </FloatSelect>
      )}
      <button disabled={pending} className="secondary-button">
        {pending ? "처리 중…" : labels[command]}
      </button>
      {state?.error && <p role="alert">{state.error}</p>}
      {state?.message && <p role="status">{state.message}</p>}
    </form>
  );
}
export function LocationForm() {
  const [state, action, pending] = useActionState(permitAction, undefined);
  return (
    <form action={action} className="account-form">
      <input type="hidden" name="command" value="location" />
      <FloatField
        id="location-name"
        className="float-field--flush"
        label="장소 이름"
        name="name"
        required
        maxLength={200}
        hint="예: 용접장"
      />
      <button className="primary-button" disabled={pending}>
        장소 등록
      </button>
      {state?.error && <p role="alert">{state.error}</p>}
      {state?.message && <p role="status">{state.message}</p>}
    </form>
  );
}

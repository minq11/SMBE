"use client";

import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { FloatField } from "@/components/ui/float-field";
import { Segmented } from "@/features/assessments/risk-level-picker";
import type { MemberOption, PermitDraft } from "./model";
import type { LocationOption } from "./work-order-form";

const HOT_OPTIONS = [
  { value: "no", label: "아니오" },
  { value: "yes", label: "예 · 화기작업", tone: "warn" },
] as const;

/**
 * 지시서 안의 위험작업허가 항목 (설계 7장: "PTW 필요 시 PTW 내용까지 작성").
 * 전에는 저장 뒤 딴 화면에서 신청해야 했고 그동안 발급 단추가 꺼져 있었다. 이제
 * 여기 적어 두면 [지금 발급하기] 가 허가 신청과 (승인자가 본인이면) 승인까지 한다.
 */
export function PermitFields({
  value,
  onChange,
  members,
  locations,
  userId,
}: {
  value: PermitDraft;
  onChange: (next: PermitDraft) => void;
  members: MemberOption[];
  locations: LocationOption[];
  userId?: string;
}) {
  const set = <K extends keyof PermitDraft>(key: K, v: PermitDraft[K]) =>
    onChange({ ...value, [key]: v });
  const managers = members.filter((m) => m.role !== "WORKER");
  const contacts =
    value.contacts.length > 0 ? value.contacts : [{ name: "", phone: "" }];
  const setContact = (i: number, patch: Partial<PermitDraft["contacts"][0]>) =>
    set(
      "contacts",
      contacts.map((c, j) => (j === i ? { ...c, ...patch } : c)),
    );
  return (
    <div className="wo-permit" role="group" aria-label="위험작업허가 항목">
      <p className="wo-muted">
        허가 항목을 여기 적으면 발급할 때 허가 신청까지 함께 됩니다. 승인자가
        본인이면 바로 승인·발급되고(자가 승인 이력이 남습니다), 다른 관리자면 그
        관리자가 승인할 때 발급됩니다.
      </p>
      <div className="wo-columns">
        <div className="wo-field">
          <label htmlFor="wo-permit-approver">허가 승인자</label>
          <select
            id="wo-permit-approver"
            value={value.approverId}
            onChange={(e) => set("approverId", e.target.value)}
          >
            <option value="">관리자 선택</option>
            {managers.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.display_name}
                {m.user_id === userId ? " (본인)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="wo-field">
          <label htmlFor="wo-permit-responsible">작업책임자</label>
          <select
            id="wo-permit-responsible"
            value={value.responsibleId}
            onChange={(e) => set("responsibleId", e.target.value)}
          >
            <option value="">관리자 선택</option>
            {managers.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.display_name}
                {m.user_id === userId ? " (본인)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="wo-field">
        <label htmlFor="wo-permit-location">허가 장소 (등록된 장소)</label>
        <select
          id="wo-permit-location"
          value={value.locationId}
          onChange={(e) => set("locationId", e.target.value)}
        >
          <option value="">등록된 장소 선택</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
        {locations.length === 0 && (
          <span className="wo-muted">
            등록된 장소가 없습니다.{" "}
            <Link href="/company/locations" target="_blank" rel="noopener">
              장소 등록 (새 탭)
            </Link>{" "}
            뒤 임시저장하고 다시 여세요.
          </span>
        )}
      </div>
      <div className="wo-field">
        <label htmlFor="wo-permit-equipment">대상 설비</label>
        <input
          id="wo-permit-equipment"
          maxLength={2000}
          value={value.equipment}
          onChange={(e) => set("equipment", e.target.value)}
          placeholder="예: 용접기, 크레인"
        />
      </div>
      <div className="wo-field">
        <label htmlFor="wo-permit-notes">특이사항 (선택)</label>
        <textarea
          id="wo-permit-notes"
          rows={2}
          maxLength={4000}
          value={value.notes}
          onChange={(e) => set("notes", e.target.value)}
        />
      </div>
      <Segmented
        label="화기작업"
        value={value.hotWork ? "yes" : "no"}
        options={HOT_OPTIONS}
        onChange={(v) => set("hotWork", v === "yes")}
      />
      {value.hotWork && (
        <div className="wo-field">
          <label htmlFor="wo-permit-firewatcher">화재감시자</label>
          <select
            id="wo-permit-firewatcher"
            value={value.fireWatcherId}
            onChange={(e) => set("fireWatcherId", e.target.value)}
          >
            <option value="">구성원 선택</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.display_name}
              </option>
            ))}
          </select>
        </div>
      )}
      <fieldset className="wo-permit-contacts">
        <legend>비상연락처</legend>
        {contacts.map((c, i) => (
          // 한 사람당 한 줄. 라벨을 칸 안에 넣어(FloatField) 390px 에서도 이름·휴대폰이
          // 나란히 선다. "비상연락처" 는 묶음 제목이 말하므로 칸 라벨은 짧게.
          <div key={i} className="wo-contact-row">
            <FloatField
              id={`wo-permit-contact-name-${i}`}
              label={`이름 ${i + 1}`}
              maxLength={100}
              value={c.name}
              onChange={(e) => setContact(i, { name: e.target.value })}
              autoComplete="off"
            />
            <FloatField
              id={`wo-permit-contact-phone-${i}`}
              label={`휴대폰 ${i + 1}`}
              type="tel"
              inputMode="tel"
              maxLength={30}
              value={c.phone}
              onChange={(e) => setContact(i, { phone: e.target.value })}
              autoComplete="off"
            />
            {contacts.length > 1 && (
              <button
                type="button"
                className="icon-button wo-contact-remove"
                aria-label={`비상연락처 ${i + 1} 삭제`}
                onClick={() =>
                  set(
                    "contacts",
                    contacts.filter((_, j) => j !== i),
                  )
                }
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        ))}
        {contacts.length < 10 && (
          <button
            type="button"
            className="text-button"
            onClick={() =>
              set("contacts", [...contacts, { name: "", phone: "" }])
            }
          >
            <Plus size={13} /> 연락처 추가
          </button>
        )}
      </fieldset>
    </div>
  );
}

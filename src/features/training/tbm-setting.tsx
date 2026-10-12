"use client";

import { useState, useTransition } from "react";
import { FloatSelect } from "@/components/ui/float-field";
import { useToast } from "@/components/ui/toast";
import { TBM_MINUTE_OPTIONS } from "./model";
import { setTbmTrainingMinutesAction } from "./actions";

/** TBM 1회를 정기교육 몇 분으로 셀지. 고르면 바로 저장되고 토스트로 알린다. */
export function TbmSetting({ minutes }: { minutes: number }) {
  const [value, setValue] = useState(minutes);
  const [pending, start] = useTransition();
  const { show, toast } = useToast();
  return (
    <>
      <FloatSelect
        id="tbm-training-minutes"
        label="TBM 산입"
        name="tbm"
        value={value}
        disabled={pending}
        onChange={(e) => {
          const next = Number(e.target.value);
          setValue(next);
          start(async () => {
            const result = await setTbmTrainingMinutesAction(next);
            show(result.error ?? "저장했습니다.");
          });
        }}
      >
        {TBM_MINUTE_OPTIONS.map((m) => (
          <option key={m} value={m}>
            {m === 0 ? "산입 안 함" : `TBM 1회 = ${m}분`}
          </option>
        ))}
      </FloatSelect>
      {toast}
    </>
  );
}

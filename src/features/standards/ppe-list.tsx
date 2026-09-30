import { ShieldCheck } from "lucide-react";
import { ppeLabel } from "./ppe";

/** 보호구 칩 한 줄 (읽기). 표준서 상세·지시서 작업 정보·TBM 머리·출력물. */
export function PpeList({ ppe }: { ppe: string[] }) {
  if (!ppe.length) return null;
  return (
    <ul className="ppe-list" role="list" aria-label="필요 보호구">
      {ppe.map((k) => (
        <li key={k}>
          <ShieldCheck size={12} /> {ppeLabel(k)}
        </li>
      ))}
    </ul>
  );
}

/** 주의사항 띠 (읽기). 없으면 안 그린다. */
export function CautionBand({ caution }: { caution: string }) {
  if (!caution.trim()) return null;
  return (
    <div className="std-caution-band" role="note">
      <strong>주의사항</strong>
      <p>{caution}</p>
    </div>
  );
}

import { PublicHeader } from "@/features/auth/public-header";
import { CheckView } from "@/features/recognition-check/check-view";

export const metadata = {
  title: "위험성평가 인정 준비도 진단 · 심플안전",
  description:
    "25문항으로 우리 회사의 위험성평가 인정 준비도를 바로 확인하고, 부족한 항목은 심플안전으로 채웁니다.",
};

export default function RecognitionCheckPage() {
  return (
    <div className="public-shell">
      <PublicHeader />
      <main className="public-main">
        <div className="public-container public-container--narrow">
          <CheckView />
        </div>
      </main>
    </div>
  );
}

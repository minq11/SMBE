import { PublicHeader } from "@/features/auth/public-header";
import { CheckView } from "@/features/recognition-check/check-view";

export const metadata = {
  title: "위험성평가 인정 준비도 진단 · 심플안전",
  description:
    "업종·규모와 짧은 문답으로 위험성평가 인정 신청대상과 준비 상태를 확인하고, 부족한 항목을 심플안전으로 바로 이어갈 수 있습니다.",
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

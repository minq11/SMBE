import { PublicHeader } from "@/features/auth/public-header";
import { GuideDetailView } from "@/features/guide/guide-detail-view";

export const metadata = {
  title: "중대재해처벌법 · 안전법 가이드 · 심플안전",
  description:
    "중대재해처벌법의 적용 대상·의무·기록·지금 시작할 일을 인원 규모별로 안내합니다.",
};

export default function SeriousAccidentsPage() {
  return (
    <div className="public-shell">
      <PublicHeader />
      <main className="public-main">
        <div className="public-container">
          <GuideDetailView topic="serious-accidents" />
        </div>
      </main>
    </div>
  );
}

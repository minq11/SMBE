import { PublicHeader } from "@/features/auth/public-header";
import { GuideIndexView } from "@/features/guide/guide-index-view";

export const metadata = {
  title: "안전법 가이드 · SMBE",
  description:
    "중대재해처벌법·산업안전보건법이 우리 회사에 어떻게 적용되는지 인원 규모별로 안내합니다.",
};

export default function GuidePage() {
  return (
    <div className="public-shell">
      <PublicHeader />
      <main className="public-main">
        <div className="public-container">
          <GuideIndexView />
        </div>
      </main>
    </div>
  );
}

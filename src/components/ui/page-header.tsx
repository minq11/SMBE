import { ReactNode } from "react";
import { BackButton } from "@/components/shell/back-button";

/**
 * 메뉴 페이지의 공통 머리말. 뒤로가기 버튼은 상단바가 아니라 제목 왼쪽에 둔다
 * (상단바는 좁은 화면에서 이미 꽉 찬다). 뒤로 갈 곳이 없는 화면은 back={false}.
 */
export function PageHeader({
  title,
  description,
  meta,
  actions,
  back = true,
}: {
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  back?: boolean;
}) {
  return (
    <header className="page-header">
      <div className="page-header-copy">
        {back && <BackButton />}
        <div className="page-header-text">
          <h1>{title}</h1>
          {description && <p className="page-header-lead">{description}</p>}
        </div>
      </div>
      {(meta || actions) && (
        <div className="page-header-side">
          {meta && <div className="page-header-meta">{meta}</div>}
          {actions && <div className="page-header-actions">{actions}</div>}
        </div>
      )}
    </header>
  );
}

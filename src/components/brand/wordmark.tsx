import { AppIcon } from "./app-icon";

/**
 * 심플안전 워드마크 — 심볼 + 글자. 사이드바와 좁은 화면 상단바가 같이 쓴다.
 * 예전 심플안전 로고 원본(public/brand/smbe-original.png)은 그대로 보관한다.
 */
export function BrandWordmark({
  className,
  iconSize = 24,
}: {
  className?: string;
  iconSize?: number;
}) {
  return (
    <span
      className={`wordmark${className ? " " + className : ""}`}
      role="img"
      aria-label="심플안전 로고"
    >
      <AppIcon size={iconSize} />
      <span className="wordmark-text" aria-hidden="true">
        심플안전
      </span>
    </span>
  );
}

import { AppIcon } from "./app-icon";

export function LoadingLogo({
  size = 64,
  fullscreen = true,
}: {
  size?: number;
  fullscreen?: boolean;
}) {
  return (
    <div
      className={`loading-logo${fullscreen ? " loading-logo--fullscreen" : ""}`}
      role="status"
      aria-live="polite"
      aria-label="로딩 중"
    >
      <div className="loading-logo-mark">
        <AppIcon size={size} />
      </div>
    </div>
  );
}

/* eslint-disable @next/next/no-img-element */
export function AppIcon({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <img
      src="/brand/logo.png"
      alt="SMBE"
      width={size}
      height={size}
      className={className}
      style={{ display: "block" }}
    />
  );
}

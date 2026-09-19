import { HTMLAttributes } from "react";

export function Panel({
  padded = true,
  className,
  ...rest
}: HTMLAttributes<HTMLElement> & { padded?: boolean }) {
  const merged = [
    "panel",
    padded ? "panel--padded" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return <section {...rest} className={merged} />;
}

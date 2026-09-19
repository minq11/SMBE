import { ReactNode } from "react";

export function SectionHeading({
  title,
  count,
  meta,
  action,
}: {
  title: ReactNode;
  count?: number;
  meta?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <h2>
        {title}
        {typeof count === "number" && <span className="count">{count}</span>}
      </h2>
      {action ? (
        <div className="section-heading-action">{action}</div>
      ) : meta ? (
        <span className="section-heading-meta">{meta}</span>
      ) : null}
    </div>
  );
}

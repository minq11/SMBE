import { AppShell } from "@/components/shell/app-shell";
import { tierOf } from "@/components/shell/tier";
import { isCurrentUserOperator } from "@/server/operator";
import type { CurrentSession } from "@/server/session";
import { KIND_BY_SLUG, KIND_LABEL, type BoardKindSlug } from "./model";

/** 통합자료실 화면의 틀. 이동 경로: 통합자료실 › 공지사항/자료실 › (글 제목). */
export async function BoardShell({
  session,
  kind,
  title,
  children,
}: {
  session: CurrentSession;
  kind: BoardKindSlug;
  title?: string;
  children: React.ReactNode;
}) {
  const label = KIND_LABEL[KIND_BY_SLUG[kind]];
  return (
    <AppShell
      active={kind}
      companyName={session.membership?.company_name}
      tier={tierOf(session.membership)}
      userName={session.user.displayName ?? undefined}
      isAuthenticated
      isOperator={await isCurrentUserOperator()}
      breadcrumb={[
        { label: "통합자료실", href: "/board/notices" },
        title ? { label, href: "/board/" + kind } : { label },
        ...(title ? [{ label: title }] : []),
      ]}
    >
      {children}
    </AppShell>
  );
}

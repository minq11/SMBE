"use client";
import { useLinkStatus } from "next/link";
import { Loader2 } from "lucide-react";

/**
 * 링크를 누른 뒤 화면이 바뀌기 전까지의 공백을 메운다.
 *
 * App Router 는 서버 컴포넌트를 받아 와야 화면을 바꾸므로, 누르고 나서 응답이
 * 올 때까지 아무 일도 일어나지 않는다. 화면 전체를 로딩으로 덮는 `loading.tsx`
 * 는 진입하는 세그먼트에 파일이 있을 때만 뜨고, 없으면 정말 아무 표시가 없다.
 * 그래서 **누른 그 버튼에** 표시를 붙인다. 어디를 눌렀는지 사용자가 이미 알고
 * 있으므로, 그 자리에서 도는 것이 화면을 통째로 덮는 것보다 덜 거슬린다.
 *
 * `<Link>` 의 자손에서만 동작한다 (useLinkStatus 규칙).
 */
export function NavSpinner() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <Loader2 className="spin nav-spinner" size={14} aria-hidden="true" />;
}

"use client";
import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";

/**
 * 페이지 제목 왼쪽에 붙는 뒤로가기 버튼 (PageHeader 안에서 쓰인다).
 * 히스토리가 있으면 브라우저 back, 없으면(딥링크 콜드 로딩) 경로에서 마지막
 * 세그먼트를 제거한 상위 경로로 이동. 최상위(hideOn 목록) 에선 렌더 안 함.
 *
 * 이동은 서버 응답을 기다리므로 누르고 나서 화면이 한동안 그대로다.
 * useTransition 으로 그 사이를 표시한다 — 누른 자리에서 도는 것이 화면을
 * 통째로 덮는 것보다 덜 거슬린다.
 */
export function BackButton({ hideOn = ["/"] }: { hideOn?: string[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, start] = useTransition();
  if (hideOn.includes(pathname)) return null;

  const goBack = () =>
    start(() => {
      if (typeof window !== "undefined" && window.history.length > 1) {
        router.back();
        return;
      }
      const segments = pathname.split("/").filter(Boolean);
      segments.pop();
      router.push(segments.length ? "/" + segments.join("/") : "/");
    });

  return (
    <button
      type="button"
      className="icon-button back-button"
      aria-label="뒤로 가기"
      aria-busy={pending}
      disabled={pending}
      onClick={goBack}
    >
      {pending ? (
        <Loader2 size={19} className="spin" />
      ) : (
        <ArrowLeft size={19} />
      )}
    </button>
  );
}

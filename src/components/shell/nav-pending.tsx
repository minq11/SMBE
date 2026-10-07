"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { LoadingLogo } from "@/components/brand/loading-logo";

/**
 * 이동 중 로고 — loading.tsx 가 못 잡는 이동용.
 *
 * loading.tsx 는 세그먼트가 바뀔 때만 뜬다. 같은 화면에서 쿼리만 바뀌는 이동
 * (회차 목록에서 회차 열기 `?session=`, TBM 확인 `?type=TBM`, 조회 폼)은 아무 표시
 * 없이 기다리게 했다 (사장님 2026-10-07: "점검 기록 누르면 로딩이 안 생기고 대기").
 * 그래서 같은 사이트 안으로 가는 링크·GET 폼을 누르는 순간 로고를 띄우고, 주소
 * (경로+쿼리)가 바뀌면 내린다. 혹시 주소가 안 바뀌면 10초 뒤 내린다.
 */
function Pending() {
  const pathname = usePathname();
  const search = useSearchParams();
  const key = pathname + "?" + search.toString();
  const [pending, setPending] = useState(false);
  // 주소가 바뀌면 그리는 중에 바로 내린다 (effect 에서 setState 하지 않는다).
  const [seen, setSeen] = useState(key);
  if (seen !== key) {
    setSeen(key);
    setPending(false);
  }
  // popstate 비교용. 주소가 바뀌어 다시 그려질 때 브라우저 주소를 그대로 적어 둔다
  // (useSearchParams 의 직렬화와 location.search 의 글자가 다를 수 있다).
  const keyRef = useRef("");
  useEffect(() => {
    keyRef.current = location.pathname + location.search;
  }, [key]);

  useEffect(() => {
    const sameSite = (href: string) => {
      const url = new URL(href, location.href);
      if (url.origin !== location.origin) return null;
      if (url.pathname + url.search === location.pathname + location.search)
        return null; // 같은 곳이거나 해시만 — 이동이 없다
      return url;
    };
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement)) return;
      if ((a.target && a.target !== "_self") || a.hasAttribute("download"))
        return;
      if (sameSite(a.href)) setPending(true);
    };
    const onSubmit = (e: SubmitEvent) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement)) return;
      // React 가 처리하는 액션 폼은 기본 동작을 막는다(이 리스너는 그 뒤에 돈다).
      // 브라우저가 직접 옮기는 GET 조회 폼만 남는다.
      if (e.defaultPrevented) return;
      if (form.method.toLowerCase() !== "get") return;
      if (form.target && form.target !== "_self") return;
      setPending(true);
    };
    // 해시 이동(#구간)도 popstate 를 울린다. 경로+쿼리가 그대로면 이동이 아니다.
    const onPop = () => {
      if (location.pathname + location.search === keyRef.current) return;
      setPending(true);
    };
    document.addEventListener("click", onClick);
    document.addEventListener("submit", onSubmit);
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("submit", onSubmit);
      window.removeEventListener("popstate", onPop);
    };
  }, []);

  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setPending(false), 10000);
    return () => clearTimeout(t);
  }, [pending]);

  // loading.tsx 는 본문 자리를 통째로 차지하지만, 여기는 화면 위에 덮는다.
  return pending ? (
    <div className="nav-pending">
      <LoadingLogo />
    </div>
  ) : null;
}

export function NavPending() {
  // useSearchParams 는 정적 화면에서 Suspense 경계를 요구한다.
  return (
    <Suspense fallback={null}>
      <Pending />
    </Suspense>
  );
}

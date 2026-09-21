"use client";

import { useEffect } from "react";

/**
 * /sw.js 등록. Android PWA 설치(WebAPK) 요건이자 정적 자산 캐시의 진입점입니다.
 * 개발 중에는 캐시가 변경 확인을 방해하므로 production 에서만 등록합니다.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      void navigator.serviceWorker.register("/sw.js").catch(() => {
        // 등록 실패는 기능 저하일 뿐이므로 화면을 막지 않습니다.
      });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}

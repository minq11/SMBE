"use client";
import { useEffect, useState } from "react";
import { Share, MoreVertical, X } from "lucide-react";

const KEY = "smbe.add-to-home.dismissed";

/**
 * 홈 화면에 추가 안내 (작업자 화면).
 *
 * 작업자는 QR 이나 링크로 들어온다. 다음에 다시 열 때 QR 을 찾게 하지 않으려면
 * 홈 화면에 두는 게 제일 빠른데, iOS 는 설치 안내를 자동으로 띄우지 않는다.
 * 브라우저별로 어디를 누르면 되는지 한 번 알려 주고, 닫으면 다시 안 띄운다.
 * 이미 홈 화면에서 연 것(standalone)이면 아무것도 안 보인다.
 */
export function AddToHomeHint() {
  const [platform, setPlatform] = useState<"ios" | "android" | null>(null);
  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === "1") return;
    } catch {
      /* 저장소가 막혀 있으면 매번 보인다 — 닫으면 이번 화면에서는 사라진다 */
    }
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator &&
        (navigator as { standalone?: boolean }).standalone === true);
    if (standalone) return;
    const ua = navigator.userAgent;
    const next = /iPhone|iPad|iPod/.test(ua)
      ? "ios"
      : /Android/.test(ua)
        ? "android"
        : null;
    if (!next) return;
    const timer = setTimeout(() => setPlatform(next), 0);
    return () => clearTimeout(timer);
  }, []);
  if (!platform) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setPlatform(null);
  };
  return (
    <aside className="a2hs" role="note">
      <p>
        <strong>홈 화면에 두면</strong> 다음부터 QR 없이 바로 열립니다.{" "}
        {platform === "ios" ? (
          <>
            아래 <Share size={13} aria-label="공유" /> 공유 버튼을 누르고{" "}
            <b>홈 화면에 추가</b>를 고르세요.
          </>
        ) : (
          <>
            오른쪽 위 <MoreVertical size={13} aria-label="메뉴" /> 메뉴에서{" "}
            <b>홈 화면에 추가</b>(또는 앱 설치)를 고르세요.
          </>
        )}
      </p>
      <button type="button" aria-label="안내 닫기" onClick={dismiss}>
        <X size={16} />
      </button>
    </aside>
  );
}

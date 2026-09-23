"use client";

import { useEffect } from "react";

/**
 * 앱 틀의 높이를 실제로 보이는 영역(visualViewport)에 맞춘다.
 *
 * 좁은 화면의 앱 틀은 문서가 아니라 본문(main)만 스크롤되고, 그 높이는
 * `100dvh` 다. 그런데 iOS(특히 홈 화면에 추가한 앱)는 키보드가 올라올 때 화면을
 * 줄였다가 키보드가 내려가도 바로 되돌리지 않는 일이 있다. 그러면 본문의
 * 스크롤 영역이 화면보다 짧아져 아래에 붙어야 할 단추 띠가 화면 중간에 뜨고,
 * 그 밑으로 지나간 내용이 비친다.
 *
 * visualViewport 는 키보드가 열리고 닫힐 때마다 resize 를 확실히 보내므로, 그
 * 높이를 `--app-h` 로 적어 두고 틀이 그 값을 쓴다 (globals.css 앱 틀). 키보드가
 * 열린 동안에는 본문이 키보드 위까지만 차지해 아래 단추 띠가 키보드 바로 위에
 * 온다 — 그것도 원하던 모습이다. 키보드가 닫히면 iOS 가 문서를 밀어 둔 채 남기는
 * 일이 있어 맨 위로 되돌린다.
 */
export function ViewportHeight() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    let raf = 0;
    const apply = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        root.style.setProperty("--app-h", Math.round(vv.height) + "px");
        // 키보드가 닫힌 뒤 문서가 밀려 있으면 되돌린다. 열린 동안(offsetTop > 0)은
        // iOS 가 입력칸을 보이게 하려고 민 것이니 건드리지 않는다.
        if (vv.offsetTop === 0 && window.scrollY > 0) window.scrollTo(0, 0);
      });
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    // 입력칸에서 나갈 때 키보드가 닫힌다. resize 가 늦게 오는 기기를 위해 한 번 더.
    const onBlur = () => setTimeout(apply, 350);
    document.addEventListener("focusout", onBlur);
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      document.removeEventListener("focusout", onBlur);
      root.style.removeProperty("--app-h");
    };
  }, []);
  return null;
}

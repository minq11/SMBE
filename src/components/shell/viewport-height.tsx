"use client";

import { useEffect } from "react";
import { viewportFrame } from "./viewport-frame";

/**
 * 앱 틀을 실제로 보이는 영역(visualViewport)에 맞춘다.
 *
 * 좁은 화면의 앱 틀은 문서가 아니라 본문(main)만 스크롤되고, 그 높이는
 * `100dvh` 다. 키보드가 올라오면 보이는 영역이 줄고(iOS 는 아래로 밀기까지
 * 한다), 내려가도 바로 되돌리지 않는 기기가 있다. visualViewport 는 그때마다
 * resize·scroll 을 확실히 보내므로, 그 높이를 `--app-h` 로, 밀린 양을 틀의
 * translate 로 적어 틀이 늘 보이는 영역과 겹치게 한다 (globals.css 앱 틀).
 *
 * 키보드가 열린 동안은 `html[data-keyboard="open"]` 이다. 아래 단추 띠는 그때
 * 고정을 풀어 내용 끝으로 내려간다 — 남은 화면이 절반이라 띠가 자리를 먹고,
 * 타자 치는 동안 저장 단추는 쓸 일이 없다 (헌법 1-6).
 */
export function ViewportHeight() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    let raf = 0;
    let maxHeight = 0;
    let wasKeyboard = false;
    const apply = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        maxHeight = Math.max(maxHeight, vv.height);
        const frame = viewportFrame({
          height: vv.height,
          offsetTop: vv.offsetTop,
          maxHeight,
        });
        root.style.setProperty("--app-h", frame.height + "px");
        // 틀에 갇힌 화면(좁은 화면의 앱·로그인, globals.css 앱 틀)만 옮기고
        // 되돌린다. 공개 화면·넓은 화면은 문서가 스크롤되는데, 휴대폰에서 내리면
        // 주소창이 접히며 resize 가 오고 그때마다 맨 위로 끌어올려 버렸다.
        const framed = getComputedStyle(document.body).overflowY === "hidden";
        // translate 가 none 이 아니면 fixed 자손의 기준이 body 가 된다. 밀렸을
        // 때만 켠다 — body 가 보이는 영역과 같으니 그때는 기준이 같다.
        document.body.style.translate =
          framed && frame.top ? `0 ${frame.top}px` : "";
        if (frame.keyboard) root.dataset.keyboard = "open";
        else delete root.dataset.keyboard;
        // 키보드가 닫힌 뒤 문서가 밀려 있으면 되돌린다.
        if (framed && !frame.top && window.scrollY > 0) window.scrollTo(0, 0);
        // 틀이 줄어든 뒤 입력칸이 본문 밖에 남을 수 있다. 본문만 조금 민다.
        if (frame.keyboard && !wasKeyboard) {
          const el = document.activeElement;
          if (el instanceof HTMLElement && el.closest("#main"))
            el.scrollIntoView({ block: "nearest" });
        }
        wasKeyboard = frame.keyboard;
      });
    };
    // 방향이 바뀌면 "가장 큰 높이" 는 다시 잰다.
    const onOrientation = () => {
      maxHeight = 0;
      apply();
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    window.addEventListener("orientationchange", onOrientation);
    // 입력칸에서 나갈 때 키보드가 닫힌다. resize 가 늦게 오는 기기를 위해 한 번 더.
    const onBlur = () => setTimeout(apply, 350);
    document.addEventListener("focusout", onBlur);
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      window.removeEventListener("orientationchange", onOrientation);
      document.removeEventListener("focusout", onBlur);
      root.style.removeProperty("--app-h");
      document.body.style.translate = "";
      delete root.dataset.keyboard;
    };
  }, []);
  return null;
}

"use client";

import { useEffect } from "react";
import "aos/dist/aos.css";

/**
 * 스크롤 등장 효과(AOS). 모양은 AOS 의 CSS(`data-aos` 속성 + `.aos-animate`)를 그대로
 * 쓰고, 켜는 것만 IntersectionObserver 로 한다 — 좁은 화면의 앱 틀은 문서가 아니라
 * 본문(main)만 스크롤되어 AOS 의 window 스크롤 감시가 아무것도 못 본다.
 * 움직임을 줄이라는 기기(prefers-reduced-motion)에서는 바로 다 보인다.
 */
export function ScrollReveal() {
  useEffect(() => {
    const targets = Array.from(
      document.querySelectorAll<HTMLElement>("[data-aos]"),
    );
    if (targets.length === 0) return;
    const show = (el: Element) => el.classList.add("aos-animate");
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !("IntersectionObserver" in window)
    ) {
      targets.forEach(show);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          show(entry.target);
          io.unobserve(entry.target);
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}

/** 한 요소에 붙이는 등장 속성. 방향·지연(ms, 50 단위)만 고른다. */
export function reveal(
  kind: "fade-up" | "fade-right" | "fade-left" | "zoom-in",
  delay = 0,
) {
  return {
    "data-aos": kind,
    "data-aos-delay": String(delay),
    "data-aos-duration": "700",
    "data-aos-easing": "ease-out-cubic",
  } as const;
}

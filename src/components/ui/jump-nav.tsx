"use client";

import { useEffect, useRef, useState } from "react";

export type JumpItem = { id: string; label: string };

/**
 * 긴 폼의 구간 칩. 누르면 그 구간으로 내려가고, 내려가는 동안 지나는 구간의 칩이
 * 켜진다. 좁은 화면에서는 위에 붙는다 (globals.css .jump-nav).
 *
 * 단계 마법사 대신 쓴다. 뒤 구간이 숨지 않아 "위험요인 몇 개였지" 를 확인하러
 * 이전을 누를 일이 없고, 아래 고정 바에는 저장·발급만 남는다.
 *
 * 현재 칩은 띠만 옆으로 민다 — scrollIntoView 는 본문까지 밀어 버린다 (헌법 1-7).
 */
export function JumpNav({
  items,
  label = "구간 이동",
}: {
  items: JumpItem[];
  label?: string;
}) {
  const navRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState<string>(items[0]?.id ?? "");
  const ids = items.map((i) => i.id).join("|");

  useEffect(() => {
    const sections = ids
      .split("|")
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (sections.length === 0) return;
    // 좁은 화면에서는 본문(#main)이, 넓은 화면에서는 문서가 스크롤 영역이다.
    const main = document.getElementById("main");
    let frame = 0;
    const update = () => {
      frame = 0;
      // 칩 띠 밑 선. 구간이 앵커로 내려앉는 자리(scroll-margin 8px)보다 넉넉히.
      const nav = navRef.current;
      const line = (nav?.getBoundingClientRect().bottom ?? 0) + 40;
      let current = sections[0];
      for (const s of sections) {
        if (s.getBoundingClientRect().top <= line) current = s;
      }
      // 바닥까지 내려갔으면 마지막 구간. 짧은 마지막 구간은 선에 닿지 못한다.
      const scroller =
        main && main.scrollHeight > main.clientHeight ? main : null;
      const atBottom = scroller
        ? scroller.scrollTop + scroller.clientHeight >=
          scroller.scrollHeight - 2
        : window.innerHeight + window.scrollY >=
          document.documentElement.scrollHeight - 2;
      if (atBottom) current = sections[sections.length - 1];
      setActive(current.id);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    main?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      main?.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [ids]);

  useEffect(() => {
    const nav = navRef.current;
    const chip = nav?.querySelector<HTMLElement>("[aria-current]");
    if (!nav || !chip) return;
    const left = chip.offsetLeft - 16;
    const right = chip.offsetLeft + chip.offsetWidth + 16;
    if (left < nav.scrollLeft) nav.scrollTo({ left });
    else if (right > nav.scrollLeft + nav.clientWidth)
      nav.scrollTo({ left: right - nav.clientWidth });
  }, [active]);

  return (
    <nav className="jump-nav" aria-label={label} ref={navRef}>
      {items.map((item) => (
        <a
          key={item.id}
          href={"#" + item.id}
          aria-current={active === item.id ? "location" : undefined}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}

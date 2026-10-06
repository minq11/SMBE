"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/**
 * 휘발성 안내(토스트). 막힌 행위에 그 자리에서 답할 때 쓴다 — 잠긴 회차를 누르면
 * "유료 요금제에서". 화면에 미리 써 두면 안 막힌 사람까지 읽어야 하므로, 눌렀을
 * 때만 몇 초 떠 있다 사라진다 (헌법 5장). 누르면 바로 닫힌다.
 */
export function useToast(ms = 4500, portal = false) {
  const [msg, setMsg] = useState<ReactNode>(null);
  // 표의 줄(tr) 처럼 div 를 품을 수 없는 자리에서는 body 끝에 그린다. 서버에서는
  // document 가 없으므로 마운트 뒤에만 (서버 스냅샷 false, 브라우저 true).
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const show = useCallback(
    (node: ReactNode) => {
      clear();
      setMsg(node);
      timer.current = setTimeout(() => setMsg(null), ms);
    },
    [ms],
  );
  useEffect(() => clear, []);
  const el = (
    // 늘 그려 두고 글만 바꾼다 — 생겼다 사라지는 요소는 읽어 주지 않는다.
    <div
      className="toast"
      role="status"
      aria-live="polite"
      data-open={msg ? "true" : "false"}
      onClick={() => {
        clear();
        setMsg(null);
      }}
    >
      {msg}
    </div>
  );
  const toast = portal ? (mounted ? createPortal(el, document.body) : null) : el;
  return { show, toast };
}

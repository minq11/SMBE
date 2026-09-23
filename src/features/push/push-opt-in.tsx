"use client";

import { useEffect, useState } from "react";
import { BellRing, X } from "lucide-react";
import {
  pushSetupAction,
  removePushSubscriptionAction,
  savePushSubscriptionAction,
} from "./actions";

type State =
  | { kind: "idle" }
  | { kind: "unsupported"; reason: string }
  | { kind: "ready" }
  | { kind: "subscribed" }
  | { kind: "busy" }
  | { kind: "error"; message: string };

const DISMISS_KEY = "smbe.push-hint-dismissed";

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  // 개발 모드는 SW 를 자동 등록하지 않는다. 여기서는 직접 등록한다.
  const existing = await navigator.serviceWorker.getRegistration();
  return existing ?? navigator.serviceWorker.register("/sw.js");
}

/**
 * 공지·자료 푸시 알림 켜기. 유료 회사의 구성원에게만 보인다 (부르는 쪽이 가른다).
 *
 * - 브라우저가 푸시를 못 하면(iOS 의 홈 화면 미추가 상태 등) 안내만 한다.
 * - 이미 구독한 기기에서는 "알림 켜짐" 만 작게 보이고, 끌 수 있다.
 * - 안내를 닫으면 이 기기에서는 다시 띄우지 않는다 (마이페이지에서 다시 켤 수 있다).
 */
export function PushOptIn({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!compact && localStorage.getItem(DISMISS_KEY)) return;
      } catch {
        /* ignore */
      }
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
        if (!cancelled) {
          setState({
            kind: "unsupported",
            reason: ios
              ? "iPhone 은 홈 화면에 추가한 뒤 그 아이콘으로 열어야 알림을 켤 수 있습니다."
              : "이 브라우저는 푸시 알림을 지원하지 않습니다.",
          });
          setHidden(false);
        }
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (cancelled) return;
      if (sub) {
        // 서버가 모르는 구독(재설치 등)이면 다시 알려 준다.
        void savePushSubscriptionAction(sub.toJSON());
        setState({ kind: "subscribed" });
      } else if (Notification.permission === "denied") {
        setState({
          kind: "unsupported",
          reason:
            "브라우저에서 알림이 차단되어 있습니다. 사이트 설정에서 허용하세요.",
        });
      } else setState({ kind: "ready" });
      setHidden(false);
    })().catch(() => {
      /* 알림은 거들 뿐이다 */
    });
    return () => {
      cancelled = true;
    };
  }, [compact]);

  const subscribe = async () => {
    setState({ kind: "busy" });
    try {
      const setup = await pushSetupAction();
      if (!setup.available) {
        setState({ kind: "unsupported", reason: setup.reason });
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState({
          kind: "unsupported",
          reason: "알림을 허용하지 않아 켜지 못했습니다.",
        });
        return;
      }
      const reg = await registration();
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToBytes(setup.publicKey),
      });
      const saved = await savePushSubscriptionAction(sub.toJSON());
      if (!saved.ok) {
        await sub.unsubscribe().catch(() => {});
        setState({ kind: "error", message: saved.error });
        return;
      }
      setState({ kind: "subscribed" });
    } catch {
      setState({
        kind: "error",
        message: "알림을 켜지 못했습니다. 잠시 후 다시 시도하세요.",
      });
    }
  };

  const unsubscribe = async () => {
    setState({ kind: "busy" });
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscriptionAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setState({ kind: "ready" });
    } catch {
      setState({ kind: "error", message: "알림을 끄지 못했습니다." });
    }
  };

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setHidden(true);
  };

  if (hidden || state.kind === "idle") return null;
  if (!compact && state.kind === "subscribed") return null;

  return (
    <div
      className={`push-optin${compact ? " push-optin--compact" : ""}`}
      role="region"
      aria-label="푸시 알림"
    >
      <span className="push-optin-icon" aria-hidden="true">
        <BellRing size={18} />
      </span>
      <div className="push-optin-copy">
        <strong>공지·자료 알림</strong>
        <span>
          {state.kind === "subscribed"
            ? "이 기기에서 알림이 켜져 있습니다."
            : state.kind === "unsupported"
              ? state.reason
              : state.kind === "error"
                ? state.message
                : "새 공지와 자료가 올라오면 이 기기로 바로 알립니다."}
        </span>
      </div>
      {state.kind === "subscribed" ? (
        <button type="button" className="btn-secondary" onClick={unsubscribe}>
          알림 끄기
        </button>
      ) : state.kind === "ready" || state.kind === "error" ? (
        <button type="button" className="btn-primary" onClick={subscribe}>
          알림 켜기
        </button>
      ) : state.kind === "busy" ? (
        <button type="button" className="btn-primary" disabled>
          잠시만요…
        </button>
      ) : null}
      {!compact && (
        <button
          type="button"
          className="push-optin-close"
          aria-label="닫기"
          onClick={dismiss}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}

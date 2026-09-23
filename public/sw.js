// SMBE service worker
// 목적: (1) Android PWA 설치(WebAPK) 요건 충족 (2) 정적 자산 재다운로드 제거
//        (3) 오프라인 안내 화면
//
// 캐시 원칙 — 회사별 데이터가 섞이면 안 되므로 보수적으로 동작합니다.
//   - /api/*        : 가로채지 않음 (세션·업무 데이터)
//   - HTML 화면     : 항상 네트워크 우선, 실패했을 때만 오프라인 안내
//   - /_next/static : 파일명에 빌드 해시가 박혀 있어 내용이 바뀌면 경로도 바뀜 → 영구 캐시
//
// 캐시를 비우려면 VERSION 을 올립니다.
const VERSION = "v2";
const CACHE = `smbe-static-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icon-192.png"];

// 빌드 해시가 붙어 불변인 경로만 cache-first 대상입니다.
const IMMUTABLE_PREFIXES = ["/_next/static/", "/brand/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;

  const response = await fetch(request);
  if (response.ok) {
    const copy = response.clone();
    const cache = await caches.open(CACHE);
    await cache.put(request, copy);
  }
  return response;
}

async function networkFirst(request) {
  try {
    return await fetch(request);
  } catch {
    const offline = await caches.match(OFFLINE_URL);
    return (
      offline ??
      new Response("오프라인 상태입니다.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    );
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // 다른 출처(S3 presigned URL, OAuth 제공자 등)는 건드리지 않습니다.
  if (url.origin !== self.location.origin) return;
  // 인증·업무 API 응답은 절대 캐시하지 않습니다.
  if (url.pathname.startsWith("/api/")) return;

  if (IMMUTABLE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
  }
});

// 웹 푸시 (유료 회사의 공지·자료 발행). 본문은 서버가 JSON 으로 보낸다
// (src/server/push.ts). 누르면 그 글을 연다 — 열린 창이 있으면 거기로.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "심플안전", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag,
      renotify: Boolean(data.tag),
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if ("navigate" in client && "focus" in client) {
            return client.navigate(url).then((c) => (c || client).focus());
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});

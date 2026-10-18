import { routeRequest } from "./sw-routing";

declare const self: ServiceWorkerGlobalScope;

const CACHE = `actspace-${__BUILD_ID__}`;

self.addEventListener("install", event => {
  // 不 skipWaiting：新版本等用户在 UpdateToast 里确认后再接管。
  event.waitUntil(caches.open(CACHE).then(cache => cache.add("/")));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("message", event => {
  if ((event.data as { type?: string } | null)?.type === "skip-waiting") void self.skipWaiting();
});

self.addEventListener("fetch", event => {
  const { request } = event;
  const strategy = routeRequest(new URL(request.url), request.mode, request.method, self.location.origin);
  if (strategy === "network-first") {
    event.respondWith(
      fetch(request).then(
        response => {
          if (response.ok) { const copy = response.clone(); void caches.open(CACHE).then(cache => cache.put("/", copy)); }
          return response;
        },
        async () => (await caches.match("/")) ?? Response.error(),
      ),
    );
  } else if (strategy === "cache-first") {
    event.respondWith(
      caches.match(request).then(
        hit => hit ?? fetch(request).then(response => {
          if (response.ok) { const copy = response.clone(); void caches.open(CACHE).then(cache => cache.put(request, copy)); }
          return response;
        }),
      ),
    );
  }
});

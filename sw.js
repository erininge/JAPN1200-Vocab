/* 
  Kat’s Vocab Garden 🌸 — JAPN1200
  Changelog:
  - V4.3: update version + cache
*/
const CACHE_NAME = "japn1200-class-vocab-cache-v4.3";
const CORE_ASSETS = [
  "./",
  "./index.html?f=v4.3",
  "./styles.css?f=v4.3",
  "./app.js?f=v4.3",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./lessons/index.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => k !== CACHE_NAME ? caches.delete(k) : Promise.resolve()));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  const isLesson = url.pathname.includes("/lessons/") && url.pathname.endsWith(".json");
  const isAudio = url.pathname.includes("/audio/") && /\.(wav|mp3|m4a|ogg)$/.test(url.pathname);

  if (isLesson || isAudio) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        const cached = await caches.match(req);
        return cached || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;
    const fresh = await fetch(req);
    const cache = await caches.open(CACHE_NAME);
    cache.put(req, fresh.clone());
    return fresh;
  })());
});

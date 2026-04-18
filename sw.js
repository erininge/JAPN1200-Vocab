/*
  Kat’s Vocab Garden 🌸 — JAPN1200
  Changelog:
  - V7.8: remap Chapter 6 vocabulary to lesson mappings from latest syllabus + cache update
  - V7.8: split Chapter 6 into lesson files 13-21 and move legacy Lesson 14 vocab to Lesson 22 + cache update
  - V7.6: complete Chapter 6 lesson mapping (L6-01..L6-13) + add じかん + cache update
  - V7.5: spread Chapter 6 vocabulary across L6-01/L6-02/L6-03/L6-05/L6-07/L6-09/L6-10/L6-11/L6-13 + cache update
  - V7.4: add missing Chapter 4-6 vocabulary entries + cache update
  - V7.3: revamp Chapter 4-6 vocabulary lists + cache update
  - V7.1: reorganize lesson categories into chapter groups + filter updates + cache update
  - V7.0: allow optional Japanese parenthetical text in typed answers + cache update
  - V6.9: fix Adjectives lesson filtering + move duplicate adjective words
  - V6.6: add Lesson 11 vocab + cache update
  - V6.4: add Adjectives lesson + cache update
  - V6.3: add Lesson 9 vocab + cache update
*/
const CACHE_NAME = "japn1200-class-vocab-cache-v7.8";
const CORE_ASSETS = [
  "./",
  "./index.html?f=v7.8",
  "./styles.css?f=v7.8",
  "./app.js?f=v7.8",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/Sakura.mp4",
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

self.addEventListener("message", (event) => {
  if (!event.data?.type) return;
  if (event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  if (event.data.type === "CLEAR_CACHES") {
    event.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    })());
  }
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

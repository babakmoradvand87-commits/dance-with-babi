/* ──────────────────────────────────────────────────────────────
   Dance with Babi — service worker
   Gives the installed app offline play and AUTOMATIC updates:
   pages are network-first (a new deploy is picked up on the next
   launch / reload), everything else is cache-first with a background
   refresh. Bump VERSION on every release so old caches are dropped.
   ────────────────────────────────────────────────────────────── */
"use strict";

const VERSION = "dwb-v13";
const CORE = [
  "/",
  "/index.html",
  "/poster.jpg",
  "/apple-touch-icon.png",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-512-maskable.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;   /* never touch cross-origin traffic */
  if (e.request.method !== "GET") return;

  if (e.request.mode === "navigate") {
    /* network-first: an update to the game is picked up automatically */
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put("/index.html", copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(e.request).then((r) => r || caches.match("/index.html"))
        )
    );
    return;
  }

  /* same-origin assets: cache-first, refresh in the background.
     (the big mp3s may exceed the storage quota on small phones — a
     failed put must never break playback, the network copy still works) */
  e.respondWith(
    caches.match(e.request).then((hit) =>
      hit ||
      fetch(e.request).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
    )
  );
});

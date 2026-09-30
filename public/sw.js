// Network first so updates arrive straight away; the cache is only an offline fallback.
const CACHE = "wird-v2";
const INDEX = new URL("./", self.registration.scope).href;
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
      return r;
    }).catch(() => caches.match(req).then(m => m || (req.mode === "navigate" ? caches.match(INDEX) : undefined)))
  );
});
// Tapping a reminder opens (or focuses) the app.
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(cs => {
    for (const c of cs) { if ("focus" in c) return c.focus(); }
    return self.clients.openWindow ? self.clients.openWindow(INDEX) : undefined;
  }));
});

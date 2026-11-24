/* MyWorld_1.55 : service worker de « Nos vidéos » (scope /my_world/videos/), séparé de celui de My World.
   Toujours le réseau d'abord (la mini-appli est donc à jour à chaque ouverture), la copie gardée sert hors connexion. */
const CACHE = "nos-videos-1";
const SHELL = ["./", "index.html", "app.js", "manifest.webmanifest", "../firebase-config.js", "icons/nv-192.png",
  "../fonts/nunito-latin-400-normal.woff2", "../fonts/nunito-latin-600-normal.woff2", "../fonts/nunito-latin-700-normal.woff2", "../fonts/nunito-latin-800-normal.woff2"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "no-cache" })))).catch(() => {}).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.indexOf("nos-videos-") === 0 && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (/googleapis\.com|firebaseio|identitytoolkit|securetoken|accounts\.google\.com|firebaseapp\.com|script\.google/.test(url.host)) return;
  if (url.host === "www.gstatic.com"){
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); return res; })));
    return;
  }
  if (url.origin !== self.location.origin) return;
  e.respondWith(fetch(req, { cache: "no-cache" }).then((res) => {
    if (res.ok && !url.search){ const cp = res.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === "navigate" ? caches.match("./") : Response.error()))));
});

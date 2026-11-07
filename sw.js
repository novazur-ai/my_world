/* Service worker : garde l'appli disponible sans connexion.
   VERSION est remplacée automatiquement à chaque mise en ligne par .github/workflows/deploy.yml :
   rien à changer à la main. Les téléphones prennent la nouvelle version à la prochaine ouverture. */
const VERSION = "carnet-__BUILD__";
const ASSETS = "carnet-assets-1"; /* images, stickers, polices, SDK : gardés d'une version à l'autre */
const SHELL = [
  "./", "index.html", "app-firebase.js", "firebase-config.js", "manifest.webmanifest",
  "icons/icon-192-v2.png", "icons/icon-512-v2.png",
  "fonts/nunito-latin-400-normal.woff2", "fonts/nunito-latin-600-normal.woff2", "fonts/nunito-latin-700-normal.woff2", "fonts/nunito-latin-800-normal.woff2",
  "fonts/dancing-script-latin-600-normal.woff2", "fonts/dancing-script-latin-700-normal.woff2"
];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== ASSETS).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  /* Google Agenda, Firebase et la connexion Google : jamais en cache (Firebase gère lui-même son mode hors ligne) */
  if (/googleapis\.com|firebaseio|identitytoolkit|securetoken|accounts\.google\.com|firebaseapp\.com/.test(url.host)) return;
  const sameOrigin = url.origin === self.location.origin;
  const isAsset = sameOrigin && /\/(img|stk|fonts|icons)\//.test(url.pathname);
  const isSdk = url.host === "www.gstatic.com";
  if (isAsset || isSdk){
    /* images, polices, SDK Firebase : d'abord le cache */
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { const copy = res.clone(); caches.open(ASSETS).then((c) => c.put(req, copy)); return res; })));
    return;
  }
  if (sameOrigin){
    /* page et code : d'abord le réseau (pour les mises à jour), sinon le cache */
    e.respondWith(fetch(req, { cache: "no-cache" }).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return res; }).catch(() => caches.match(req).then((hit) => hit || caches.match("index.html"))));
  }
});

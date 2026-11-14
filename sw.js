/* Service worker : garde l'appli disponible sans connexion.
   VERSION est remplacée automatiquement à chaque mise en ligne par .github/workflows/deploy.yml :
   rien à changer à la main. Les téléphones prennent la nouvelle version à la prochaine ouverture. */
const VERSION = "carnet-__BUILD__";
const ASSETS = "carnet-assets-1"; /* images, stickers, polices, SDK : gardés d'une version à l'autre */
const SHELL = [
  "./", "index.html", "app-firebase.js", "firebase-config.js", "manifest.webmanifest",
  "icons/icon-192-v6.png", "icons/maskable-512-v6.png", "icons/apple-touch-180-v6.png",
  "lib/jsbarcode.min.js", "lib/qrcode.min.js",
  "fonts/nunito-latin-400-normal.woff2", "fonts/nunito-latin-600-normal.woff2", "fonts/nunito-latin-700-normal.woff2", "fonts/nunito-latin-800-normal.woff2",
  "fonts/dancing-script-latin-600-normal.woff2", "fonts/dancing-script-latin-700-normal.woff2"
];
const SHELL_PATHS = new Set(SHELL.map((u) => new URL(u, self.location).pathname));
/* MyWorld_1.25 : chaque fichier est téléchargé avec ?b=<numéro de version> (GitHub Pages garde les fichiers 10 min en cache :
   sans cela, une version pouvait garder l'ancienne page). La page doit contenir le numéro de cette version, sinon
   l'installation échoue et sera retentée à la prochaine vérification (on ne garde jamais une page périmée). */
const BUILD = VERSION.replace("carnet-", "");
self.addEventListener("install", (e) => { e.waitUntil(caches.open(VERSION).then((c) => Promise.all(SHELL.map((u) => {
  const url = new URL(u, self.location); url.searchParams.set("b", BUILD);
  return fetch(url.href, { cache: "reload" }).then((res) => {
    if (!res.ok) throw new Error("fichier " + u + " : " + res.status);
    if ((u === "./" || u === "index.html") && BUILD.indexOf("__") < 0) return res.clone().text().then((t) => { if (t.indexOf(BUILD) < 0) throw new Error("page pas encore à jour"); return c.put(new Request(u), res); });
    return c.put(new Request(u), res);
  });
}))).then(() => self.skipWaiting())); });
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
  /* MyWorld_1.4 : logos des enseignes (icônes de Google) et bwip-js (codes 2D rares) : gardés pour être affichés hors ligne à la caisse */
  const isExt = (url.host === "www.google.com" && url.pathname.indexOf("/s2/favicons") === 0) || url.host === "cdn.jsdelivr.net";
  if (isAsset || isSdk || isExt){
    /* images, polices, SDK Firebase : d'abord le cache */
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { const copy = res.clone(); caches.open(ASSETS).then((c) => c.put(req, copy)); return res; })));
    return;
  }
  /* MyWorld_1.19 : la page et le code de l'appli viennent directement de la copie de CETTE version (ouverture instantanée,
     tous les fichiers de la même version) ; une mise en ligne change sw.js, le téléphone installe alors la nouvelle copie
     en coulisse et l'utilise à l'ouverture suivante */
  if (sameOrigin && SHELL_PATHS.has(url.pathname)){
    e.respondWith(caches.open(VERSION).then((c) => c.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === "navigate" ? c.match("index.html") : null))).then((hit) => hit || fetch(req)).catch(() => caches.match("index.html")));
    return;
  }
  if (sameOrigin){
    /* autres fichiers : d'abord le réseau, sinon le cache */
    /* une adresse avec paramètres (ex. partage reçu) n'est pas gardée en cache ; hors ligne, on sert la page */
    e.respondWith(fetch(req, { cache: "no-cache" }).then((res) => { if (!url.search){ const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return res; }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match("index.html"))));
  }
});

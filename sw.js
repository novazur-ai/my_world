/* Service worker : garde l'appli disponible sans connexion et la met à jour toute seule (voir MyWorld_1.27 plus bas).
   Rien à changer à la main à chaque version. */
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
/* MyWorld_1.27 : GitHub Pages publie aussi directement la branche main (« pages-build-deployment »), et cette publication
   passe après celle de deploy.yml : en ligne, VERSION reste « carnet-__BUILD__ » d'une version à l'autre. Une version qui
   ne touche pas sw.js n'était donc jamais vue par les téléphones (cause des blocages en 1.21 puis 1.25).
   Désormais le code de l'appli est comparé à celui en ligne à chaque ouverture, quelle que soit la façon dont le site est publié :
   - installation : chaque fichier est téléchargé avec une adresse unique (?b=…), jamais servi depuis un cache ;
   - à chaque ouverture (et quand la page le demande au retour dans l'appli) : index.html, app-firebase.js et
     firebase-config.js sont redemandés au serveur (requête conditionnelle, quasi gratuite s'ils n'ont pas changé) ;
     s'ils ont changé, la copie locale est remplacée d'un coup et la page reçoit « mw-updated » (bouton « Mettre à jour l'app ») ;
   - « mw-refetch » (bouton Forcer la mise à jour des Réglages) : retélécharge toute la copie, puis répond à la page. */
const bust = (u) => { const x = new URL(u, self.location); x.searchParams.set("b", Date.now().toString(36) + Math.random().toString(36).slice(2, 7)); return x.href; };
const getFresh = (u) => fetch(bust(u), { cache: "no-store" }).then((res) => { if (!res.ok) throw new Error(u + " : " + res.status); return res; });
const refetchAll = () => caches.open(VERSION).then((c) => Promise.all(SHELL.map((u) => getFresh(u))).then((list) => Promise.all(list.map((res, i) => c.put(new Request(SHELL[i]), res)))));
self.addEventListener("install", (e) => { e.waitUntil(refetchAll().then(() => self.skipWaiting())); });
const CODE = ["index.html", "app-firebase.js", "firebase-config.js"];
let lastCheck = 0, checking = null;
function refreshCode(force){
  if (checking) return checking;
  if (!force && Date.now() - lastCheck < 15000) return Promise.resolve(false);
  lastCheck = Date.now();
  checking = caches.open(VERSION).then((c) =>
    Promise.all(CODE.map((u) => fetch(new URL(u, self.location).href, { cache: "no-cache" }).then((res) => {
      if (!res.ok) throw new Error(u + " : " + res.status);
      return res.text().then((t) => ({ u, t, type: res.headers.get("content-type") || "" }));
    }))).then((fresh) => Promise.all(fresh.map((f) => c.match(f.u).then((old) => old ? old.text() : null))).then((olds) => {
      if (fresh.every((f, i) => olds[i] === f.t)) return false;
      const puts = [];
      fresh.forEach((f) => { const mk = () => new Response(f.t, { headers: { "Content-Type": f.type } }); puts.push(c.put(new Request(f.u), mk())); if (f.u === "index.html") puts.push(c.put(new Request("./"), mk())); });
      return Promise.all(puts).then(() => true);
    }))
  ).catch(() => false).then((changed) => {
    checking = null;
    if (changed) self.clients.matchAll({ includeUncontrolled: true, type: "window" }).then((cs) => cs.forEach((cl) => cl.postMessage({ type: "mw-updated" })));
    return changed;
  });
  return checking;
}
self.addEventListener("message", (e) => {
  const d = e.data || {};
  if (d.type === "mw-check") e.waitUntil(refreshCode(true));
  if (d.type === "mw-refetch") e.waitUntil(refetchAll().then(() => true, () => false).then((ok) => { lastCheck = Date.now(); if (e.ports && e.ports[0]) e.ports[0].postMessage({ ok }); }));
});
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
     tous les fichiers de la même version) ; la vérification ci-dessus remplace la copie quand le code en ligne a changé */
  if (sameOrigin && SHELL_PATHS.has(url.pathname)){
    if (req.mode === "navigate") e.waitUntil(refreshCode(false));
    e.respondWith(caches.open(VERSION).then((c) => c.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === "navigate" ? c.match("index.html") : null))).then((hit) => hit || fetch(req)).catch(() => caches.match("index.html")));
    return;
  }
  if (sameOrigin){
    /* autres fichiers : d'abord le réseau, sinon le cache */
    /* une adresse avec paramètres (ex. partage reçu) n'est pas gardée en cache ; hors ligne, on sert la page */
    e.respondWith(fetch(req, { cache: "no-cache" }).then((res) => { if (!url.search){ const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return res; }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match("index.html"))));
  }
});

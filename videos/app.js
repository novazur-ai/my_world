/* MyWorld_1.55 : « Nos vidéos », la mini-appli d'Alessia (voir index.html).
   La logique (lecture des liens, fiche commune, titres et vignettes, mode soirée) est celle de la page Vidéos de My World 1.54 :
   une modification de l'une se reporte dans l'autre. */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, setDoc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { FIREBASE_CONFIG, ALLOWED_EMAIL, AGENDA_TOKEN_URL } from "../firebase-config.js";

/* appli Firebase à part (« videos ») : sa connexion est gardée à part de celle de My World,
   donc ouvrir My World avec un autre compte ne déconnecte pas « Nos vidéos » */
const fbApp = initializeApp(FIREBASE_CONFIG, "videos");
const auth = getAuth(fbApp);
let fs;
try { fs = initializeFirestore(fbApp, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }
catch (e) { fs = initializeFirestore(fbApp, {}); }
const itemsCol = () => collection(fs, "shared", "videos", "items");
const vidRef = (k) => { const r = doc(fs, "shared", "videos", "items", k); return { set: (d) => setDoc(r, d), merge: (d) => setDoc(r, d, { merge: true }), delete: () => deleteDoc(r) }; };

/* ---------- petits outils ---------- */
const $ = (id) => document.getElementById(id);
const h = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (n) => (n < 10 ? "0" : "") + n;
const nowISO = () => new Date().toISOString();
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

const VD_P = { yt: { n: "YouTube", c: "#C4302B" }, ig: { n: "Insta", c: "#B0307A" }, fb: { n: "Facebook", c: "#1060C9" } };
const VD_W = { T: { n: "Théo", c: "#0B4F7C" }, A: { n: "Alessia", c: "#B23C6E" } };
const VD_ICON = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10.5 9.5v5l4-2.5z" fill="currentColor"/></svg>';
const VD_PLAY = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>';
const I_HOME = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5L12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>';
const I_OK = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const I_INFO = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.6v.2"/></svg>';

let ME = "A", OTHER = "T", user = null;
const S = { vids: [], loaded: false, tab: "voir", msg: null, err: "" };
let VD = null, VD_TRY = {}, VD_BUSY = false, msgT = 0;

/* ---------- message en haut (bandeau vert de la maquette) ---------- */
function say(text, kind, undo){
  clearTimeout(msgT);
  S.msg = { text, kind: kind || "ok", undo: undo || null };
  render();
  msgT = setTimeout(() => { S.msg = null; render(); }, undo ? 6000 : 4500);
}

/* ---------- lecture des liens (identique à My World) ---------- */
function vidParse(raw){
  const m0 = String(raw || "").match(/https?:\/\/[^\s<>"']+/i); if (!m0) return null;
  const url = m0[0].replace(/[).,;!?]+$/, ""); let m;
  if ((m = url.match(/(?:youtube\.com\/(?:shorts\/|watch\?(?:[^#]*&)?v=|embed\/|live\/|v\/)|youtu\.be\/)([\w-]{11})/i)))
    return { p: "yt", id: m[1], url: /\/shorts\//i.test(url) ? "https://www.youtube.com/shorts/" + m[1] : "https://www.youtube.com/watch?v=" + m[1], raw: url };
  if ((m = url.match(/instagram\.com\/(?:[\w.]+\/)?(reels?|p|tv)\/([\w-]+)/i))){
    const kind = /^reels?$/i.test(m[1]) ? "reel" : m[1].toLowerCase();
    return { p: "ig", id: m[2], kind, url: "https://www.instagram.com/" + kind + "/" + m[2] + "/", raw: url };
  }
  if ((m = url.match(/facebook\.com\/(?:reel|reels)\/(\d+)/i)) || (m = url.match(/facebook\.com\/(?:watch\/?\?(?:[^#]*&)?v=|[\w.]+\/videos\/(?:[\w.-]+\/)?|video\.php\?(?:[^#]*&)?v=)(\d+)/i)))
    return { p: "fb", id: m[1], url: "https://www.facebook.com/reel/" + m[1], raw: url };
  if ((m = url.match(/facebook\.com\/share\/(r|v|p)\/([\w-]+)/i)) || (m = url.match(/fb\.watch\/([\w-]+)/i)))
    return { p: "fb", id: null, short: m[m.length - 1], url: url.split("?")[0], raw: url };
  return null;
}
const vidKey = (v) => v.id ? v.p + "_" + v.id : "fbs_" + v.short;
const vidBy = (x) => { const b = x.by || {}; return ["T", "A"].filter((k) => b[k]); };
const vidWho = (x) => { const b = x.by || {}; return vidBy(x).sort((a, c) => String(b[a]).localeCompare(String(b[c]))); };
function vidLists(){
  const all = S.vids.filter((x) => vidBy(x).length);
  return {
    voir: all.filter((x) => !x.seen).sort((a, b) => String(b.at).localeCompare(String(a.at))),
    vues: all.filter((x) => x.seen).sort((a, b) => String(b.seen).localeCompare(String(a.seen))),
    coeur: all.filter((x) => x.react && x.react.coeur).sort((a, b) => String(b.at).localeCompare(String(a.at)))
  };
}
const vidTitle = (x) => x.title || (x.author ? (x.p === "yt" ? "Vidéo de " : "Reel de ") + x.author : x.p === "yt" ? "Vidéo YouTube" : x.p === "ig" ? "Reel Instagram" : "Reel Facebook");
const vidDur = (s) => { s = Math.round(s || 0); return s ? Math.floor(s / 60) + ":" + pad(s % 60) : ""; };
function vidDay(s){
  if (!s) return ""; const d = new Date(s), t = new Date(), diff = Math.round((new Date(t.toDateString()) - new Date(d.toDateString())) / 864e5);
  return diff === 0 ? "aujourd'hui" : diff === 1 ? "hier" : diff < 7 ? JOURS[d.getDay()] : d.getDate() + " " + MOIS[d.getMonth()];
}

/* ---------- liste commune ---------- */
let snapOn = false, firstSnap = null;
const firstSnapDone = new Promise((res) => { firstSnap = res; });
function vidSnap(){
  if (snapOn) return; snapOn = true;
  onSnapshot(itemsCol(), (s) => {
    S.vids = s.docs.map((d) => { const x = d.data(); x._id = d.id; return x; }); S.loaded = true; S.err = "";
    firstSnap(); render(); if (VD) vdChrome();
    setTimeout(vidEnrichNext, 400);
  }, (e) => {
    snapOn = false; firstSnap();
    S.err = /permission|denied/i.test(String(e && (e.code || e.message))) ? "rules" : "net";
    render();
    if (S.err === "net") setTimeout(vidSnap, 8000);
  });
}
function vidErr(e){
  if (/permission|denied/i.test(String(e && (e.code || e.message)))){ S.err = "rules"; render(); }
  else say("Ça n'a pas marché. Vérifie la connexion et réessaie.", "warn");
}

/* ---------- ajout (partage reçu ou lien collé) ---------- */
function vidAdd(raw){
  const v = vidParse(raw);
  if (!v){ say("Ce lien n'est ni YouTube, ni Instagram, ni Facebook.", "warn"); return false; }
  S.tab = "voir";
  if (v.p === "fb" && !v.id){
    say("Je retrouve la vidéo Facebook…", "info");
    vidLien(v.raw).then((j) => {
      const r = j && j.fbReel ? vidParse(j.fbReel) : null;
      if (r && r.id){ r.raw = v.raw; vidSave(r, j); } else vidSave(v, null);
    }, () => vidSave(v, null));
  } else vidSave(v, null);
  return true;
}
function vidSave(v, lien){
  const key = vidKey(v), ex = S.vids.find((x) => x._id === key), now = nowISO(), ref = vidRef(key);
  if (ex){
    if (ex.by && ex.by[ME]){ say(ex.seen ? "Vous l'avez déjà regardée ensemble." : "Elle est déjà dans la liste.", "info"); return; }
    const pb = {}; pb[ME] = now;
    ref.merge({ by: pb }).then(() => {
      say("Ajoutée ! " + VD_W[OTHER].n + " l'avait aussi partagée.", "ok", () => { const u = {}; u[ME] = null; ref.merge({ by: u }).catch(vidErr); });
    }).catch(vidErr);
    return;
  }
  const d = { p: v.p, id: v.id || null, kind: v.kind || null, short: v.short || null, url: v.url, raw: v.raw || v.url, title: "", author: "", thumb: "", dur: 0, by: {}, at: now, seen: null, react: {}, enr: 0 };
  d.by[ME] = now;
  ref.set(d).then(() => {
    say("Ajoutée ! " + VD_W[OTHER].n + " la verra aussi.", "ok", () => { ref.delete().catch(vidErr); });
    vidEnrich(Object.assign({ _id: key }, d), lien);
  }).catch(vidErr);
}
/* le script Google de My World (seule partie « lien » ouverte à ce compte) */
async function vidLien(url, href){
  if (!AGENDA_TOKEN_URL || !auth.currentUser) throw new Error("no_script");
  const idToken = await auth.currentUser.getIdToken();
  const r = await fetch(AGENDA_TOKEN_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ url, href: href || "", img: 1, idToken, want: "lien" }) });
  const j = await r.json();
  if (!j || j.error) throw new Error((j && j.error) || "lien");
  return j;
}

/* ---------- titre, compte et vignette ---------- */
function vidThumb(b64, mime){
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => { try { const w = 216, hh = 384, c = document.createElement("canvas"); c.width = w; c.height = hh; const g = c.getContext("2d"), s = Math.max(w / im.width, hh / im.height), dw = im.width * s, dh = im.height * s;
      g.drawImage(im, (w - dw) / 2, (hh - dh) / 2, dw, dh); res(c.toDataURL("image/jpeg", .72)); } catch (e) { res(""); } };
    im.onerror = () => res("");
    im.src = "data:" + (mime || "image/jpeg") + ";base64," + b64;
  });
}
function vidMetaFrom(j){
  const out = {}, e = (j && j.embed) || {}, og = (j && j.og) || {};
  if (e.author) out.author = String(e.author).trim().slice(0, 60);
  let t = String(e.caption || "").trim();
  if (!t && og.title && !/^(instagram|facebook)$/i.test(og.title.trim())){
    const m = og.title.match(/^(.+?) sur (?:Instagram|Facebook)\s*:\s*[«"“](.+)[»"”]\s*$/i);
    if (m){ t = m[2]; if (!out.author) out.author = m[1].trim(); } else t = og.title;
  }
  if (t) out.title = t.replace(/\s+/g, " ").trim().slice(0, 140);
  return out;
}
function vidEnrich(x, lien){
  const key = x._id, ref = vidRef(key); VD_TRY[key] = 1;
  const done = (patch) => { patch.enr = (x.enr || 0) + 1; return ref.merge(patch).catch(() => {}); };
  if (x.p === "yt"){
    return fetch("https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent(x.url)).then((r) => r.ok ? r.json() : {}).then((j) =>
      done({ title: String(j.title || "").slice(0, 140), author: String(j.author_name || "").slice(0, 60), thumb: "https://i.ytimg.com/vi/" + x.id + "/hqdefault.jpg" }),
    () => done({ thumb: "https://i.ytimg.com/vi/" + x.id + "/hqdefault.jpg" }));
  }
  const P = lien ? Promise.resolve(lien) : vidLien(x.raw || x.url, x.p === "fb" && x.id ? x.url : "");
  return P.then((j) => {
    /* lien court Facebook retrouvé plus tard : la fiche passe sous sa vraie clé */
    if (x.p === "fb" && !x.id && j.fbReel){
      const r = vidParse(j.fbReel);
      if (r && r.id){
        const nk = vidKey(r), ex = S.vids.find((y) => y._id === nk);
        const d = Object.assign({}, x, { id: r.id, url: r.url, short: null }); delete d._id;
        const w = ex ? vidRef(nk).merge({ by: Object.assign({}, x.by || {}) }) : vidRef(nk).set(d);
        return w.then(() => ref.delete()).then(() => { if (!ex) return vidEnrich(Object.assign({ _id: nk }, d), j); }).catch(() => {});
      }
    }
    const meta = vidMetaFrom(j), e = j.embed || {};
    return (e.b64 ? vidThumb(e.b64, e.mime) : Promise.resolve("")).then((th) => { if (th) meta.thumb = th; return done(meta); });
  }, () => done({}));
}
function vidEnrichNext(){
  if (VD_BUSY || !navigator.onLine) return;
  const x = S.vids.find((y) => !VD_TRY[y._id] && (y.enr || 0) < 3 && (!y.thumb || (y.p === "fb" && !y.id)));
  if (!x) return;
  VD_BUSY = true;
  Promise.resolve(vidEnrich(x, null)).then(() => { VD_BUSY = false; setTimeout(vidEnrichNext, 700); }, () => { VD_BUSY = false; });
}

/* ---------- page (maquette « Mini-appli Vidéos d'Alessia ») ---------- */
function vidCell(x){
  const P = VD_P[x.p] || VD_P.yt, who = vidWho(x), dur = vidDur(x.dur);
  return '<button type="button" class="vd-cell" data-act="vd-open" data-k="' + h(x._id) + '" aria-label="' + h(vidTitle(x) + " · " + P.n + (x.seen ? "" : " · pas encore vue")) + '">'
    + '<span class="vd-th"' + (x.thumb ? "" : ' style="background:' + (x.p === "yt" ? "#E7D9D8" : x.p === "ig" ? "#EBDCE6" : "#D9E3F1") + '"') + '>'
    + (x.thumb ? '<img src="' + h(x.thumb) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">' : '<span class="vd-ph" style="color:' + P.c + '">' + VD_ICON + '</span>')
    + '<span class="vd-pb" style="background:' + P.c + '">' + P.n + '</span>'
    + (x.seen ? "" : '<span class="vd-new" aria-hidden="true"></span>')
    + '<span class="vd-who">' + who.map((k) => '<i style="background:' + VD_W[k].c + '">' + k + '</i>').join("") + '</span>'
    + (dur ? '<span class="vd-dur">' + dur + '</span>' : "") + (x.react && x.react.coeur ? '<span class="vd-heart" aria-hidden="true">♥</span>' : "")
    + '</span><small>' + h(vidTitle(x)) + '</small></button>';
}
function msgHTML(){
  if (S.err === "rules") return '<div class="nv-msg warn" role="status">' + I_INFO + '<span>Ce compte Google n\'a pas accès à la liste commune.</span><button type="button" data-act="nv-out">Changer de compte</button></div>';
  if (S.err) return '<div class="nv-msg warn" role="status">' + I_INFO + '<span>Je n\'arrive pas à joindre la liste. Vérifie la connexion.</span></div>';
  const m = S.msg; if (!m) return "";
  return '<div class="nv-msg ' + m.kind + '" role="status">' + (m.kind === "ok" ? I_OK : I_INFO) + '<span>' + h(m.text) + '</span>' + (m.undo ? '<button type="button" data-act="nv-undo">Annuler</button>' : "") + '</div>';
}
let instEv = null;
function render(){
  const app = $("app"); if (!user || app.hidden) return;
  const s = vidLists(), tab = S.tab in s ? S.tab : "voir", L = s[tab], n = s.voir.length;
  const sub = S.err ? "" : !S.loaded ? "Chargement…" : n ? n + " à regarder ensemble" : "Rien à regarder pour l'instant";
  const tb = (k, lbl, c) => '<button type="button" role="tab" class="' + (k === tab ? "on" : "") + '" aria-selected="' + (k === tab) + '" data-act="vd-tab" data-t="' + k + '">' + lbl + (c ? " · " + c : "") + '</button>';
  let html = '<header class="nv-top"><div><h1>Nos vidéos</h1><p>' + h(sub) + '</p></div><a class="nv-mw" href="../">' + I_HOME + 'My World</a></header>';
  html += msgHTML();
  if (instEv) html += '<div class="nv-inst"><span>Installe « Nos vidéos » pour la retrouver dans <b>Partager</b>.</span><button type="button" data-act="nv-install">Installer</button></div>';
  if (S.loaded && (s.vues.length || s.coeur.length)) html += '<div class="vd-tabs" role="tablist">' + tb("voir", "À voir", n) + tb("vues", "Vues", s.vues.length) + tb("coeur", "Coups de cœur", s.coeur.length) + '</div>';
  html += '<main class="nv-page">';
  if (S.loaded && !L.length){
    html += '<p class="nv-empty">' + (tab === "vues" ? "Aucune vidéo regardée ensemble pour l'instant." : tab === "coeur" ? "Pas encore de coup de cœur : touche le cœur pendant la soirée."
      : "Rien à regarder pour l'instant.<br>Dans YouTube, Instagram ou Facebook : <b>Partager → Nos vidéos</b>.") + '</p>';
  } else html += '<div class="vd-grid">' + L.map(vidCell).join("") + '</div>';
  html += '<div class="nv-foot"><button type="button" class="nv-link" data-act="nv-paste">Coller un lien</button><p class="vd-cred">Partagées par Théo et Alessia · vignettes : YouTube, Instagram, Facebook</p></div></main>';
  if (n && !VD) html += '<div class="nv-fade" aria-hidden="true"></div><button type="button" class="nv-go" data-act="vd-soiree">' + VD_PLAY + 'Lancer la soirée<small>' + n + ' vidéo' + (n > 1 ? "s" : "") + '</small></button>';
  app.innerHTML = html;
}

/* ---------- fiche du bas ---------- */
function openSheet(title, body, onMount){
  const sh = $("sheet");
  sh.innerHTML = '<div class="nv-scrim" data-act="nv-scrim"><div class="nv-sheet" role="dialog" aria-modal="true" aria-label="' + h(title) + '"><h2>' + h(title) + '</h2>' + body + '</div></div>';
  sh.hidden = false; if (onMount) onMount(sh);
}
function closeSheet(){ const sh = $("sheet"); sh.hidden = true; sh.innerHTML = ""; }
function pasteSheet(){
  openSheet("Ajouter une vidéo", '<form id="fAdd"><label for="vdUrl">Lien YouTube, Instagram ou Facebook</label><input id="vdUrl" type="url" inputmode="url" autocomplete="off" placeholder="https://…">'
    + '<p class="hint">Plus simple depuis l\'appli de la vidéo : Partager → Nos vidéos.</p>'
    + '<div class="vd-btns"><button type="button" class="nv-btn light" data-act="nv-clip">Coller</button><button type="submit" class="nv-btn">Ajouter</button></div></form>', () => {
    const f = $("fAdd"), u = $("vdUrl");
    setTimeout(() => { try { u.focus(); } catch (e) {} }, 80);
    f.onsubmit = (e) => { e.preventDefault(); const t = u.value.trim(); if (!vidParse(t)){ u.setCustomValidity(""); u.focus(); u.style.borderColor = "#C2412D"; return; } closeSheet(); vidAdd(t); };
  });
}
function vidSheet(k){
  const x = S.vids.find((y) => y._id === k); if (!x) return;
  const P = VD_P[x.p], who = vidWho(x);
  openSheet(vidTitle(x), '<p class="vd-shm"><span class="vd-pb s" style="background:' + P.c + '">' + P.n + '</span>' + h(who.map((w) => "Partagée par " + VD_W[w].n + " · " + vidDay(x.by[w])).join(" · ")) + (x.seen ? " · vue le " + h(vidDay(x.seen)) : "") + '</p>'
    + '<div class="vd-btns"><button type="button" class="nv-btn light vd-danger" data-act="vd-del" data-k="' + h(k) + '">Retirer</button>'
    + (x.seen ? '<button type="button" class="nv-btn light" data-act="vd-unsee" data-k="' + h(k) + '">Remettre à voir</button>' : "")
    + '<button type="button" class="nv-btn" data-act="vd-one" data-k="' + h(k) + '">Regarder</button></div>'
    + '<a class="vd-ext" href="' + h(x.url) + '" target="_blank" rel="noopener">Ouvrir dans ' + (x.p === "ig" ? "Instagram" : P.n) + '</a>');
}
/* appui long sur une vignette = fiche (retirer, remettre à voir, ouvrir dans l'appli) */
(function(){
  let t = 0, k = null, fired = false, x0 = 0, y0 = 0;
  document.addEventListener("pointerdown", (e) => { const b = e.target.closest && e.target.closest(".vd-cell"); if (!b) return; k = b.dataset.k; fired = false; x0 = e.clientX; y0 = e.clientY;
    clearTimeout(t); t = setTimeout(() => { fired = true; try { navigator.vibrate && navigator.vibrate(12); } catch (x) {} vidSheet(k); }, 460); });
  document.addEventListener("pointermove", (e) => { if (k && (Math.abs(e.clientX - x0) > 10 || Math.abs(e.clientY - y0) > 10)){ clearTimeout(t); k = null; } });
  ["pointerup", "pointercancel"].forEach((n) => document.addEventListener(n, () => { clearTimeout(t); k = null; setTimeout(() => { fired = false; }, 350); }));
  document.addEventListener("click", (e) => { if (fired && e.target.closest && e.target.closest(".vd-cell")){ e.preventDefault(); e.stopPropagation(); fired = false; } }, true);
  document.addEventListener("contextmenu", (e) => { if (e.target.closest && e.target.closest(".vd-cell")) e.preventDefault(); });
})();

/* ---------- mode soirée (identique à My World) ---------- */
let YT_API = null;
function vdYt(){
  if (YT_API) return YT_API;
  YT_API = new Promise((res) => { if (window.YT && window.YT.Player) return res(true); const prev = window.onYouTubeIframeAPIReady; window.onYouTubeIframeAPIReady = () => { if (prev) try { prev(); } catch (e) {} res(true); };
    const s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api"; s.onerror = () => { YT_API = null; res(false); }; document.head.appendChild(s); });
  return YT_API;
}
function vdOpen(L, i0){
  if (!L.length) return;
  const root = $("vdRoot");
  root.innerHTML = '<div class="vd-s" role="dialog" aria-modal="true" aria-label="Soirée vidéos"><div class="vd-stage" id="vdStage"></div>'
    + '<div class="vd-top"><div class="vd-segs" id="vdSegs"></div><div class="vd-tr"><span id="vdCount"></span><button type="button" class="vd-x" data-act="vd-close" aria-label="Quitter la soirée"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div></div>'
    + '<div class="vd-side"><button type="button" class="vd-rb heart" data-act="vd-react" data-r="coeur" aria-label="Coup de cœur" aria-pressed="false"><svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C1 8.6 3 5 6.6 5c2 0 3.4 1.1 4.4 2.6C12 6.1 13.4 5 15.4 5 19 5 21 8.6 19.6 11.8 17.5 16.4 12 21 12 21z"/></svg></button>'
    + '<button type="button" class="vd-rb laugh" data-act="vd-react" data-r="rire" aria-label="Ça nous a fait rire" aria-pressed="false"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M7.5 13.5h9a4.5 4.5 0 0 1-9 0z" fill="currentColor"/><path d="M8 9.5l2 1-2 1M16 9.5l-2 1 2 1"/></svg></button>'
    + '<a class="vd-rb" id="vdExt" href="#" target="_blank" rel="noopener" aria-label="Ouvrir dans l\'appli"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg></a>'
    + '<button type="button" class="vd-rb nx" data-act="vd-next" aria-label="Vidéo suivante"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg></button></div>'
    + '<div class="vd-bot" id="vdBot"></div></div>';
  root.hidden = false; document.body.classList.add("vd-on");
  VD = { keys: L.map((x) => x._id), i: -1, lock: null, timer: 0, yt: null, seenSet: {} };
  history.pushState({ vd: 1 }, "");
  vdWake(true); vdSwipe(root.querySelector(".vd-s"));
  render();
  vdGo(i0 || 0);
}
const vdItem = (i) => { const k = VD && VD.keys[i]; return S.vids.find((x) => x._id === k); };
function vdGo(i){
  if (!VD) return; const n = VD.keys.length;
  if (i >= n){ vdEnd(); return; } if (i < 0) i = 0;
  if (i === VD.i && $("vdStage").firstChild) return;
  VD.i = i; clearTimeout(VD.timer);
  if (VD.yt){ try { VD.yt.destroy(); } catch (e) {} VD.yt = null; }
  const x = vdItem(i), st = $("vdStage"); if (!x){ vdGo(i + 1); return; }
  st.innerHTML = "";
  if (x.p === "yt"){
    const d = document.createElement("div"); d.id = "vdYt"; st.appendChild(d);
    vdYt().then((ok) => {
      if (!VD || VD.i !== i) return;
      if (!ok){ st.innerHTML = '<iframe src="https://www.youtube.com/embed/' + encodeURIComponent(x.id) + '?playsinline=1&rel=0&autoplay=1" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>'; return; }
      VD.yt = new window.YT.Player("vdYt", { videoId: x.id, width: "100%", height: "100%", playerVars: { playsinline: 1, rel: 0, autoplay: 1, modestbranding: 1 }, events: {
        onReady: (ev) => { try { ev.target.playVideo(); const du = ev.target.getDuration(); if (du && !x.dur) vidRef(x._id).merge({ dur: Math.round(du) }).catch(() => {}); } catch (e) {} },
        onStateChange: (ev) => { if (ev.data === 0 && VD && VD.i === i){ vdSeen(x); setTimeout(() => { if (VD && VD.i === i) vdGo(i + 1); }, 700); } }
      } });
    });
  } else if (x.p === "ig"){
    st.innerHTML = '<iframe src="https://www.instagram.com/' + (x.kind || "reel") + '/' + encodeURIComponent(x.id) + '/embed/" allow="autoplay; encrypted-media; fullscreen" allowfullscreen scrolling="no" class="ig"></iframe>';
  } else if (x.id){
    st.innerHTML = '<iframe src="https://www.facebook.com/plugins/video.php?href=' + encodeURIComponent(x.url) + '&show_text=false&autoplay=true&width=400" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share; fullscreen" allowfullscreen scrolling="no"></iframe>';
  } else {
    st.innerHTML = '<div class="vd-nop"><p>Cette vidéo Facebook ne se lit pas ici pour l\'instant (lien pas encore retrouvé).</p><a class="nv-btn" href="' + h(x.raw || x.url) + '" target="_blank" rel="noopener">Ouvrir dans Facebook</a></div>';
  }
  /* « vue » commune : la vidéo est restée 6 s à l'écran pendant la soirée */
  VD.timer = setTimeout(() => { if (VD && VD.i === i) vdSeen(x); }, 6000);
  vdChrome();
}
function vdSeen(x){ if (!VD || VD.seenSet[x._id] || x.seen) return; VD.seenSet[x._id] = 1; vidRef(x._id).merge({ seen: nowISO() }).catch(() => {}); }
function vdChrome(){
  if (!VD) return; const n = VD.keys.length, i = VD.i, x = vdItem(i); if (!x) return;
  const segs = $("vdSegs"), cnt = $("vdCount"), bot = $("vdBot");
  const a = Math.max(0, Math.min(i - 5, n - 12)), b = Math.min(n, a + 12);
  segs.style.gridTemplateColumns = "repeat(" + (b - a) + ",minmax(0,1fr))";
  segs.innerHTML = VD.keys.slice(a, b).map((_, j) => { const k = a + j; return '<span class="' + (k < i ? "done" : k === i ? "on" : "") + '"></span>'; }).join("");
  cnt.textContent = "Soirée vidéos · " + (i + 1) + " / " + n;
  const who = vidWho(x), P = VD_P[x.p], w0 = who[0] || "T";
  bot.innerHTML = '<div class="vd-by"><span class="vd-av" style="background:' + VD_W[w0].c + '">' + w0 + '</span><span class="vd-byn">Partagée par ' + who.map((k) => VD_W[k].n).join(" et ") + '</span><span class="vd-byd">· ' + h(vidDay(x.by[w0])) + '</span><span class="vd-pb s" style="background:' + P.c + '">' + P.n + '</span></div>'
    + '<p class="vd-bt">' + h(vidTitle(x)) + '</p><p class="vd-hint"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>' + (i < n - 1 ? "Glisse vers le haut pour la suivante" : "Dernière vidéo de la soirée") + '</p>';
  const r = x.react || {};
  document.querySelectorAll("#vdRoot .vd-rb[data-r]").forEach((btn) => { const on = !!r[btn.dataset.r]; btn.classList.toggle("on", on); btn.setAttribute("aria-pressed", on); });
  const ext = $("vdExt"); ext.href = x.raw || x.url; ext.setAttribute("aria-label", "Ouvrir dans " + (x.p === "ig" ? "Instagram" : P.n));
}
function vdReact(r){
  const x = vdItem(VD.i); if (!x) return; const cur = !!(x.react && x.react[r]), p = {}; p[r] = !cur;
  vidRef(x._id).merge({ react: p }).catch(vidErr);
  x.react = Object.assign({}, x.react || {}, p); vdChrome();
  try { navigator.vibrate && navigator.vibrate(10); } catch (e) {}
}
function vdEnd(){
  if (!VD) return; clearTimeout(VD.timer); if (VD.yt){ try { VD.yt.destroy(); } catch (e) {} VD.yt = null; }
  const n = Object.keys(VD.seenSet).length;
  $("vdStage").innerHTML = '<div class="vd-fin"><p class="vd-fin-t">C\'est fini pour ce soir !</p><p>' + (n ? n + " vidéo" + (n > 1 ? "s" : "") + " regardée" + (n > 1 ? "s" : "") + " ensemble." : "Aucune vidéo regardée.") + '</p><button type="button" class="nv-btn" data-act="vd-close">Terminer</button></div>';
  $("vdBot").innerHTML = ""; VD.i = VD.keys.length;
  const sd = document.querySelector("#vdRoot .vd-side"); if (sd) sd.style.display = "none";
}
function vdClose(fromPop){
  if (!VD) return; clearTimeout(VD.timer); if (VD.yt){ try { VD.yt.destroy(); } catch (e) {} } vdWake(false); VD = null;
  const root = $("vdRoot"); root.hidden = true; root.innerHTML = ""; document.body.classList.remove("vd-on");
  if (!fromPop && history.state && history.state.vd) history.back();
  render();
}
window.addEventListener("popstate", () => { if (VD && !(history.state && history.state.vd)) vdClose(true); });
function vdWake(on){
  if (!VD) return;
  if (!on){ if (VD.lock){ VD.lock.release().catch(() => {}); VD.lock = null; } return; }
  if (!("wakeLock" in navigator)) return;
  navigator.wakeLock.request("screen").then((l) => { if (!VD){ l.release(); return; } VD.lock = l; l.addEventListener("release", () => { if (VD && VD.lock === l) VD.lock = null; }); }).catch(() => {});
}
document.addEventListener("visibilitychange", () => { if (VD && document.visibilityState === "visible" && !VD.lock) vdWake(true); });
/* glisser vers le haut / le bas sur les zones hors du lecteur (le lecteur garde ses propres gestes) */
function vdSwipe(el){
  let y0 = null, x0 = 0, t0 = 0;
  el.addEventListener("pointerdown", (e) => { if (e.target.closest(".vd-stage") || e.target.closest("button,a")) return; y0 = e.clientY; x0 = e.clientX; t0 = Date.now(); try { el.setPointerCapture(e.pointerId); } catch (x) {} });
  el.addEventListener("pointerup", (e) => { if (y0 === null || !VD) return; const dy = e.clientY - y0, dx = e.clientX - x0; y0 = null;
    if (Math.abs(dy) > 50 && Math.abs(dy) > Math.abs(dx) * 1.3 && Date.now() - t0 < 900) vdGo(VD.i + (dy < 0 ? 1 : -1)); });
  el.addEventListener("pointercancel", () => { y0 = null; });
}
document.addEventListener("keydown", (e) => {
  if (VD){ if (e.key === "Escape"){ e.preventDefault(); vdClose(); } else if (e.key === "ArrowDown" || e.key === "ArrowRight"){ e.preventDefault(); vdGo(VD.i + 1); } else if (e.key === "ArrowUp" || e.key === "ArrowLeft"){ e.preventDefault(); vdGo(VD.i - 1); } return; }
  if (e.key === "Escape" && !$("sheet").hidden) closeSheet();
});

/* ---------- actions ---------- */
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const act = b.dataset.act;
  if (act === "nv-scrim"){ if (e.target === b) closeSheet(); return; }
  switch (act){
    case "vd-tab": S.tab = b.dataset.t; render(); window.scrollTo(0, 0); break;
    case "vd-soiree": vdOpen(vidLists().voir.slice().reverse(), 0); break; /* de la plus ancienne à la plus récente */
    case "vd-open": {
      const s = vidLists(), tab = S.tab in s ? S.tab : "voir", L = tab === "voir" ? s.voir.slice().reverse() : s[tab], k = b.dataset.k;
      vdOpen(L, Math.max(0, L.findIndex((x) => x._id === k))); break;
    }
    case "vd-one": { closeSheet(); const x = S.vids.find((y) => y._id === b.dataset.k); if (x) vdOpen([x], 0); break; }
    case "vd-del": {
      closeSheet(); const x = S.vids.find((y) => y._id === b.dataset.k); if (!x) break;
      const keep = Object.assign({}, x); delete keep._id;
      vidRef(x._id).delete().then(() => say("Vidéo retirée de la liste.", "info", () => { vidRef(x._id).set(keep).catch(vidErr); })).catch(vidErr); break;
    }
    case "vd-unsee": closeSheet(); vidRef(b.dataset.k).merge({ seen: null }).then(() => say("Remise dans « À voir ».", "info")).catch(vidErr); break;
    case "vd-close": vdClose(); break;
    case "vd-next": if (VD) vdGo(VD.i + 1); break;
    case "vd-react": if (VD) vdReact(b.dataset.r); break;
    case "nv-paste": pasteSheet(); break;
    case "nv-clip":
      if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then((t) => { const u = $("vdUrl"); if (u) u.value = t.trim(); }, () => { const u = $("vdUrl"); if (u){ u.placeholder = "Appui long ici, puis Coller"; u.focus(); } });
      break;
    case "nv-undo": { const m = S.msg; clearTimeout(msgT); S.msg = null; render(); if (m && m.undo) m.undo(); break; }
    case "nv-install": if (instEv){ const ev = instEv; instEv = null; ev.prompt(); ev.userChoice.finally(render); } break;
    case "nv-out": signOut(auth).then(() => location.reload()); break;
  }
});
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); instEv = e; render(); });
window.addEventListener("appinstalled", () => { instEv = null; render(); });

/* ---------- partage reçu (Partager → Nos vidéos) ---------- */
const PEND = "nv-share";
(function(){
  const q = new URLSearchParams(location.search);
  if (!q.has("share_text") && !q.has("share_title") && !q.has("share_url")) return;
  const raw = [q.get("share_url"), q.get("share_text"), q.get("share_title")].filter(Boolean).join(" ");
  try { sessionStorage.setItem(PEND, raw); } catch (e) {}
  history.replaceState(null, "", location.pathname);
})();
async function takeShare(){
  let raw = ""; try { raw = sessionStorage.getItem(PEND) || ""; sessionStorage.removeItem(PEND); } catch (e) {}
  if (!raw) return;
  /* on attend la liste (doublons), sans bloquer plus de 3 s */
  await Promise.race([firstSnapDone, new Promise((r) => setTimeout(r, 3000))]);
  if (S.err === "rules") return;
  vidAdd(raw);
}

/* ---------- connexion ---------- */
const provider = new GoogleAuthProvider(); provider.setCustomParameters({ prompt: "select_account" });
$("gateBtn").addEventListener("click", async () => {
  $("gateErr").textContent = "";
  try { await signInWithPopup(auth, provider); }
  catch (e) {
    if (e && (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment")) return signInWithRedirect(auth, provider);
    if (e && e.code === "auth/popup-closed-by-user") return;
    $("gateErr").textContent = navigator.onLine ? "La connexion n'a pas abouti. Réessaie." : "Pas de connexion internet.";
  }
});
getRedirectResult(auth).catch(() => {});
onAuthStateChanged(auth, (u) => {
  if (!u){ user = null; $("app").hidden = true; $("gate").hidden = false; return; }
  user = u;
  ME = (u.email || "").toLowerCase() === String(ALLOWED_EMAIL).toLowerCase() ? "T" : "A"; OTHER = ME === "T" ? "A" : "T";
  $("gate").hidden = true; $("app").hidden = false;
  render(); vidSnap(); takeShare();
});

/* ---------- appli installable et dispo hors connexion ---------- */
if ("serviceWorker" in navigator) window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js", { scope: "./" }).catch(() => {}); });

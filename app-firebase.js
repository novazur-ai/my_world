/* Connexion Firebase (données) et Google Agenda, puis démarrage de l'appli.
   Les réglages propres à votre projet sont dans firebase-config.js. */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, getDoc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, limit, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { FIREBASE_CONFIG, GOOGLE_CLIENT_ID, ALLOWED_EMAIL, AGENDA_TOKEN_URL } from "./firebase-config.js";

const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const fs = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });

/* ---------- base de données : même interface que la version Claude ---------- */
function makeDb(uid){
  const base = "users/" + uid;
  const wrapSnap = (s) => ({ docs: s.docs.map(d => ({ id: d.id, data: () => d.data() })) });
  function coll(name){
    const ref = collection(fs, base + "/" + name);
    const api = {
      add: (data) => addDoc(ref, data),
      newId: () => doc(ref).id,
      doc: (id) => docApi(base + "/" + name + "/" + id),
      onSnapshot: (cb, err) => onSnapshot(ref, s => cb(wrapSnap(s)), err),
      orderBy: (field, dir) => ({ limit: (n) => ({ onSnapshot: (cb, err) => onSnapshot(query(ref, orderBy(field, dir || "asc"), limit(n)), s => cb(wrapSnap(s)), err) }) })
    };
    return api;
  }
  function docApi(path){
    const ref = doc(fs, path);
    return {
      update: (data) => updateDoc(ref, data),
      set: (data) => setDoc(ref, data),
      delete: () => deleteDoc(ref),
      get: () => getDoc(ref).then(s => ({ exists: s.exists(), data: () => s.data() })),
      onSnapshot: (cb, err) => onSnapshot(ref, s => cb({ exists: s.exists(), data: () => s.data() }), err)
    };
  }
  return {
    collection: coll,
    doc: (rel) => docApi(base + "/" + rel),
    /* sauvegarde : import en lots de 400 écritures */
    importAll: async (backup) => {
      const writes = [];
      Object.entries(backup.collections || {}).forEach(([name, docs]) => Object.entries(docs).forEach(([id, data]) => writes.push([base + "/" + name + "/" + id, data])));
      if (backup.settings) writes.push([base + "/settings/main", backup.settings]);
      for (let i = 0; i < writes.length; i += 400){
        const b = writeBatch(fs);
        writes.slice(i, i + 400).forEach(([p, d]) => b.set(doc(fs, p), d, { merge: true }));
        await b.commit();
      }
      return writes.length;
    }
  };
}

/* ---------- Google Agenda (API REST + jeton Google Identity Services) ---------- */
const SCOPE = "https://www.googleapis.com/auth/calendar.events";
const TOK_KEY = "gcalToken", CACHE_KEY = "gcalCache";
function readTok(){ try { const t = JSON.parse(localStorage.getItem(TOK_KEY) || "null"); return t && t.exp > Date.now() + 60000 ? t.v : null; } catch(e){ return null; } }
function saveTok(v, secs){ try { localStorage.setItem(TOK_KEY, JSON.stringify({ v, exp: Date.now() + (secs || 3600) * 1000 })); } catch(e){} }
function loadGis(){
  return new Promise((res, rej) => {
    if (window.google && google.accounts && google.accounts.oauth2) return res();
    const s = document.createElement("script"); s.src = "https://accounts.google.com/gsi/client"; s.async = true;
    s.onload = () => res(); s.onerror = () => rej({ code: "offline" }); document.head.appendChild(s);
  });
}
function makeCal(email){
  let tokenClient = null, pending = null;
  const watchers = [];
  function err(code, extra){ return Object.assign({ code }, extra || {}); }
  function toRfc(local){ /* "AAAA-MM-JJTHH:MM:SS" heure locale -> RFC3339 */ const d = new Date(local); return d.toISOString(); }
  /* Accès renouvelé en arrière-plan par le petit script Google (voir scripts/jeton-agenda) :
     plus de fenêtre Google qui s'ouvre et se referme. */
  let silentP = null, silentFailed = false;
  function silentToken(){
    if (!AGENDA_TOKEN_URL || !auth.currentUser || !navigator.onLine) return Promise.resolve(false);
    if (silentP) return silentP;
    silentP = (async () => {
      try {
        const idToken = await auth.currentUser.getIdToken();
        const r = await fetch(AGENDA_TOKEN_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ idToken }) });
        const txt = await r.text();
        let j = null; try { j = JSON.parse(txt); } catch(e){ console.warn("[Agenda] le script n'a pas renvoyé de JSON (accès du déploiement ou autorisation ?) :", r.status, txt.slice(0, 200)); }
        if (j && j.token){ silentFailed = false; saveTok(j.token, 2700); try { localStorage.setItem("gcalConsented", "1"); } catch(e){} return true; }
        if (j) console.warn("[Agenda] le script a répondu :", j.error || j);
      } catch(e){ console.warn("[Agenda] script injoignable :", e && e.message); }
      silentFailed = navigator.onLine; /* le script ne répond pas : on garde l'ancienne méthode en secours */
      return false;
    })().finally(() => { setTimeout(() => { silentP = null; }, 0); });
    return silentP;
  }
  async function api(method, path, body, retried){
    let tok = readTok();
    if (!tok && await silentToken()) tok = readTok();
    if (!tok) throw err("needs_auth");
    if (!navigator.onLine) throw err("offline");
    let r;
    try { r = await fetch("https://www.googleapis.com/calendar/v3" + path, { method, headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); }
    catch(e){ throw err("offline"); }
    if (r.status === 401){
      try { localStorage.removeItem(TOK_KEY); } catch(e){}
      if (!retried && await silentToken()) return api(method, path, body, true);
      throw err("needs_auth");
    }
    if (!r.ok) throw err("upstream_error", { status: r.status });
    return r.status === 204 ? {} : r.json();
  }
  async function listEvents(a){
    const q = new URLSearchParams({ timeMin: toRfc(a.startTime), timeMax: toRfc(a.endTime), singleEvents: "true", orderBy: "startTime", maxResults: String(a.pageSize || 250) });
    const j = await api("GET", "/calendars/" + encodeURIComponent(a.calendarId) + "/events?" + q);
    return { payload: { events: j.items || [] } };
  }
  async function createEvent(a){
    const allDay = !!a.allDay;
    const body = { summary: a.summary,
      start: allDay ? { date: a.startTime.slice(0,10) } : { dateTime: a.startTime, timeZone: "Europe/Paris" },
      end: allDay ? { date: a.endTime.slice(0,10) } : { dateTime: a.endTime, timeZone: "Europe/Paris" },
      reminders: { useDefault: false, overrides: (a.overrideReminders || []).slice(0,5).map(o => ({ method: "popup", minutes: Math.min(40320, o.minutes) })) } };
    if (a.recurrenceData) body.recurrence = a.recurrenceData;
    if (a.location) body.location = a.location;
    if (a.colorId) body.colorId = a.colorId;
    const j = await api("POST", "/calendars/" + encodeURIComponent(a.calendarId) + "/events", body);
    return { payload: j };
  }
  async function runWatch(w){
    try {
      const r = await listEvents(w.args);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), events: r.payload.events })); } catch(e){}
      w.cb({ type: "data", result: r });
    } catch(e){ w.cb({ type: "error", error: e }); }
  }
  const cal = {
    callTool: (server, tool, args) => tool === "list_events" ? listEvents(args) : tool === "create_event" ? createEvent(args)
      : tool === "find_events" ? api("GET", "/calendars/" + encodeURIComponent(args.calendarId) + "/events?" + new URLSearchParams({ q: args.q, maxResults: "10" })).then(j => ({ payload: { events: j.items || [] } }))
      : tool === "update_event" ? api("PATCH", "/calendars/" + encodeURIComponent(args.calendarId) + "/events/" + encodeURIComponent(args.eventId), { summary: args.summary, start: { date: args.startDate }, end: { date: args.endDate } }).then(j => ({ payload: j }))
      : tool === "patch_event" ? api("PATCH", "/calendars/" + encodeURIComponent(args.calendarId) + "/events/" + encodeURIComponent(args.eventId), args.body).then(j => ({ payload: j }))
      : tool === "delete_event" ? api("DELETE", "/calendars/" + encodeURIComponent(args.calendarId) + "/events/" + encodeURIComponent(args.eventId)).then(() => ({ payload: {} }))
      : Promise.reject(err("unknown_tool")),
    watchTool: (server, tool, args, cb, opts) => {
      const w = { args, cb };
      watchers.push(w);
      /* d'abord le dernier agenda connu (marche hors connexion) */
      try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); if (c && c.events) cb({ type: "data", result: { payload: { events: c.events } }, cached: true }); } catch(e){}
      runWatch(w);
      setInterval(() => runWatch(w), (opts && opts.refetchInterval) || 300000);
    },
    invalidate: () => watchers.forEach(runWatch),
    /* à appeler depuis un appui sur un bouton : ouvre la fenêtre Google si besoin */
    /* à appeler depuis un appui : ouvre la fenêtre Google si besoin.
       change = true : choisir un autre compte Google */
    connect: async (change) => {
      if (!change && await silentToken()){ watchers.forEach(runWatch); return; }
      await loadGis();
      if (!tokenClient){
        tokenClient = google.accounts.oauth2.initTokenClient({ client_id: GOOGLE_CLIENT_ID, scope: SCOPE, prompt: "",
          callback: (resp) => { if (resp && resp.access_token){ saveTok(resp.access_token, +resp.expires_in); try { localStorage.setItem("gcalConsented", "1"); } catch(e){} watchers.forEach(runWatch); if (pending) pending.res(); } else if (pending) pending.rej(err("denied")); pending = null; },
          error_callback: () => { if (pending) pending.rej(err("denied")); pending = null; } });
      }
      return new Promise((res, rej) => {
        pending = { res, rej };
        const known = localStorage.getItem("gcalConsented");
        tokenClient.requestAccessToken(change ? { prompt: "select_account consent" } : { prompt: known ? "" : "consent", hint: email });
      });
    },
    /* MyWorld_1.8 : nuits reçues par le script (HC Webhook) depuis « since ». null = script injoignable ou pas à jour */
    sleep: async (since) => {
      if (!AGENDA_TOKEN_URL || !auth.currentUser || !navigator.onLine) return null;
      try {
        const idToken = await auth.currentUser.getIdToken();
        const r = await fetch(AGENDA_TOKEN_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ idToken, want: "sommeil", since: since || "" }) });
        const j = JSON.parse(await r.text());
        return j && Array.isArray(j.nights) ? j : { old: true };
      } catch(e){ console.warn("[Sommeil] script injoignable :", e && e.message); return null; }
    },
    hasToken: () => !!readTok(),
    hasConsented: () => !!localStorage.getItem("gcalConsented"),
    disconnect: () => {
      const t = readTok();
      try { localStorage.removeItem(TOK_KEY); localStorage.removeItem("gcalConsented"); localStorage.removeItem(CACHE_KEY); } catch(e){}
      if (t && window.google && google.accounts && google.accounts.oauth2) google.accounts.oauth2.revoke(t, () => {});
      watchers.forEach(w => w.cb({ type: "error", error: err("needs_auth") }));
    }
  };
  /* L'accès Google expire toutes les heures : on le renouvelle en silence au premier appui dans l'appli
     (Google exige un geste de l'utilisateur ; la fenêtre se ferme toute seule puisque l'accord est déjà donné) */
  let lastTry = 0;
  document.addEventListener("pointerup", () => {
    if (AGENDA_TOKEN_URL && !silentFailed) return; /* renouvelé en silence, sans fenêtre */
    if (readTok() || !localStorage.getItem("gcalConsented") || !navigator.onLine || pending || Date.now() - lastTry < 600000) return;
    lastTry = Date.now();
    cal.connect().catch(() => {});
  }, true);
  /* renouvelle l'accès un peu avant qu'il expire, sans rien ouvrir */
  if (AGENDA_TOKEN_URL) setInterval(() => { if (!readTok() || document.visibilityState !== "visible") return; try { const t = JSON.parse(localStorage.getItem(TOK_KEY)); if (t.exp - Date.now() < 300000) silentToken(); } catch(e){} }, 60000);
  /* reprend la main tout seul quand la connexion revient */
  window.addEventListener("online", () => watchers.forEach(runWatch));
  return cal;
}

/* ---------- connexion ---------- */
const gate = document.getElementById("gate"), gateMsg = document.getElementById("gateMsg"), gateBtn = document.getElementById("gateBtn");
const provider = new GoogleAuthProvider(); provider.setCustomParameters({ login_hint: ALLOWED_EMAIL, prompt: "select_account" });
gateBtn.addEventListener("click", async () => {
  gateMsg.textContent = "";
  try { await signInWithPopup(auth, provider); }
  catch(e){ if (e && (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment")) return signInWithRedirect(auth, provider); gateMsg.textContent = navigator.onLine ? "La connexion n'a pas abouti. Réessaie." : "Pas de connexion internet pour la première connexion."; }
});
getRedirectResult(auth).catch(() => {});
let started = false;
onAuthStateChanged(auth, async (user) => {
  if (!user){ gate.hidden = false; document.body.classList.add("locked"); return; }
  if ((user.email || "").toLowerCase() !== ALLOWED_EMAIL.toLowerCase()){
    gateMsg.textContent = "Ce compte n'a pas accès à cette appli. Connecte-toi avec " + ALLOWED_EMAIL + ".";
    await signOut(auth); return;
  }
  gate.hidden = true; document.body.classList.remove("locked");
  if (started) return; started = true;
  window.APP_SIGNOUT = () => signOut(auth).then(() => location.reload());
  window.startData(makeDb(user.uid), makeCal(user.email));
});

/* ---------- écran de lancement ----------
   MyWorld_1.19 : plus d'attente imposée. L'appli s'ouvre depuis la copie gardée dans le téléphone (sw.js) et l'écran part
   dès que les données sont là. 1re ouverture du jour : courte animation du logo (au moins 0,5 s) ; ensuite le logo
   rétrécit jusqu'au +. La recherche de nouvelle version se fait après, en coulisse : la nouvelle version sert
   à l'ouverture suivante (petit message pour prévenir). */
const splash = document.getElementById("splash"), t0 = Date.now();
let splashOpen = !!splash;
function hideSplash(){
  if (!splashOpen) return; splashOpen = false;
  const quick = splash.classList.contains("quick");
  setTimeout(() => {
    const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = "#0B4F7C";
    if (quick){
      const lg = splash.querySelector(".sp-lg"), pl = document.querySelector("nav.tabs .nav-add");
      const b = pl && pl.getBoundingClientRect();
      if (lg && b && b.width > 0 && getComputedStyle(pl).visibility !== "hidden"){
        const a = lg.getBoundingClientRect();
        splash.style.setProperty("--qx", Math.round(b.left + b.width / 2 - (a.left + a.width / 2)) + "px");
        splash.style.setProperty("--qy", Math.round(b.top + b.height / 2 - (a.top + a.height / 2)) + "px");
        splash.style.setProperty("--qs", Math.max(.08, Math.min(.6, b.width * 1.15 / (a.width * .727))).toFixed(3));
        setTimeout(() => { pl.classList.remove("mw-pop"); void pl.offsetWidth; pl.classList.add("mw-pop"); setTimeout(() => pl.classList.remove("mw-pop"), 420); }, 470);
      } else splash.classList.remove("quick");   /* pas de + à l'écran : sortie courte classique */
    }
    splash.classList.add("out"); setTimeout(() => splash.remove(), splash.classList.contains("quick") ? 680 : 820);
  }, Math.max(0, (quick ? 0 : 500) - (Date.now() - t0)));
}
const timeout = (ms) => new Promise((r) => setTimeout(r, ms));
const appReady = new Promise((resolve) => {
  window.addEventListener("carnet-ready", resolve, { once: true });
  new MutationObserver(() => { if (!gate.hidden) resolve(); }).observe(gate, { attributes: true, attributeFilter: ["hidden"] });
});

/* nouvelle version (MyWorld_1.24) : cherchée à chaque démarrage ET à chaque retour dans l'appli (Android garde souvent
   l'appli en mémoire : « fermer / rouvrir » ne la relance pas). Dès qu'elle est installée, un bouton « Mettre à jour l'app »
   apparaît ; un toucher recharge l'appli sur la nouvelle version. */
let swReg = null, lastUpdCheck = 0, updShown = false;
function showUpdateBtn(){
  if (updShown || document.getElementById("updBtn")) return; updShown = true;
  const b = document.createElement("button"); b.type = "button"; b.id = "updBtn"; b.className = "upd-btn";
  b.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg><span>Mettre à jour l\'app</span>';
  b.addEventListener("click", () => { b.disabled = true; b.classList.add("busy"); b.querySelector("span").textContent = "Mise à jour…"; hardUpdate(); });
  document.body.appendChild(b);
}
/* MyWorld_1.25 : mise à jour sûre. On laisse d'abord la nouvelle version s'installer (6 s au plus) ; si elle ne
   prend pas la main, on efface la copie locale de l'appli (pas les données) et on recharge depuis le réseau. */
function hardUpdate(){
  let done = false;
  const go = () => { if (done) return; done = true; location.replace(location.pathname + "?maj=" + Date.now() + location.hash); };
  if (!("serviceWorker" in navigator)) return go();
  const fresh = () => fetch("version.json?t=" + Date.now(), { cache: "no-store" }).then((r) => r.ok ? r.json() : null).catch(() => null);
  navigator.serviceWorker.addEventListener("controllerchange", () => setTimeout(go, 150));
  if (swReg) swReg.update().catch(() => {});
  setTimeout(() => {
    if (done) return;
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k.indexOf("carnet-") === 0 && k !== "carnet-assets-1").map((k) => caches.delete(k)))).catch(() => {}).then(fresh).then(go, go);
  }, 6000);
}
function checkBuild(){
  const mine = window.APP_BUILD; if (!mine || mine.indexOf("__") >= 0 || !navigator.onLine) return;
  fetch("version.json?t=" + Date.now(), { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then((j) => { if (j && j.build && j.build !== mine) showUpdateBtn(); }).catch(() => {});
}
function checkUpdate(){
  if (!("serviceWorker" in navigator)) return;
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadController) showUpdateBtn(); hadController = true; });
  navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).then((reg) => {
    swReg = reg;
    if (reg.waiting && navigator.serviceWorker.controller) showUpdateBtn();
    reg.addEventListener("updatefound", () => { const w = reg.installing, had = !!navigator.serviceWorker.controller; if (w && had) w.addEventListener("statechange", () => { if (w.state === "installed" || w.state === "activated") showUpdateBtn(); }); });   /* pas de bouton à la toute 1re installation */
    recheckUpdate(true);
  }).catch(() => {});
}
function recheckUpdate(force){
  if (!swReg || !navigator.onLine) return;
  if (!force && Date.now() - lastUpdCheck < 30000) return;
  lastUpdCheck = Date.now(); swReg.update().catch(() => {}); checkBuild();
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") recheckUpdate(false); });
window.addEventListener("online", () => recheckUpdate(true));
Promise.race([appReady, timeout(4000)]).then(() => requestAnimationFrame(() => requestAnimationFrame(hideSplash)));
setTimeout(hideSplash, 8000);
setTimeout(checkUpdate, 600);

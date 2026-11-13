/* My World : petit script Google qui tourne avec le compte du propriétaire.
   1. Agenda : renouvelle l'accès à Google Agenda en arrière-plan (il vérifie d'abord que la demande vient de ta session dans l'appli).
   2. Sommeil (MyWorld_1.8) : reçoit tes nuits envoyées par HC Webhook depuis ton téléphone, les garde ici,
      et les donne à My World quand l'appli les demande (même vérification de session).
      HC Webhook appelle l'adresse du script suivie de ?k=<clé secrète> (Apps Script ne lit pas les en-têtes personnalisés). */
const ALLOWED_EMAIL = "t.mallet06@gmail.com";
const FIREBASE_API_KEY = "AIzaSyBgYrV_-hMre0i_0IBGU70yAopTrFIXK0E"; // clé publique Firebase, déjà visible dans firebase-config.js
const NIGHTS_KEEP = 200; // nuits gardées dans le script (My World les recopie dans ta base)

function doPost(e) {
  if (e && e.parameter && e.parameter.k) return json_(recevoirNuits_(e));
  let out;
  try {
    const body = JSON.parse(e.postData.contents);
    if (!sessionOk_(body.idToken)) out = { error: "refused" };
    else if (body.want === "sommeil") {
      const p = PropertiesService.getScriptProperties();
      out = { nights: lireNuits_(body.since || ""), seen: p.getProperty("SLEEP_SEEN") || "", test: p.getProperty("SLEEP_TEST") || "", key: !!p.getProperty("SLEEP_KEY") };
    }
    else out = { token: ScriptApp.getOAuthToken() };
  } catch (err) {
    out = { error: "bad_request" };
  }
  return json_(out);
}

/* Ouvrir l'adresse du script dans un navigateur : simple vérification qu'il répond. */
function doGet() { return json_({ ok: true, app: "My World" }); }

function sessionOk_(idToken) {
  if (!idToken) return false;
  const r = UrlFetchApp.fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + FIREBASE_API_KEY, {
    method: "post", contentType: "application/json", payload: JSON.stringify({ idToken: idToken }),
    headers: { Referer: "https://novazur-ai.github.io/" }, muteHttpExceptions: true
  });
  const u = (JSON.parse(r.getContentText()).users || [])[0];
  return !!(u && String(u.email).toLowerCase() === ALLOWED_EMAIL && u.emailVerified);
}

/* Phases Health Connect (SleepSessionRecord.STAGE_TYPE_*) :
   0 inconnue, 1 éveil, 2 sommeil (sans détail), 3 hors du lit, 4 léger, 5 profond, 6 paradoxal, 7 éveil au lit */
const PHASE = { "0": "s", "1": "w", "2": "s", "3": "w", "4": "l", "5": "d", "6": "r", "7": "w",
  awake: "w", sleeping: "s", out_of_bed: "w", light: "l", deep: "d", rem: "r", awake_in_bed: "w", unknown: "s" };

function recevoirNuits_(e) {
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty("SLEEP_KEY");
  if (!key || e.parameter.k !== key) return { error: "refused" };
  let data;
  try { data = JSON.parse(e.postData.contents); } catch (err) { return { error: "bad_json" }; }
  const now = new Date().toISOString();
  props.setProperty("SLEEP_SEEN", now); // dernier envoi reçu (même vide), affiché dans My World
  if (data.test) { props.setProperty("SLEEP_TEST", now); return { ok: true, test: true }; } // bouton « Tester le Webhook » : fausses données, on ne les garde pas
  let n = 0;
  (data.sleep || []).forEach(function (s) {
    const end = new Date(s.session_end_time);
    if (isNaN(end) || !s.duration_seconds) return;
    const start = new Date(end.getTime() - s.duration_seconds * 1000);
    const st = (s.stages || []).map(function (x) {
      const a = new Date(x.start_time), b = new Date(x.end_time);
      return [PHASE[String(x.stage).toLowerCase()] || "s", Math.round((a - start) / 60000), Math.max(0, Math.round((b - a) / 60000))];
    }).filter(function (x) { return x[2] > 0; });
    const night = { s: start.toISOString(), e: end.toISOString(), st: st, src: (s.metadata && (s.metadata.data_origin || s.metadata.dataOrigin)) || "", up: now };
    props.setProperty("n:" + start.toISOString().slice(0, 16), JSON.stringify(night));
    n++;
  });
  if (n) menage_(props);
  return { ok: true, nights: n };
}

function menage_(props) {
  const keys = Object.keys(props.getProperties()).filter(function (k) { return k.indexOf("n:") === 0; }).sort();
  keys.slice(0, Math.max(0, keys.length - NIGHTS_KEEP)).forEach(function (k) { props.deleteProperty(k); });
}

/* since : on ne renvoie que les nuits reçues (ou mises à jour) après cette date */
function lireNuits_(since) {
  const all = PropertiesService.getScriptProperties().getProperties(), out = [];
  Object.keys(all).forEach(function (k) {
    if (k.indexOf("n:") !== 0) return;
    try { const v = JSON.parse(all[k]); if (!since || v.up > since) { v.id = k.slice(2).replace(/:/g, "-"); out.push(v); } } catch (err) {}
  });
  return out.sort(function (a, b) { return a.s < b.s ? -1 : 1; });
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* À lancer une fois depuis l'éditeur pour donner l'autorisation (agenda). */
function autoriser() {
  const r = Calendar.Events.list("primary", { maxResults: 1 });
  Logger.log("C'est bon, l'agenda répond (" + (r.items || []).length + " événement lu).");
}

/* À lancer une fois (sommeil) : crée la clé secrète et l'affiche dans le journal d'exécution.
   La relancer change la clé : il faudra alors mettre à jour l'adresse dans HC Webhook. */
function creerCleSommeil() {
  const k = Utilities.getUuid().replace(/-/g, "");
  PropertiesService.getScriptProperties().setProperty("SLEEP_KEY", k);
  Logger.log("Ta clé sommeil : " + k);
  Logger.log("Dans HC Webhook, colle l'adresse de ton script (celle qui finit par /exec) suivie de : ?k=" + k);
}

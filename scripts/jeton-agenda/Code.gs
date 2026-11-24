/* My World : petit script Google qui tourne avec le compte du propriétaire.
   1. Agenda : renouvelle l'accès à Google Agenda en arrière-plan (il vérifie d'abord que la demande vient de ta session dans l'appli).
   2. Sommeil (MyWorld_1.8) : reçoit tes nuits envoyées par HC Webhook depuis ton téléphone, les garde ici,
      et les donne à My World quand l'appli les demande (même vérification de session).
      HC Webhook appelle l'adresse du script suivie de ?k=<clé secrète> (Apps Script ne lit pas les en-têtes personnalisés).
   3. Clés d'API gratuites (MyWorld_1.50) : gardées ICI, dans les propriétés du script (jamais dans le code public de l'appli).
      GROQ_KEY = dictée Whisper (Groq), TMDB_KEY = films et séries (TMDB), YOUTUBE_KEY = infos des vidéos YouTube.
      L'appli demande « voix », « tmdb » ou « youtube » ; le script vérifie ta session puis appelle le service avec la clé.
   4. Vidéos à deux (MyWorld_1.54) : la propriété du script PARTAGE_EMAILS (adresses séparées par des virgules, jamais écrites
      ici car ce code est public) liste les comptes qui partagent la liste de vidéos. Ces comptes n'ont droit QU'À « lien »
      (analyser un lien vidéo) et « youtube » : ni l'agenda, ni le sommeil, ni la dictée, ni les films. */
const ALLOWED_EMAIL = "t.mallet06@gmail.com";
const FIREBASE_API_KEY = "AIzaSyBgYrV_-hMre0i_0IBGU70yAopTrFIXK0E"; // clé publique Firebase, déjà visible dans firebase-config.js
const NIGHTS_KEEP = 200; // nuits gardées dans le script (My World les recopie dans ta base)

function doPost(e) {
  if (e && e.parameter && e.parameter.k) return json_(recevoirNuits_(e));
  let out;
  try {
    const body = JSON.parse(e.postData.contents);
    const who = sessionWho_(body.idToken);
    if (!who) out = { error: "refused" };
    else if (who !== "o" && body.want !== "lien" && body.want !== "youtube") out = { error: "refused" };   /* compte partagé : vidéos seulement */
    else if (body.want === "sommeil") {
      const p = PropertiesService.getScriptProperties();
      out = { nights: lireNuits_(body.since || ""), seen: p.getProperty("SLEEP_SEEN") || "", test: p.getProperty("SLEEP_TEST") || "", key: !!p.getProperty("SLEEP_KEY") };
    }
    else if (body.want === "cles") {
      const p = PropertiesService.getScriptProperties();
      out = { groq: !!p.getProperty("GROQ_KEY"), tmdb: !!p.getProperty("TMDB_KEY"), youtube: !!p.getProperty("YOUTUBE_KEY"), v: 154 };
    }
    else if (body.want === "voix") out = transcrire_(body);
    else if (body.want === "tmdb") out = tmdb_(body);
    else if (body.want === "youtube") out = youtube_(body);
    else if (body.want === "lien") out = lien_(body);
    else out = { token: ScriptApp.getOAuthToken() };
  } catch (err) {
    out = { error: "bad_request" };
  }
  return json_(out);
}

/* Ouvrir l'adresse du script dans un navigateur : simple vérification qu'il répond. */
function doGet() { return json_({ ok: true, app: "My World" }); }

function sessionOk_(idToken) { return sessionWho_(idToken) === "o"; }
/* "o" = toi (propriétaire), "a" = un compte de PARTAGE_EMAILS, "" = refusé */
function sessionWho_(idToken) {
  if (!idToken) return "";
  /* session déjà vérifiée il y a moins de 10 min : on gagne un aller-retour (la dictée doit être rapide) */
  const ck = "w:" + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken)).slice(0, 40);
  const cache = CacheService.getScriptCache();
  const c = cache.get(ck); if (c === "o" || c === "a") return c;
  const mail = sessionCheck_(idToken);
  let who = "";
  if (mail && mail === ALLOWED_EMAIL) who = "o";
  else if (mail) {
    const list = String(PropertiesService.getScriptProperties().getProperty("PARTAGE_EMAILS") || "").toLowerCase().split(/[\s,;]+/).filter(String);
    if (list.indexOf(mail) >= 0) who = "a";
  }
  if (who) cache.put(ck, who, 600);
  return who;
}
function sessionCheck_(idToken) {
  const r = UrlFetchApp.fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + FIREBASE_API_KEY, {
    method: "post", contentType: "application/json", payload: JSON.stringify({ idToken: idToken }),
    headers: { Referer: "https://novazur-ai.github.io/" }, muteHttpExceptions: true
  });
  const u = (JSON.parse(r.getContentText()).users || [])[0];
  return u && u.emailVerified ? String(u.email || "").toLowerCase() : "";
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

/* ---------- MyWorld_1.50 : dictée Whisper (Groq), films (TMDB), vidéos (YouTube) ---------- */
function cle_(nom) { return PropertiesService.getScriptProperties().getProperty(nom) || ""; }

/* body.audio = son en base64, body.mime = type (audio/webm…), body.prompt = mots à bien reconnaître (facultatif) */
function transcrire_(body) {
  const key = cle_("GROQ_KEY");
  if (!key) return { error: "no_key" };
  if (!body.audio) return { error: "no_audio" };
  const t0 = Date.now();
  const mime = String(body.mime || "audio/webm").split(";")[0];
  const ext = mime.indexOf("mp4") >= 0 ? "m4a" : mime.indexOf("ogg") >= 0 ? "ogg" : mime.indexOf("wav") >= 0 ? "wav" : "webm";
  const blob = Utilities.newBlob(Utilities.base64Decode(body.audio), mime, "voix." + ext);
  const form = { file: blob, model: body.model === "turbo" ? "whisper-large-v3-turbo" : "whisper-large-v3", language: "fr", response_format: "json", temperature: "0" };
  if (body.prompt) form.prompt = String(body.prompt).slice(0, 800);
  const r = UrlFetchApp.fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "post", headers: { Authorization: "Bearer " + key }, payload: form, muteHttpExceptions: true
  });
  const code = r.getResponseCode();
  let j = {};
  try { j = JSON.parse(r.getContentText()); } catch (err) {}
  if (code !== 200) return { error: code === 429 ? "quota" : "groq_" + code, detail: (j.error && j.error.message) || "" };
  return { text: String(j.text || "").trim(), ms: Date.now() - t0 };
}

/* body.path : seulement les chemins utiles (recherche, fiche, où regarder) ; body.q : recherche */
function tmdb_(body) {
  const key = cle_("TMDB_KEY");
  if (!key) return { error: "no_key" };
  const path = String(body.path || "");
  if (!/^(search\/multi|search\/movie|search\/tv|(movie|tv)\/\d+(\/watch\/providers)?)$/.test(path)) return { error: "bad_path" };
  const qs = { language: "fr-FR", region: "FR", include_adult: "false" };
  if (body.q) qs.query = String(body.q).slice(0, 120);
  if (body.year) qs.year = String(body.year).slice(0, 4);
  if (/^(movie|tv)\/\d+$/.test(path)) { qs.append_to_response = "watch/providers,videos"; qs.include_video_language = "fr,en,null"; }   /* 1.51 : plateformes + bande-annonce */
  const headers = {};
  if (key.indexOf("eyJ") === 0) headers.Authorization = "Bearer " + key; else qs.api_key = key;   /* jeton v4 ou clé v3 */
  const url = "https://api.themoviedb.org/3/" + path + "?" + Object.keys(qs).map(function (k) { return k + "=" + encodeURIComponent(qs[k]); }).join("&");
  const r = UrlFetchApp.fetch(url, { headers: headers, muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return { error: "tmdb_" + r.getResponseCode() };
  return { data: JSON.parse(r.getContentText()) };
}

/* body.ids : identifiants de vidéos YouTube (50 au plus) → titre, chaîne, durée, vignette */
function youtube_(body) {
  const key = cle_("YOUTUBE_KEY");
  if (!key) return { error: "no_key" };
  const ids = (body.ids || []).map(String).filter(function (x) { return /^[\w-]{6,20}$/.test(x); }).slice(0, 50);
  if (!ids.length) return { items: [] };
  const r = UrlFetchApp.fetch("https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=" + ids.join(",") + "&key=" + key, { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return { error: "youtube_" + r.getResponseCode() };
  const j = JSON.parse(r.getContentText());
  return { items: (j.items || []).map(function (v) {
    const sn = v.snippet || {}, th = sn.thumbnails || {};
    return { id: v.id, title: sn.title || "", channel: sn.channelTitle || "", dur: (v.contentDetails || {}).duration || "", thumb: ((th.high || th.medium || th.default) || {}).url || "" };
  }) };
}

/* 1.52 (« Vidéos à deux », page de test) : un lien vidéo partagé → redirections suivies une à une (liens courts
   facebook.com/share/r/…), titre et image de la page (og:title, og:image), et oEmbed de Meta / YouTube sans jeton. */
function lien_(body) {
  let url = String(body.url || "").trim();
  const ok = function (u) { return /^https:\/\/([\w-]+\.)*(facebook\.com|fb\.watch|instagram\.com|youtube\.com|youtu\.be)(\/|$)/i.test(u); };
  if (!ok(url)) return { error: "bad_url" };
  const UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
  const chain = [url]; let r = null, code = 0;
  for (let i = 0; i < 6; i++) {
    r = UrlFetchApp.fetch(url, { followRedirects: false, muteHttpExceptions: true, headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9" } });
    code = r.getResponseCode();
    if (code < 300 || code >= 400) break;
    const hd = r.getAllHeaders(); let loc = hd.Location || hd.location; if (Array.isArray(loc)) loc = loc[0];
    if (!loc) break;
    if (!/^https?:/i.test(loc)) loc = url.replace(/^(https?:\/\/[^\/]+).*$/, "$1") + (loc.charAt(0) === "/" ? "" : "/") + loc;
    url = loc; chain.push(url);
  }
  const html = r ? String(r.getContentText()).slice(0, 400000) : "";
  const dec = function (x) { return String(x || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;/gi, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(+n); }).replace(/&#x([0-9a-f]+);/gi, function (m, n) { return String.fromCharCode(parseInt(n, 16)); }); };
  const meta = function (k) {
    const a = html.match(new RegExp("<meta[^>]+(?:property|name)=[\"']" + k + "[\"'][^>]*content=[\"']([^\"']*)", "i"))
      || html.match(new RegExp("<meta[^>]+content=[\"']([^\"']*)[\"'][^>]*(?:property|name)=[\"']" + k + "[\"']", "i"));
    return a ? dec(a[1]) : "";
  };
  const og = { title: meta("og:title"), image: meta("og:image"), desc: meta("og:description").slice(0, 300), type: meta("og:type"), url: meta("og:url") };
  let oe = null, oeUrl = "";
  if (/instagram\.com/i.test(url)) oeUrl = "https://graph.facebook.com/v25.0/instagram_oembed?url=";
  else if (/facebook\.com|fb\.watch/i.test(url)) oeUrl = "https://graph.facebook.com/v25.0/oembed_video?url=";
  else oeUrl = "https://www.youtube.com/oembed?format=json&url=";
  try {
    const o = UrlFetchApp.fetch(oeUrl + encodeURIComponent(og.url && ok(og.url) ? og.url : url), { muteHttpExceptions: true });
    const t = o.getContentText();
    let j = null; try { j = JSON.parse(t); } catch (e) {}
    oe = { status: o.getResponseCode(), keys: j ? Object.keys(j) : [], title: j && j.title || "", thumb: j && j.thumbnail_url || "", author: j && j.author_name || "", error: j && j.error ? (j.error.message || "").slice(0, 200) : (j ? "" : t.slice(0, 200)) };
  } catch (e) { oe = { status: 0, error: String(e).slice(0, 200) }; }
  /* 1.53 : lien court Facebook (share/r, share/v, fb.watch) : on essaie les autres adresses de Facebook, qui redirigent parfois vers le reel avant la connexion */
  let fbTries = null, fbReel = "";
  const sh = String(body.url || "").match(/facebook\.com\/share\/(r|v|p)\/([\w-]+)/i);
  if (sh) {
    fbTries = [];
    const UAD = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
    const hosts = ["m.facebook.com", "mbasic.facebook.com", "web.facebook.com", "www.facebook.com"];
    for (let i = 0; i < hosts.length && !fbReel; i++) {
      for (let k = 0; k < 2 && !fbReel; k++) {
        const u0 = "https://" + hosts[i] + "/share/" + sh[1] + "/" + sh[2] + "/";
        try {
          const rr = UrlFetchApp.fetch(u0, { followRedirects: false, muteHttpExceptions: true, headers: { "User-Agent": k ? UAD : UA, "Accept-Language": "fr-FR,fr;q=0.9" } });
          const hd = rr.getAllHeaders(); let loc = hd.Location || hd.location; if (Array.isArray(loc)) loc = loc[0];
          loc = String(loc || "");
          const deep = decodeURIComponent(loc);
          const m = deep.match(/facebook\.com\/(?:reel|reels)\/(\d+)|\/videos\/(?:[\w.-]+\/)?(\d+)|[?&]v=(\d+)/);
          if (m) fbReel = "https://www.facebook.com/reel/" + (m[1] || m[2] || m[3]);
          fbTries.push({ host: hosts[i], ua: k ? "ordinateur" : "téléphone", code: rr.getResponseCode(), loc: loc.slice(0, 220) });
        } catch (x) { fbTries.push({ host: hosts[i], ua: k ? "ordinateur" : "téléphone", code: -1, loc: String(x).slice(0, 120) }); }
      }
    }
    if (fbReel && !body.href) body.href = fbReel;
  }
  /* 1.53 : vignette et texte depuis la page d'intégration (faite pour être affichée ailleurs, sans connexion) */
  let emb = null;
  try {
    const src = String(body.url || ""), href = String(body.href || "");
    let eu = "";
    const ig = src.match(/instagram\.com\/(?:[\w.]+\/)?(reels?|p|tv)\/([\w-]+)/i);
    if (ig) eu = "https://www.instagram.com/" + (/^reels?$/i.test(ig[1]) ? "reel" : ig[1].toLowerCase()) + "/" + ig[2] + "/embed/captioned/";
    else if (/facebook\.com\/(reel|reels|watch|[\w.]+\/videos)\b/i.test(href || src)) eu = "https://www.facebook.com/plugins/video.php?show_text=true&width=340&href=" + encodeURIComponent(href || src);
    if (eu) {
      const e = UrlFetchApp.fetch(eu, { muteHttpExceptions: true, followRedirects: true, headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9" } });
      const t = String(e.getContentText()).slice(0, 600000);
      const pick = function (re) { const m = t.match(re); return m ? dec(m[1]) : ""; };
      let img = pick(/class=["'][^"']*EmbeddedMediaImage[^"']*["'][^>]*src=["']([^"']+)/i) || pick(/<img[^>]+src=["']([^"']+)["'][^>]*class=["'][^"']*EmbeddedMediaImage/i)
        || pick(/<img[^>]+src=["'](https:\/\/(?:scontent|[\w.-]*fbcdn|[\w.-]*cdninstagram)[^"']+)["']/i) || pick(/"(?:poster|thumbnail_url|preferred_thumbnail)"\s*:\s*\{?[^}]*?"?(?:uri|url)?"?\s*:?\s*"(https:[^"]+)"/i);
      img = img.replace(/\\\//g, "/");
      const cap = pick(/class=["']Caption["'][^>]*>([\s\S]{0,600}?)<\/div>/i).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
      const who = pick(/class=["']UsernameText["'][^>]*>([^<]{1,60})</i) || pick(/class=["'][^"']*(?:_2_79|author)[^"']*["'][^>]*>([^<]{1,60})</i);
      let imgOk = 0, imgKo = 0;
      let b64 = "", mime = "";
      if (img) { try { const ir = UrlFetchApp.fetch(img, { muteHttpExceptions: true }); imgOk = ir.getResponseCode(); const bl = ir.getBlob(), by = bl.getBytes(); imgKo = by.length;
        if (body.img && imgOk === 200 && imgKo < 300000) { b64 = Utilities.base64Encode(by); mime = bl.getContentType() || "image/jpeg"; } } catch (x) { imgOk = -1; } }
      emb = { url: eu, status: e.getResponseCode(), size: t.length, image: img, imageStatus: imgOk, imageBytes: imgKo, caption: cap, author: who, login: /\/login|accounts\/login/i.test(t.slice(0, 5000)), b64: b64, mime: mime };
    }
  } catch (x) { emb = { error: String(x).slice(0, 200) }; }
  return { final: url, chain: chain, status: code, size: html.length, og: og, oembed: oe, embed: emb, fbTries: fbTries, fbReel: fbReel };
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

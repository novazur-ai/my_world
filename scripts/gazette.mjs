// Gazette du matin (MyWorld_0.16) : sans IA ni clé d'API.
// Pour chaque sujet choisi dans les Réglages, on lit des flux RSS de sites d'info français
// (résumé écrit par la rédaction), on extrait 2 ou 3 phrases clés de l'article quand le site le permet
// (calcul de fréquence des mots, pas d'IA), et on repère les chiffres du jour.
// Lancé par .github/workflows/gazette.yml chaque matin vers 6h (heure de Paris).
// Mode essai : ESSAI=1 ESSAI_SUJETS="Monde,rugby" node scripts/gazette.mjs → écrit scripts/sonde/gazette-essai.json
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";

/* ---------- flux et rubriques prêtes ---------- */
const FEEDS = {
  fi_titres: ["franceinfo", "https://www.francetvinfo.fr/titres.rss"],
  fi_monde: ["franceinfo", "https://www.francetvinfo.fr/monde.rss"],
  fi_eco: ["franceinfo", "https://www.francetvinfo.fr/economie.rss"],
  fi_sport: ["franceinfo", "https://www.francetvinfo.fr/sports.rss"],
  lm_une: ["Le Monde", "https://www.lemonde.fr/rss/une.xml"],
  lm_inter: ["Le Monde", "https://www.lemonde.fr/international/rss_full.xml"],
  lm_pixels: ["Le Monde", "https://www.lemonde.fr/pixels/rss_full.xml"],
  vm_une: ["20 Minutes", "https://www.20minutes.fr/feeds/rss-une.xml"],
  vm_nice: ["20 Minutes", "https://www.20minutes.fr/feeds/rss-nice.xml"],
  bfm_info: ["BFM", "https://www.bfmtv.com/rss/news-24-7/"],
  bfm_azur: ["BFM Côte d'Azur", "https://www.bfmtv.com/rss/cote-d-azur/"],
  bfm_tech: ["BFM Tech", "https://www.bfmtv.com/rss/tech/"],
  nicematin: ["Nice-Matin", "https://www.nicematin.com/rss"],
  echos: ["Les Échos", "https://services.lesechos.fr/rss/les-echos-economie.xml"],
  numerama: ["Numerama", "https://www.numerama.com/feed/"],
  frandroid: ["Frandroid", "https://www.frandroid.com/feed"],
  lequipe: ["L'Équipe", "https://dwh.lequipe.fr/api/edito/rss?path=/"],
  of_une: ["Ouest-France", "https://www.ouest-france.fr/rss/une"]
};
export const RUBRIQUES = {
  monde: { feeds: ["fi_monde", "lm_inter"], alias: ["monde", "international", "internationale", "le monde"] },
  france: { feeds: ["fi_titres", "vm_une", "bfm_info"], alias: ["france", "actualite", "actualites", "actu", "a la une", "une"] },
  nice: { feeds: ["vm_nice", "nicematin"], alias: ["nice", "cote d'azur", "cote dazur", "alpes-maritimes", "alpes maritimes", "local", "nice & cote d'azur", "nice et cote d'azur"] },
  eco: { feeds: ["fi_eco", "echos"], alias: ["eco", "economie", "économie"] },
  tech: { feeds: ["numerama", "frandroid", "bfm_tech", "lm_pixels"], alias: ["tech", "technologie", "technologies", "high-tech", "high tech", "numerique"] },
  sport: { feeds: ["fi_sport", "lequipe"], alias: ["sport", "sports"] }
};
const NO_FETCH = /lemonde\.fr|lequipe\.fr|news\.google\./;            /* articles payants ou bloqués : résumé seul */
const PROMO = /bon plan|bons plans|promo|black friday|soldes|\bprix\b|brade|réduction|-\s?\d+\s?%|code promo|meilleure offre|à moins de \d+|sous les \d/i;
const UA = { "User-Agent": "Mozilla/5.0 (compatible; MyWorldGazette/1.0)", "Accept-Language": "fr-FR,fr;q=0.9" };

/* ---------- outils texte ---------- */
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»", hellip: "…", eacute: "é", egrave: "è", agrave: "à", ccedil: "ç", ecirc: "ê", ocirc: "ô", ucirc: "û", icirc: "î", oelig: "œ", ndash: "–", mdash: "—", euro: "€", copy: "©" };
export const decode = (s) => String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&#x([0-9a-f]+);/gi, (_, x) => String.fromCodePoint(parseInt(x, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
const clean = (s) => decode(decode(s)).replace(/<[^>]+>/g, " ").replace(/ /g, " ").replace(/\s+/g, " ").trim();
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "'").trim();
const tag = (b, t) => { const m = b.match(new RegExp("<" + t + "[^>]*>([\\s\\S]*?)</" + t + ">", "i")); return m ? clean(m[1]) : ""; };

async function get(url, ms = 15000){
  const c = new AbortController(); const to = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { headers: UA, signal: c.signal, redirect: "follow" }); return { ok: r.ok, status: r.status, text: r.ok ? await r.text() : "" }; }
  catch (e) { return { ok: false, status: 0, text: "" }; } finally { clearTimeout(to); }
}
const feedCache = new Map();
async function readFeed(key){
  if (feedCache.has(key)) return feedCache.get(key);
  const [source, url] = FEEDS[key];
  const r = await get(url);
  const items = (r.text.match(/<item[\s>][\s\S]*?<\/item>/gi) || []).map((b) => {
    const pub = tag(b, "pubDate") || tag(b, "dc:date");
    let link = tag(b, "link") || ((b.match(/<link[^>]*href="([^"]+)"/) || [])[1] || "");
    return { title: tag(b, "title"), lead: tag(b, "description"), url: link.trim(), source, ts: pub ? Date.parse(pub) || 0 : 0 };
  }).filter((i) => i.title && i.url && !PROMO.test(i.title + " " + i.lead));
  items.forEach((i) => { if (norm(i.lead) === norm(i.title)) i.lead = ""; if (i.lead.length > 420) i.lead = i.lead.slice(0, 417).replace(/\s+\S*$/, "") + "…"; });
  feedCache.set(key, items);
  if (!r.ok) console.warn(`Flux ${key} : ${r.status}`);
  return items;
}
async function googleNews(topic){
  const r = await get("https://news.google.com/rss/search?" + new URLSearchParams({ q: `${topic} when:2d`, hl: "fr", gl: "FR", ceid: "FR:fr" }));
  return (r.text.match(/<item>[\s\S]*?<\/item>/g) || []).map((b) => {
    const source = tag(b, "source"); let title = tag(b, "title");
    if (source && title.endsWith(" - " + source)) title = title.slice(0, -(" - " + source).length);
    const pub = tag(b, "pubDate");
    let src = source || "Google Actualités"; if (/^https?:\/\//.test(src)) { try { src = new URL(src).hostname.replace(/^www\./, ""); } catch (e) {} }
    return { title, lead: "", url: tag(b, "link"), source: src, ts: pub ? Date.parse(pub) : 0 };
  }).filter((i) => i.title && i.url && !PROMO.test(i.title));
}

/* ---------- résumé extractif (sans IA) ---------- */
const STOP = new Set(("a au aux avec ce ces cet cette dans de des du elle elles en et eux il ils je la le les leur leurs lui ma mais me meme mes moi mon ne nos notre nous on ou par pas pour qu que qui sa se ses son sur ta te tes toi ton tu un une vos votre vous ete etre avoir ai as avons avez ont est sont etait etaient sera seront fait faire plus moins tres tout tous toute toutes aussi alors ainsi comme dont donc car si sans sous entre apres avant depuis encore deja selon chez lors puis cela ceci celui celle ceux celles quand comment pourquoi quoi quel quelle quels quelles autre autres peu bien non oui ici cet ans fois deux trois").split(" "));
const words = (s) => (norm(s).match(/[a-z0-9]{3,}/g) || []).filter((w) => !STOP.has(w));
function sentences(text){ return String(text).replace(/\s+/g, " ").split(/(?<=[.!?…])\s+(?=[A-ZÀ-ÖØ-Þ«"“0-9])/).map((s) => s.trim()).filter((s) => s.length >= 40 && s.length <= 360); }
export function summarize(paras, lead, max = 3, maxChars = 460){
  const body = paras.join(" "), sents = sentences(body); if (!sents.length) return "";
  const freq = new Map(); words(body).forEach((w) => freq.set(w, (freq.get(w) || 0) + 1));
  const leadW = new Set(words(lead)), leadN = norm(lead);
  const scored = sents.map((s, i) => {
    const ws = words(s); if (!ws.length) return { s, i, sc: 0 };
    let sc = ws.reduce((a, w) => a + (freq.get(w) || 0) + (leadW.has(w) ? 1.5 : 0), 0) / Math.sqrt(ws.length);
    if (i < 4) sc *= 1.2; if (/\d/.test(s)) sc *= 1.1;
    const sn = norm(s);
    if (leadN && (leadN.includes(sn.slice(0, 60)) || sn.includes(leadN.slice(0, 60)))) sc = 0;          /* déjà dans « L'essentiel » */
    if (/^(lire aussi|a lire|voir aussi|abonnez|inscrivez|newsletter|publicite|cet article|vous avez aime)/.test(sn) || /cookie|©|tous droits|abonne|unsplash|getty|shutterstock|credit photo|photo :|illustration :/.test(sn)) sc = 0;
    return { s, i, sc };
  });
  const pick = scored.filter((x) => x.sc > 0).sort((a, b) => b.sc - a.sc).slice(0, max).sort((a, b) => a.i - b.i);
  let out = ""; for (const p of pick){ if ((out + " " + p.s).length > maxChars) break; out = (out ? out + " " : "") + p.s; }
  return out;
}
async function articleMore(it){
  if (NO_FETCH.test(it.url)) return "";
  const r = await get(it.url, 12000); if (!r.ok) return "";
  const main = (r.text.match(/<article[\s\S]*?<\/article>/i) || [r.text])[0];
  const paras = (main.match(/<p[\s>][\s\S]*?<\/p>/gi) || []).map(clean).filter((p) => p.length > 80 && !/©|cookie|abonnez-vous|newsletter/i.test(p));
  if (paras.join(" ").length < 500) return "";
  return summarize(paras, it.lead);
}

/* ---------- chiffres du jour ---------- */
const PEOPLE = /^(morts?|tues?|victimes?|blesses?|personnes|manifestants|habitants|salaries|emplois|eleves|enfants|familles|deplaces|refugies|spectateurs|participants|interpellations|arrestations|logements|tentes|foyers|abonnes|utilisateurs|clients|kilometres|km|tonnes|hectares|voitures|vehicules|maisons|postes)\b/;
export function keyNumbers(items, n = 3){
  const RX = /(\d{1,3}(?:[  .]\d{3})+|\d+(?:[.,]\d+)?)\s*(%|milliards?|millions?|Md€?|M€|€|euros?|dollars?|\$)?(?:\s+(?:de\s+|d['’])?([a-zàâçéèêëîïôûùüÿœ-]+))?/gi;
  const out = [];
  for (const it of items){
    let best = null;
    for (const t of [it.title, it.lead].filter(Boolean)){
      for (const m of t.matchAll(RX)){
        const raw = m[1], unit = (m[2] || "").trim(), noun = norm(m[3] || "");
        const val = parseFloat(raw.replace(/[  .]/g, "").replace(",", "."));
        if (/(le|la|n°)\s?$/i.test(t.slice(Math.max(0, m.index - 4), m.index))) continue;
        if (val >= 1900 && val <= 2100 && !unit) continue;
        let sc = unit === "%" ? 5 : unit ? 4 : PEOPLE.test(noun) ? (val >= 2 ? 4 : 0) : val >= 1000 ? 3 : 0;
        if (!sc) continue; if (t === it.title) sc += 1;
        const cand = { n: raw.replace(/[ .](?=\d{3}\b)/g, " ") + (/%|€|\$/.test(unit) ? " " + unit : unit ? " " + unit : ""), text: it.lead && it.lead.length <= 200 ? it.lead : it.title, topic: it.topic, url: it.url, score: sc };
        if (!best || cand.score > best.score) best = cand;
      }
    }
    if (best && !/^(tech|sport)$/.test(rubriqueOf(it.topic) || "")) out.push(best);
  }
  const seen = new Set();
  return out.sort((a, b) => b.score - a.score).filter((x) => !seen.has(x.topic) && seen.add(x.topic)).slice(0, n).map(({ score, ...x }) => x);
}

/* ---------- construction des rubriques ---------- */
export function rubriqueOf(topic){ const t = norm(topic); return Object.keys(RUBRIQUES).find((k) => RUBRIQUES[k].alias.includes(t)) || null; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function pool(list, n, fn){ const out = []; let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < list.length){ const k = i++; out[k] = await fn(list[k]); } })); return out; }

export async function build(topics, seen = new Set()){
  const now = Date.now(), taken = new Set(seen), sections = [];
  for (const topic of topics){
    const rub = rubriqueOf(topic);
    let cands = [];
    if (rub){
      for (const f of RUBRIQUES[rub].feeds) cands.push(...(await readFeed(f)));
      cands = cands.filter((i) => (!i.ts || now - i.ts < 36 * 3600e3) && i.lead);
    } else {
      const ws = words(topic);
      for (const f of Object.keys(FEEDS)) cands.push(...(await readFeed(f)));
      cands = cands.filter((i) => (!i.ts || now - i.ts < 4 * 86400e3) && ws.length && ws.every((w) => new RegExp("\\b" + w).test(norm(i.title + " " + i.lead))));
    }
    /* un article par site à tour de rôle, les plus récents d'abord */
    const bySrc = {}; cands.sort((a, b) => b.ts - a.ts).forEach((i) => { (bySrc[i.source] = bySrc[i.source] || []).push(i); });
    const picked = [], max = rub ? 4 : 3, srcs = Object.keys(bySrc);
    for (let r = 0; picked.length < max && r < 10; r++) for (const s of srcs){ const i = bySrc[s][r]; if (i && !taken.has(i.url) && !taken.has(norm(i.title)) && picked.length < max){ picked.push(i); taken.add(i.url); taken.add(norm(i.title)); } }
    if (!rub && picked.length < max){
      for (const g of await googleNews(topic)){ if (picked.length >= max) break; if (!taken.has(g.url) && !taken.has(norm(g.title))){ picked.push(g); taken.add(g.url); taken.add(norm(g.title)); } }
      await sleep(400);
    }
    sections.push({ topic, items: picked.map((i) => ({ ...i, topic })) });
    console.log(`${topic}${rub ? " (rubrique " + rub + ")" : ""} : ${picked.length} article(s)`);
  }
  const all = sections.flatMap((s) => s.items);
  await pool(all, 4, async (it) => { it.more = await articleMore(it); });
  return { sections, numbers: keyNumbers(all) };
}

/* ---------- exécution ---------- */
if (process.env.ESSAI){
  const topics = (process.env.ESSAI_SUJETS || "Monde,France,Nice,Éco,Tech,Sport").split(",").map((s) => s.trim()).filter(Boolean);
  const res = await build(topics);
  writeFileSync("scripts/sonde/gazette-essai.json", JSON.stringify({ at: new Date().toISOString(), ...res }, null, 1));
  console.log("Essai écrit dans scripts/sonde/gazette-essai.json");
} else {
  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}"), UID = process.env.OWNER_UID, FORCE = process.env.FORCE === "true";
  if (!sa.project_id || !UID){ console.error("Secrets FIREBASE_SERVICE_ACCOUNT et OWNER_UID manquants."); process.exit(1); }
  initializeApp({ credential: cert(sa) });
  const db = getFirestore(), base = db.collection("users").doc(UID);
  const p = Object.fromEntries(new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  const day = `${p.year}-${p.month}-${p.day}`, hour = +p.hour;
  const parisDay = (iso) => new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date(iso));
  const settingsRef = base.collection("settings").doc("main"), settings = (await settingsRef.get()).data() || {};
  if (!FORCE){
    if (hour < 6){ console.log(`Il est ${hour}h à Paris : trop tôt, on attend 6h.`); process.exit(0); }
    if (settings.gazetteUpdatedAt && parisDay(settings.gazetteUpdatedAt) === day){ console.log("La Gazette a déjà été mise à jour aujourd'hui."); process.exit(0); }
  }
  const topics = settings.topics || [];
  const gazRef = base.collection("gazette"), existing = await gazRef.get(), seen = new Set();
  existing.forEach((d) => { const g = d.data(); if (g.url) seen.add(g.url); if (g.title) seen.add(norm(g.title)); });
  const { sections, numbers } = await build(topics, seen);
  const batch = db.batch(), addedAt = new Date().toISOString(); let added = 0;
  for (const s of sections) for (const i of s.items){
    const id = "g-" + createHash("sha1").update(i.url).digest("hex").slice(0, 16);
    batch.set(gazRef.doc(id), { topic: s.topic, title: i.title, lead: i.lead || "", more: i.more || "", url: i.url, source: i.source, date: i.ts ? new Date(i.ts).toISOString().slice(0, 10) : null, ts: i.ts || null, lang: "fr", addedAt });
    added++;
  }
  const limitIso = new Date(Date.now() - 30 * 86400000).toISOString();
  existing.forEach((d) => { const a = d.data().addedAt; if (a && a < limitIso) batch.delete(d.ref); });
  batch.set(settingsRef, { gazetteUpdatedAt: addedAt, gazNumbers: numbers }, { merge: true });
  await batch.commit();
  console.log(`Terminé : ${added} article(s), ${numbers.length} chiffre(s) du jour.`);
}

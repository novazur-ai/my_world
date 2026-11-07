// Gazette du matin : lit les sujets du propriétaire dans Firestore, va chercher les actus en français
// sur Google Actualités (flux RSS, sans IA ni clé d'API), et ajoute les nouveaux titres.
// Lancé par .github/workflows/gazette.yml chaque matin vers 6h (heure de Paris).
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createHash } from "node:crypto";

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}");
const UID = process.env.OWNER_UID;
const FORCE = process.env.FORCE === "true";
if (!sa.project_id || !UID){ console.error("Secrets FIREBASE_SERVICE_ACCOUNT et OWNER_UID manquants."); process.exit(1); }

initializeApp({ credential: cert(sa) });
const db = getFirestore();
const base = db.collection("users").doc(UID);

const parisNow = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: +p.hour };
};
const parisDay = (iso) => new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date(iso));

const decode = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ").trim();
const tag = (block, name) => { const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`)); return m ? decode(m[1]) : ""; };

async function fetchTopic(topic){
  const url = "https://news.google.com/rss/search?" + new URLSearchParams({ q: `${topic} when:7d`, hl: "fr", gl: "FR", ceid: "FR:fr" });
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (carnet-gazette)" } });
  if (!r.ok) throw new Error(`RSS ${r.status} pour ${topic}`);
  const xml = await r.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => m[1]).map(b => {
    const source = tag(b, "source");
    let title = tag(b, "title");
    if (source && title.endsWith(" - " + source)) title = title.slice(0, -(" - " + source).length);
    const pub = tag(b, "pubDate");
    return { title, url: tag(b, "link"), source: source || null, date: pub ? new Date(pub).toISOString().slice(0, 10) : null, ts: pub ? Date.parse(pub) : 0 };
  });
  const weekAgo = Date.now() - 7 * 86400000;
  return items.filter(i => i.title && i.url && i.ts >= weekAgo).sort((a, b) => b.ts - a.ts);
}

const now = parisNow();
const settingsRef = base.collection("settings").doc("main");
const settings = (await settingsRef.get()).data() || {};
if (!FORCE){
  if (now.hour < 6){ console.log(`Il est ${now.hour}h à Paris : trop tôt, on attend 6h.`); process.exit(0); }
  if (settings.gazetteUpdatedAt && parisDay(settings.gazetteUpdatedAt) === now.day){ console.log("La Gazette a déjà été mise à jour aujourd'hui."); process.exit(0); }
}
const topics = settings.topics || [];
const gazRef = base.collection("gazette");
const existing = await gazRef.get();
const seenUrls = new Set(), seenTitles = new Set();
existing.forEach(d => { const g = d.data(); if (g.url) seenUrls.add(g.url); if (g.title) seenTitles.add(g.title.toLowerCase()); });

const batch = db.batch();
const addedAt = new Date().toISOString();
let added = 0;
for (const topic of topics){
  try {
    const fresh = (await fetchTopic(topic)).filter(i => !seenUrls.has(i.url) && !seenTitles.has(i.title.toLowerCase())).slice(0, 3);
    for (const i of fresh){
      const id = "g-" + createHash("sha1").update(i.url).digest("hex").slice(0, 16);
      batch.set(gazRef.doc(id), { topic, title: i.title, url: i.url, source: i.source, date: i.date, lang: "fr", addedAt });
      seenTitles.add(i.title.toLowerCase()); added++;
    }
    console.log(`${topic} : ${fresh.length} nouveau(x)`);
  } catch(e){ console.warn(`${topic} : ${e.message}`); }
}
// Nettoyage : on garde 30 jours
const limitIso = new Date(Date.now() - 30 * 86400000).toISOString();
existing.forEach(d => { const a = d.data().addedAt; if (a && a < limitIso) batch.delete(d.ref); });
batch.set(settingsRef, { gazetteUpdatedAt: addedAt }, { merge: true });
await batch.commit();
console.log(`Terminé : ${added} article(s) ajouté(s).`);

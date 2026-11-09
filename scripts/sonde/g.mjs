// Gazette du matin (MyWorld_0.43) : sans IA ni clé d'API.
// On lit les flux RSS de sites d'info français pour tous les sujets choisis dans les Réglages,
// on note chaque article (importance de l'info + goûts appris des notes de Théo), et on garde les 6 meilleurs,
// tous sujets confondus, rangés du plus important au moins important.
// On extrait 2 ou 3 phrases clés de l'article quand le site le permet (calcul de fréquence des mots, pas d'IA)
// et on repère les chiffres du jour.
// Lancé par .github/workflows/gazette.yml chaque matin vers 6h (heure de Paris).
// Mode essai : ESSAI=1 ESSAI_SUJETS="Monde,rugby" node scripts/gazette.mjs → écrit gazette-essai.json (sans Firebase)
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
  of_une: ["Ouest-France", "https://www.ouest-france.fr/rss/une"],
  /* sites spécialisés : servent aux sujets libres (on y cherche les articles qui parlent du sujet) */
  figaro: ["Le Figaro", "https://www.lefigaro.fr/rss/figaro_actualites.xml"],
  libe: ["Libération", "https://www.liberation.fr/arc/outboundfeeds/rss-all/?outputType=xml"],
  parisien: ["Le Parisien", "https://feeds.leparisien.fr/leparisien/rss"],
  jdc: ["Journal du Coin", "https://journalducoin.com/feed/"],
  cryptoast: ["Cryptoast", "https://cryptoast.fr/feed/"],
  coinacademy: ["Coin Academy", "https://coinacademy.fr/feed/"],
  cointribune: ["Cointribune", "https://www.cointribune.com/feed/"],
  cryptonaute: ["Cryptonaute", "https://cryptonaute.fr/feed/"],
  jvcom: ["Jeuxvideo.com", "https://www.jeuxvideo.com/rss/rss.xml"],
  gamekult: ["Gamekult", "https://www.gamekult.com/feed.xml"],
  pokebip: ["Pokébip", "https://www.pokebip.com/news.rss"],
  pktrash: ["Pokémon Trash", "https://www.pokemontrash.com/flux.rss"]
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
const NAV = { "User-Agent": "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36", "Accept-Language": "fr-FR,fr;q=0.9" };

/* ---------- outils texte ---------- */
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»", hellip: "…", eacute: "é", egrave: "è", agrave: "à", ccedil: "ç", ecirc: "ê", ocirc: "ô", ucirc: "û", icirc: "î", oelig: "œ", ndash: "–", mdash: "—", euro: "€", copy: "©" };
export const decode = (s) => String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&#x([0-9a-f]+);/gi, (_, x) => String.fromCodePoint(parseInt(x, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
const clean = (s) => decode(decode(s)).replace(/<[^>]+>/g, " ").replace(/ /g, " ").replace(/\s+/g, " ").trim();
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "'").trim();
const tag = (b, t) => { const m = b.match(new RegExp("<" + t + "[^>]*>([\\s\\S]*?)</" + t + ">", "i")); return m ? clean(m[1]) : ""; };

async function get(url, ms = 15000, opt = {}){
  const c = new AbortController(); const to = setTimeout(() => c.abort(), ms);
  try {
    const go = (h) => fetch(url, { method: opt.method || "GET", body: opt.body, headers: { ...h, ...(opt.headers || {}) }, signal: c.signal, redirect: "follow" });
    let r = await go(opt.nav ? NAV : UA);
    if (!r.ok && !opt.nav && [403, 406, 429].includes(r.status)) r = await go(NAV);     /* certains sites refusent les robots : on se présente comme un navigateur */
    return { ok: r.ok, status: r.status, url: r.url, text: r.ok ? await r.text() : "" };
  }
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

/* Les liens Google Actualités cachent l'adresse du vrai article : on la récupère auprès de Google
   (même méthode que la page Google Actualités elle-même), pour pouvoir lire le résumé du site. */
async function googleReal(link){
  try {
    const id = (link.split("/articles/")[1] || "").split("?")[0]; if (!id) return "";
    const p = await get("https://news.google.com/articles/" + id, 12000, { nav: true });
    const sg = (p.text.match(/data-n-a-sg="([^"]+)"/) || [])[1], ts = (p.text.match(/data-n-a-ts="([^"]+)"/) || [])[1];
    if (!sg || !ts) return "";
    const req = [[["Fbv4je", JSON.stringify(["garturlreq", [["X", "X", ["X", "X"], null, null, 1, 1, "US:en", null, 1, null, null, null, null, null, 0, 1], "X", "X", 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0], id, +ts, sg]), null, "generic"]]];
    const r = await get("https://news.google.com/_/DotsSplashUi/data/batchexecute", 12000, { nav: true, method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" }, body: "f.req=" + encodeURIComponent(JSON.stringify(req)) });
    const url = JSON.parse(JSON.parse(r.text.split("\n\n")[1])[0][2])[1];
    return /^https?:\/\//.test(url) ? url : "";
  } catch (e) { return ""; }
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
/* résumé écrit par le site lui-même, présent dans chaque page d'article (balise « description ») */
function pageDesc(html){
  const m = (n) => html.match(new RegExp('<meta[^>]+(?:property|name)=["\']' + n + '["\'][^>]*content=["\']([^"\']+)', "i")) || html.match(new RegExp('<meta[^>]+content=["\']([^"\']+)["\'][^>]*(?:property|name)=["\']' + n + '["\']', "i"));
  return clean((m("og:description") || m("description") || [])[1] || "");
}
/* description générique d'un site (« Toute l'actualité Pokémon… ») : ce n'est pas un résumé */
const GENERIC = /^(toute l'actu|toute l’actu|retrouvez (toute|tous|l'actu)|découvrez (toute|tous)|l'actualité (de|du|des) |site officiel|bienvenue sur)|pokédex, guides/i;
function dropSiteDescs(items){
  const n = new Map(); items.forEach((it) => { if (it._desc) n.set(norm(it.lead), (n.get(norm(it.lead)) || 0) + 1); });
  items.forEach((it) => { if (it._desc && n.get(norm(it.lead)) > 1){ it.lead = it._rss || ""; } delete it._desc; delete it._rss; });
}
async function enrich(it){
  if (/news\.google\./.test(it.url)){ const real = await googleReal(it.url); if (real) it.url = real; await sleep(300); }
  if (NO_FETCH.test(it.url)) return;
  const r = await get(it.url, 12000); if (!r.ok) return;
  if (!it.lead || it.lead.length < 100){
    let d = pageDesc(r.text);
    if (d.length >= 60 && norm(d) !== norm(it.title) && !PROMO.test(d) && !GENERIC.test(d)){ if (d.length > 420) d = d.slice(0, 417).replace(/\s+\S*$/, "") + "…"; it._rss = it.lead; it.lead = d; it._desc = true; }
  }
  const main = (r.text.match(/<article[\s\S]*?<\/article>/i) || [r.text])[0];
  const paras = (main.match(/<p[\s>][\s\S]*?<\/p>/gi) || []).map(clean).filter((p) => p.length > 80 && !/©|cookie|abonnez-vous|newsletter/i.test(p));
  if (paras.join(" ").length >= 500) it.more = summarize(paras, it.lead);
  if (!it.lead && it.more){ it.lead = it.more; it.more = ""; }        /* pas de description : les phrases clés deviennent « L'essentiel » */
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

/* ---------- « À la une » : l'info reprise par le plus de journaux nationaux ---------- */
const UNES = ["fi_titres", "lm_une", "vm_une", "bfm_info", "figaro", "libe", "of_une", "parisien", "echos"];
const USTOP = new Set("les des une pour dans avec sur par est sont aux qui que pas plus son ses leur leurs ont ete etre cette ces apres avant entre selon contre sans sous lors ainsi alors comme dont tout tous mais fait faire deux trois nouveau nouvelle nouvelles premier premiere france francais francaise direct video photos images quoi comment pourquoi depuis encore deja tres bien vers chez annonce veut".split(" "));
const uw = (s) => new Set((norm(s).match(/[a-z0-9]{4,}/g) || []).filter((w) => !USTOP.has(w)).map((w) => w.replace(/s$/, "")));
export async function topStory(){
  const now = Date.now(), arts = [];
  for (const k of UNES){
    const src = FEEDS[k][0]; let n = 0;
    for (const i of await readFeed(k)){ if (i.ts && now - i.ts > 18 * 3600e3) continue; if (n++ >= 25) break; arts.push({ ...i, src, w: uw(i.title + " " + i.lead), tw: uw(i.title) }); }
  }
  if (arts.length < 10) return null;
  const df = new Map(); arts.forEach((a) => a.w.forEach((w) => df.set(w, (df.get(w) || 0) + 1)));
  const idf = (w) => Math.log(arts.length / (df.get(w) || 1));
  /* même événement = au moins 2 mots de titre rares (noms de lieux, de personnes…) en commun */
  const sim = (a, b) => { const sh = new Set([...a.tw].filter((w) => b.w.has(w)).concat([...b.tw].filter((w) => a.w.has(w)))); const rare = [...sh].filter((w) => (df.get(w) || 0) <= 6); return rare.length >= 2 ? rare.reduce((x, w) => x + idf(w), 0) : 0; };
  const cl = [];
  for (const a of arts){ let best = null, bs = 0; for (const c of cl){ const v = sim(a, c[0]); if (v > bs){ bs = v; best = c; } } if (best && bs >= 6) best.push(a); else cl.push([a]); }
  const ranked = cl.map((c) => {
    const ok = c.length < 3 ? c : c.filter((a) => c.filter((b) => b !== a && sim(a, b) >= 6).length >= 2);      /* écarte un article rattaché par erreur */
    return { items: ok, srcs: new Set(ok.map((a) => a.src)) };
  }).sort((a, b) => b.srcs.size - a.srcs.size || b.items.length - a.items.length);
  const top = ranked[0]; if (!top || top.srcs.size < 3) return null;
  /* article retenu : le plus central, de préférence avec un résumé, un titre court et lisible sans abonnement */
  const pick = top.items.map((a) => ({ a, sc: top.items.reduce((x, b) => x + (b === a ? 0 : sim(a, b)), 0) + (a.lead.length >= 80 ? 8 : 0) + (NO_FETCH.test(a.url) ? 0 : 4) - (a.title.length > 110 ? 8 : 0) })).sort((x, y) => y.sc - x.sc)[0].a;
  const it = { title: pick.title, lead: pick.lead, url: pick.url, source: pick.source, ts: pick.ts };
  await enrich(it); dropSiteDescs([it]);
  console.log(`À la une (${top.srcs.size} journaux sur ${UNES.length}) : ${it.title}`);
  return { title: it.title, lead: it.lead || "", more: it.more || "", url: it.url, source: it.source || "", ts: it.ts || null, papers: top.srcs.size };
}

/* ---------- construction des rubriques ---------- */
export function rubriqueOf(topic){ const t = norm(topic); return Object.keys(RUBRIQUES).find((k) => RUBRIQUES[k].alias.includes(t)) || null; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function pool(list, n, fn){ const out = []; let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < list.length){ const k = i++; out[k] = await fn(list[k]); } })); return out; }

/* ---------- choix des 6 infos du jour ---------- */
/* mots d'une info grave ou d'intérêt général (texte sans accents, en minuscules) */
const GRAVE = /\b(attentats?|explosions?|seismes?|tremblement de terre|guerres?|cessez-le-feu|bombardements?|frappes?|missiles?|otages?|fusillades?|tues?|tuees?|morts?|deces|victimes|blesses|evacu\w*|manifestations?|manifestants|greves?|grevistes|mobilisation|emeutes?|alerte (?:rouge|orange)|vigilance (?:rouge|orange)|inondations?|crues?|incendies?|tempetes?|ouragans?|cyclones?|canicule|elections?|scrutin|referendum|gouvernement|premier ministre|president de la republique|elysee|matignon|assemblee nationale|senat|49\.3|motion de censure|dissolution|remaniement|budget|reformes?|projet de loi|proces|verdict|condamne\w*|mis en examen|crise|penurie|inflation|chomage|retraites?|impots?|accident|catastrophe|pandemie|epidemie)\b/g;
/* contenus « pratiques » ou de divertissement : moins importants */
const SOFT = /\b(guide|astuces?|comment |pourquoi |quiz|horoscope|on a teste|nos conseils|les \d+ meilleur|top \d+|notre selection|en images|people|star academy|tele-?realite|recettes?|bon plan|code promo|test du|test de la)\b/;
const LOCAL = /\bcagnes\b/;
/* les grands titres des journaux nationaux (30 h), pour mesurer combien de rédactions parlent d'une info */
let NAT = null;
async function national(){
  if (NAT) return NAT;
  const now = Date.now(), arts = [];
  for (const k of UNES){ const src = FEEDS[k][0]; let n = 0; for (const i of await readFeed(k)){ if (i.ts && now - i.ts > 30 * 3600e3) continue; if (n++ >= 40) break; arts.push({ ...i, src, w: uw(i.title + " " + i.lead), tw: uw(i.title) }); } }
  const df = new Map(); arts.forEach((a) => a.w.forEach((w) => df.set(w, (df.get(w) || 0) + 1)));
  const idf = (w) => Math.log((arts.length + 1) / (df.get(w) || 1));
  const sim = (a, b) => { const sh = new Set([...a.tw].filter((w) => b.w.has(w)).concat([...b.tw].filter((w) => a.w.has(w)))); const rare = [...sh].filter((w) => (df.get(w) || 0) <= 6); return rare.length >= 2 ? rare.reduce((x, w) => x + idf(w), 0) : 0; };
  /* même info pour compter les journaux : au moins 2 mots rares en commun entre les deux titres */
  const cov = (a, b) => [...a.tw].filter((w) => b.tw.has(w) && (df.get(w) || 0) <= 6).length >= 2;
  return (NAT = { arts, sim, cov });
}
/* goûts appris : notes de Théo (pertinent +1, moyen 0, pas pertinent -1) par sujet, par site et par mot du titre */
export function learnModel(rates){
  const T = {}, Sx = {}, W = {}, add = (m, k, r) => { const v = m[k] || (m[k] = [0, 0]); v[0] += r; v[1]++; };
  let n = 0;
  for (const x of Object.values(rates || {})){ if (!x || typeof x.r !== "number") continue; n++; if (x.t) add(T, x.t, x.r); if (x.s) add(Sx, x.s, x.r); for (const w of uw(x.ti || "")) add(W, w, x.r); }
  return { T, S: Sx, W, n };
}
function prefScore(m, it){
  if (!m || !m.n) return 0;
  const f = (v, k) => (v ? v[0] / (v[1] + k) : 0);
  const ws = [...uw(it.title)].map((w) => f(m.W[w], 2)).filter((x) => x);
  const wsc = ws.length ? ws.reduce((a, b) => a + b, 0) / Math.sqrt(ws.length) : 0;
  return 3 * f(m.T[it.topic], 3) + 1.5 * f(m.S[it.source], 3) + Math.max(-3, Math.min(3, 2 * wsc));
}
const r1 = (x) => Math.round(x * 10) / 10;
export async function build(topics, seen = new Set(), rates = {}, N_PICK = 6){
  const now = Date.now(), model = learnModel(rates), C = [], urls = new Set();
  for (const topic of topics){
    const rub = rubriqueOf(topic);
    let cands = [];
    if (rub){
      for (const f of RUBRIQUES[rub].feeds) cands.push(...(await readFeed(f)));
      cands = cands.filter((i) => (!i.ts || now - i.ts < 36 * 3600e3) && i.lead);
    } else {
      const ws = words(topic);
      for (const f of Object.keys(FEEDS)) cands.push(...(await readFeed(f)));
      cands = cands.filter((i) => (!i.ts || now - i.ts < 3 * 86400e3) && ws.length && ws.every((w) => new RegExp("\\b" + w).test(norm(i.title + " " + i.lead))));
      if (cands.length < 6){ cands.push(...(await googleNews(topic)).filter((g) => !g.ts || now - g.ts < 2 * 86400e3).slice(0, 10)); await sleep(400); }
    }
    let n = 0;
    for (const i of cands){ if (seen.has(i.url) || seen.has(norm(i.title)) || urls.has(i.url)) continue; urls.add(i.url); C.push({ ...i, topic }); n++; }
    console.log(`${topic}${rub ? " (rubrique " + rub + ")" : ""} : ${n} candidat(s)`);
  }
  let une = null; try { une = await topStory(); } catch (e) { console.warn("À la une : " + e.message); }
  const N = await national(), uneA = une ? { w: uw(une.title + " " + une.lead), tw: uw(une.title) } : null;
  for (const it of C){
    it.w = uw(it.title + " " + it.lead); it.tw = uw(it.title);
    const srcs = new Set([it.source]); for (const a of N.arts) if (N.cov(it, a)) srcs.add(a.src);
    const t = norm(it.title), l = norm(it.lead), age = it.ts ? (now - it.ts) / 3600e3 : 30;
    const gt = new Set(t.match(GRAVE) || []).size, gl = new Set(l.match(GRAVE) || []).size;
    it.parts = {
      reprise: srcs.size > 1 ? r1(4 * Math.log2(srcs.size)) : 0,           /* nombre de journaux qui en parlent */
      gravite: Math.min(6, 2.5 * gt + gl),                                  /* info grave ou d'intérêt général */
      cagnes: LOCAL.test(t + " " + l) ? 2 : 0,
      leger: SOFT.test(t) ? -3 : 0,
      fraicheur: age < 6 ? 2 : age < 12 ? 1 : age < 24 ? 0 : age < 48 ? -2 : -4,
      qualite: (it.lead && it.lead.length >= 80 ? 1 : -1) + (/news\.google\./.test(it.url) ? -1 : 0),
      gouts: r1(prefScore(model, it))                                       /* appris des notes */
    };
    it.score = Object.values(it.parts).reduce((a, b) => a + b, 0);
    it.srcs = srcs.size;
  }
  /* les meilleurs, une seule fois par événement, sans reprendre « À la une », et un peu de variété entre sujets */
  const same = (a, b) => norm(a.title) === norm(b.title) || N.sim(a, b) >= 6, picked = [], per = {};
  const pool0 = C.filter((it) => !(uneA && N.sim(it, uneA) >= 6)).sort((a, b) => b.score - a.score);
  while (picked.length < N_PICK){
    let best = null, bs = -1e9;
    for (const it of pool0){ if (it.used || picked.some((p) => same(p, it))) continue; const s = it.score - 1.5 * (per[it.topic] || 0); if (s > bs){ bs = s; best = it; } }
    if (!best) break;
    best.used = true; best.final = r1(bs); per[best.topic] = (per[best.topic] || 0) + 1; picked.push(best);
  }
  await pool(picked, 3, enrich); dropSiteDescs(picked);
  console.log(`\nCandidats : ${C.length} · notes apprises : ${model.n}`);
  picked.forEach((it, i) => console.log(`${i + 1}. [${it.final}] ${it.topic} · ${it.source} · ${it.title}\n     ${JSON.stringify(it.parts)} (${it.srcs} journal/aux)`));
  const numbers = keyNumbers(pool0.slice(0, 20));
  const items = picked.map((it, i) => ({ title: it.title, lead: it.lead || "", more: it.more || "", url: it.url, source: it.source, ts: it.ts || null, topic: it.topic, rank: i + 1, score: it.final, why: it.parts }));
  return { items, numbers, une, cands: C.length };
}

/* ---------- exécution ---------- */
if (process.env.ESSAI){
  const topics = (process.env.ESSAI_SUJETS || "Monde,France,Nice,Éco,Tech,Sport").split(",").map((s) => s.trim()).filter(Boolean);
  const res = await build(topics);
  writeFileSync("gazette-essai.json", JSON.stringify({ at: new Date().toISOString(), ...res }, null, 1));
  console.log("Essai écrit dans gazette-essai.json");
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
  const topics = settings.topics || [], rates = settings.gazRates || {};
  const gazRef = base.collection("gazette"), existing = await gazRef.get(), seen = new Set();
  /* déjà publiées les jours précédents : on ne les repropose pas ; celles d'aujourd'hui peuvent être reclassées */
  existing.forEach((d) => { const g = d.data(); if (g.addedAt && parisDay(g.addedAt) === day) return; if (g.url) seen.add(g.url); if (g.title) seen.add(norm(g.title)); });
  const { items, numbers, une } = await build(topics, seen, rates);
  if (process.env.SONDE){ console.log("Mode sonde : rien n'est écrit."); process.exit(0); }
  const batch = db.batch(), addedAt = new Date().toISOString(); let added = 0;
  /* les infos déjà publiées aujourd'hui sans résumé (titre seul) sont complétées */
  const bare = []; existing.forEach((d) => { const g = d.data(); if ((!g.lead || GENERIC.test(g.lead)) && g.addedAt && parisDay(g.addedAt) === day && !items.some((i) => i.url === g.url) && rates[d.id]) bare.push({ ref: d.ref, old: g.lead || "", it: { title: g.title, url: g.url, lead: "" } }); });
  await pool(bare, 3, (b) => enrich(b.it)); dropSiteDescs(bare.map((b) => b.it));
  let fixed = 0; for (const b of bare) if (b.it.lead || b.old){ batch.update(b.ref, { lead: b.it.lead || "", more: b.it.more || "", url: b.it.url }); if (b.it.lead) fixed++; }
  if (bare.length) console.log(`Infos d'aujourd'hui sans résumé : ${bare.length}, complétées : ${fixed}`);
  const keep = new Set();
  for (const i of items){
    const id = "g-" + createHash("sha1").update(i.url).digest("hex").slice(0, 16); keep.add(id);
    batch.set(gazRef.doc(id), { topic: i.topic, title: i.title, lead: i.lead || "", more: i.more || "", url: i.url, source: i.source, date: i.ts ? new Date(i.ts).toISOString().slice(0, 10) : null, ts: i.ts || null, lang: "fr", addedAt, rank: i.rank, score: i.score, why: i.why });
    added++;
  }
  /* nouvelle sélection le même jour : les infos d'aujourd'hui qui n'en font plus partie sont retirées (sauf si notées) */
  existing.forEach((d) => { const g = d.data(); if (g.addedAt && parisDay(g.addedAt) === day && !keep.has(d.id) && !rates[d.id]) batch.delete(d.ref); });
  const limitIso = new Date(Date.now() - 30 * 86400000).toISOString();
  existing.forEach((d) => { const a = d.data().addedAt; if (a && a < limitIso) batch.delete(d.ref); });
  /* chiffres du jour gardés jour par jour (30 jours) ; une 2e mise à jour le même jour ne les efface pas */
  const days = settings.gazDays || {}, prev = days[day] || {};
  const dayNums = numbers.length ? numbers : (prev.numbers || []);
  const upd = { gazetteUpdatedAt: addedAt, gazNumbers: dayNums, gazDays: { [day]: { numbers: dayNums, count: added, at: addedAt, une: une || prev.une || null } } };
  const { FieldValue } = await import("firebase-admin/firestore");
  const limitDay = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  Object.keys(days).filter((k) => k < limitDay).forEach((k) => { upd["gazDays." + k] = FieldValue.delete(); });
  batch.set(settingsRef, { gazetteUpdatedAt: upd.gazetteUpdatedAt, gazNumbers: upd.gazNumbers, gazDays: upd.gazDays }, { merge: true });
  const old = Object.keys(upd).filter((k) => k.startsWith("gazDays."));
  if (old.length) batch.update(settingsRef, Object.fromEntries(old.map((k) => [k, upd[k]])));
  await batch.commit();
  console.log(`Terminé : ${added} article(s), ${numbers.length} chiffre(s) du jour.`);
}

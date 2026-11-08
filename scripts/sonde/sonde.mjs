/* Sonde (test ponctuel) : quels flux RSS français donnent un résumé, et peut-on lire le début des articles ?
   Lancée par GitHub Actions ; écrit scripts/sonde/resultat.json. Pas utilisée par l'appli. */
import { writeFileSync } from "node:fs";
const FEEDS = {
  "franceinfo · titres": "https://www.francetvinfo.fr/titres.rss",
  "franceinfo · monde": "https://www.francetvinfo.fr/monde.rss",
  "franceinfo · éco": "https://www.francetvinfo.fr/economie.rss",
  "franceinfo · sport": "https://www.francetvinfo.fr/sports.rss",
  "Le Monde · une": "https://www.lemonde.fr/rss/une.xml",
  "Le Monde · international": "https://www.lemonde.fr/international/rss_full.xml",
  "Le Monde · Pixels": "https://www.lemonde.fr/pixels/rss_full.xml",
  "20 Minutes · une": "https://www.20minutes.fr/feeds/rss-une.xml",
  "20 Minutes · Nice": "https://www.20minutes.fr/feeds/rss-nice.xml",
  "BFM · info": "https://www.bfmtv.com/rss/news-24-7/",
  "BFM · Côte d'Azur": "https://www.bfmtv.com/rss/cote-d-azur/",
  "BFM · tech": "https://www.bfmtv.com/rss/tech/",
  "Nice-Matin": "https://www.nicematin.com/rss",
  "Les Échos · éco": "https://services.lesechos.fr/rss/les-echos-economie.xml",
  "Numerama": "https://www.numerama.com/feed/",
  "Frandroid": "https://www.frandroid.com/feed",
  "L'Équipe": "https://dwh.lequipe.fr/api/edito/rss?path=/",
  "Ouest-France · une": "https://www.ouest-france.fr/rss/une"
};
const UA = { "User-Agent": "Mozilla/5.0 (compatible; MyWorldGazette/1.0)", "Accept-Language": "fr-FR,fr;q=0.9" };
const strip = (s) => String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;|&#39;|&apos;/g, "'").replace(/&rsquo;/g, "’").replace(/\s+/g, " ").trim();
const tag = (b, t) => { const m = b.match(new RegExp("<" + t + "[^>]*>([\\s\\S]*?)</" + t + ">", "i")); return m ? strip(m[1]) : ""; };
async function get(url){ const c = new AbortController(); const to = setTimeout(() => c.abort(), 15000); try { const r = await fetch(url, { headers: UA, signal: c.signal, redirect: "follow" }); return { status: r.status, text: await r.text() }; } catch (e) { return { status: 0, text: "", err: String(e.message || e) }; } finally { clearTimeout(to); } }
const out = { at: new Date().toISOString(), feeds: {} };
for (const [name, url] of Object.entries(FEEDS)){
  const f = await get(url), res = { url, status: f.status, err: f.err || null };
  const items = (f.text.match(/<item[\s>][\s\S]*?<\/item>/gi) || []);
  res.items = items.length;
  res.sample = items.slice(0, 3).map((b) => ({ title: tag(b, "title").slice(0, 140), desc: tag(b, "description").slice(0, 300), link: tag(b, "link") || (b.match(/<link[^>]*href="([^"]+)"/) || [])[1] || "", image: /<enclosure|<media:content|<media:thumbnail/.test(b) }));
  res.descMoy = items.length ? Math.round(items.slice(0, 10).reduce((a, b) => a + tag(b, "description").length, 0) / Math.min(10, items.length)) : 0;
  const link = res.sample[0] && res.sample[0].link;
  if (link){
    const a = await get(link);
    const paras = (a.text.match(/<p[\s>][\s\S]*?<\/p>/gi) || []).map(strip).filter((p) => p.length > 80);
    res.article = { status: a.status, err: a.err || null, paragraphes: paras.length, caracteres: paras.join(" ").length, debut: paras.slice(0, 2).join(" ").slice(0, 400), payant: /abonn[ée]s?|réservé aux abonnés|paywall/i.test(a.text.slice(0, 200000)) };
  }
  out.feeds[name] = res;
  console.log(name, res.status, res.items, "desc moy", res.descMoy, "article", res.article && res.article.caracteres);
}
writeFileSync("scripts/sonde/resultat.json", JSON.stringify(out, null, 1));

const NAV = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const UNES = { "franceinfo": "https://www.francetvinfo.fr/titres.rss", "Le Monde": "https://www.lemonde.fr/rss/une.xml", "20 Minutes": "https://www.20minutes.fr/feeds/rss-une.xml", "BFM": "https://www.bfmtv.com/rss/news-24-7/", "Le Figaro": "https://www.lefigaro.fr/rss/figaro_actualites.xml", "Libération": "https://www.liberation.fr/arc/outboundfeeds/rss-all/?outputType=xml", "Ouest-France": "https://www.ouest-france.fr/rss/une", "Le Parisien": "https://feeds.leparisien.fr/leparisien/rss", "Les Échos": "https://services.lesechos.fr/rss/les-echos-economie.xml" };
async function get(u){ try { const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0 (compatible; MyWorldGazette/1.0)" } }); return await r.text(); } catch (e) { return ""; } }
const clean = (s) => String(s||"").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").replace(/<[^>]+>/g," ").replace(/&#0?39;|&rsquo;/g,"'").replace(/&[a-z#0-9]+;/gi," ").replace(/\s+/g," ").trim();
const tag = (b,t) => { const m = b.match(new RegExp("<"+t+"[^>]*>([\\s\\S]*?)</"+t+">","i")); return m ? clean(m[1]) : ""; };
const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");
const STOP = new Set("les des une pour dans avec sur par est sont aux qui que pas plus son ses leur leurs ont ete etre cette ces apres avant entre selon contre sans sous lors ainsi alors comme dont tout tous mais fait faire deux trois nouveau nouvelle nouvelles premier premiere france francais francaise direct video photos images quoi comment pourquoi depuis encore deja tres bien vers chez annonce veut".split(" "));
const W = (s) => new Set((norm(s).match(/[a-z0-9]{4,}/g)||[]).filter(w=>!STOP.has(w)).map(w=>w.replace(/s$/,"")));
const now = Date.now(), arts = [];
for (const [src,u] of Object.entries(UNES)){
  const t = await get(u); const items = (t.match(/<item[\s>][\s\S]*?<\/item>/gi)||[]);
  let n = 0;
  for (const b of items){ const ts = Date.parse(tag(b,"pubDate")) || 0; if (ts && now - ts > 18*3600e3) continue; if (n >= 25) break;
    const title = tag(b,"title"), lead = tag(b,"description"); arts.push({ src, title, lead, w: W(title + " " + lead), tw: W(title), ts, url: tag(b,"link") }); n++; }
  console.log(src, items.length, "→", n, "récents");
}
const df = new Map(); arts.forEach(a => a.w.forEach(w => df.set(w, (df.get(w)||0)+1)));
const N = arts.length, idf = (w) => Math.log(N / (df.get(w)||1));
/* deux articles parlent du même sujet s'ils partagent au moins 2 mots de titre distinctifs (rares dans l'ensemble des unes) */
const sim = (a,b) => { const sh = new Set([...a.tw].filter(w=>b.w.has(w)).concat([...b.tw].filter(w=>a.w.has(w)))); const rare = [...sh].filter(w => (df.get(w)||0) <= 6); return rare.length >= 2 ? rare.reduce((x,w)=>x+idf(w),0) : 0; };
const clusters = [];
for (const a of arts){ let best=null, bs=0; for (const c of clusters){ const s = sim(a, c.items[0]); if (s>bs){bs=s;best=c;} } if (best && bs>=6) best.items.push(a); else clusters.push({ items:[a] }); }
for (const c of clusters){ c.srcs = new Set(c.items.map(x=>x.src)); c.score = c.srcs.size*10 + c.items.length; }
clusters.sort((a,b)=>b.score-a.score);
for (const c of clusters.slice(0,6)){ console.log(`\n=== ${c.srcs.size} journaux, ${c.items.length} articles : ${[...c.srcs].join(", ")}`); c.items.slice(0,7).forEach(x=>console.log(`   [${x.src}] ${x.title.slice(0,110)}`)); }

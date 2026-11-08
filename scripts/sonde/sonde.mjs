const UAS = { bot: "Mozilla/5.0 (compatible; MyWorldGazette/1.0)", nav: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36" };
async function get(url, ua = "nav"){ const c = new AbortController(); const t = setTimeout(() => c.abort(), 15000);
  try { const r = await fetch(url, { headers: { "User-Agent": UAS[ua], "Accept-Language": "fr-FR,fr;q=0.9", "Accept": "text/html,application/xml,application/rss+xml,*/*" }, signal: c.signal, redirect: "follow" }); return { s: r.status, u: r.url, t: await r.text() }; }
  catch (e) { return { s: 0, u: url, t: "" }; } finally { clearTimeout(t); } }
const clean = (s) => String(s||"").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").replace(/<[^>]+>/g," ").replace(/&[a-z#0-9]+;/gi," ").replace(/\s+/g," ").trim();
const tag = (b,t) => { const m = b.match(new RegExp("<"+t+"[^>]*>([\\s\\S]*?)</"+t+">","i")); return m ? clean(m[1]) : ""; };
const meta = (h) => clean((h.match(/<meta[^>]+(?:property|name)=["'](?:og:description|description)["'][^>]*content=["']([^"']+)/i) || h.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:description|description)["']/i) || [])[1] || "");
const paras = (h) => ((h.match(/<article[\s\S]*?<\/article>/i)||[h])[0].match(/<p[\s>][\s\S]*?<\/p>/gi)||[]).map(clean).filter(p=>p.length>80).join(" ").length;
async function feed(name, url){
  const r = await get(url); const items = r.t.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  const it = items.slice(0,3).map(b => ({ title: tag(b,"title").slice(0,70), desc: tag(b,"description").length, link: (tag(b,"link")||"").slice(0,90) }));
  console.log(`\n## ${name} [${r.s}] ${items.length} items`); it.forEach(i => console.log(`  - ${i.title} | desc ${i.desc} car | ${i.link}`));
  return items;
}
const CANDS = {
  "Bing Pokémon": "https://www.bing.com/news/search?q=Pok%C3%A9mon&format=rss&mkt=fr-FR&setlang=fr-FR",
  "Bing Crypto": "https://www.bing.com/news/search?q=crypto&format=rss&mkt=fr-FR&setlang=fr-FR",
  "Bing Bitcoin": "https://www.bing.com/news/search?q=bitcoin&format=rss&cc=FR&setlang=fr",
  "JournalDuCoin": "https://journalducoin.com/feed/", "Cryptoast": "https://cryptoast.fr/feed/", "CoinAcademy": "https://coinacademy.fr/feed/", "Cointribune": "https://www.cointribune.com/feed/", "Cryptonaute": "https://cryptonaute.fr/feed/",
  "PokemonTrash rss.xml": "https://www.pokemontrash.com/rss.xml", "PokemonTrash feed": "https://www.pokemontrash.com/feed", "Pokebip rss": "https://www.pokebip.com/rss", "Pokebip rss/news": "https://www.pokebip.com/rss/news", "Pokekalos rss": "https://www.pokekalos.fr/rss.xml", "Pokekalos rss2": "https://www.pokekalos.fr/rss",
  "JV.com": "https://www.jeuxvideo.com/rss/rss.xml", "Millenium": "https://www.millenium.org/rss", "Gamekult": "https://www.gamekult.com/feed.xml",
  "Nice-Matin (nav)": "https://www.nicematin.com/rss"
};
const all = {};
for (const [n,u] of Object.entries(CANDS)) all[n] = await feed(n,u);
const nb = await get("https://www.nicematin.com/rss","bot"); console.log("\nNice-Matin UA bot :", nb.s, "| UA nav :", (await get("https://www.nicematin.com/rss")).s);
/* page article : résumé de la page (meta description) et paragraphes */
console.log("\n## Pages d'articles (Bing)");
for (const n of ["Bing Pokémon","Bing Crypto"]) for (const b of all[n].slice(0,6)){
  let link = tag(b,"link"); const m = link.match(/[?&]url=([^&]+)/); if (m) link = decodeURIComponent(m[1]);
  const r = await get(link); console.log(`  [${r.s}] ${new URL(r.u||link).hostname} | meta ${meta(r.t).length} car | paragraphes ${paras(r.t)} car | « ${meta(r.t).slice(0,110)} »`);
}
console.log("\n## Google Actualités : lien → vrai article ?");
const g = await get("https://news.google.com/rss/search?q=Pok%C3%A9mon%20when:2d&hl=fr&gl=FR&ceid=FR:fr");
const gl = ((g.t.match(/<item>[\s\S]*?<\/item>/) || [""])[0].match(/<link>([^<]+)/) || [])[1];
if (gl){ const r = await get(gl); console.log("  ", r.s, r.u.slice(0,100), "| meta", meta(r.t).length); }

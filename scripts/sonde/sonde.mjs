const NAV = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
async function get(url, opt = {}){ const c = new AbortController(); const t = setTimeout(() => c.abort(), 15000);
  try { const r = await fetch(url, { headers: { "User-Agent": NAV, "Accept-Language": "fr-FR,fr;q=0.9", ...(opt.headers||{}) }, method: opt.method || "GET", body: opt.body, signal: c.signal, redirect: "follow" }); return { s: r.status, u: r.url, t: await r.text() }; }
  catch (e) { return { s: 0, u: url, t: "" }; } finally { clearTimeout(t); } }
const clean = (s) => String(s||"").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").replace(/<[^>]+>/g," ").replace(/&[a-z#0-9]+;/gi," ").replace(/\s+/g," ").trim();
const tag = (b,t) => { const m = b.match(new RegExp("<"+t+"[^>]*>([\\s\\S]*?)</"+t+">","i")); return m ? clean(m[1]) : ""; };
const meta = (h) => clean((h.match(/<meta[^>]+(?:property|name)=["'](?:og:description|description)["'][^>]*content=["']([^"']+)/i) || h.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:description|description)["']/i) || [])[1] || "");
const paras = (h) => ((h.match(/<article[\s\S]*?<\/article>/i)||[h])[0].match(/<p[\s>][\s\S]*?<\/p>/gi)||[]).map(clean).filter(p=>p.length>80).join(" ").length;
async function feed(name, url){
  const r = await get(url); const items = r.t.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  console.log(`\n## ${name} [${r.s}] ${items.length} items ${items.length ? "" : "| début : " + clean(r.t).slice(0,80)}`);
  items.slice(0,3).forEach(b => console.log(`  - ${tag(b,"title").slice(0,70)} | desc ${(tag(b,"description")||tag(b,"summary")).length} car | ${(tag(b,"link")||"").slice(0,80)}`));
  return items;
}
for (const [n,u] of Object.entries({
  "PokemonTrash flux.rss": "https://www.pokemontrash.com/flux.rss", "Pokebip news.rss": "https://www.pokebip.com/news.rss", "Pokebip news-10": "https://www.pokebip.com/news-10.rss",
  "Pokekalos feed": "https://www.pokekalos.fr/feed", "Pokekalos news.rss": "https://www.pokekalos.fr/news.rss",
  "Yahoo FR Pokémon": "https://fr.news.search.yahoo.com/rss?p=Pok%C3%A9mon", "Yahoo Pokémon": "https://news.search.yahoo.com/rss?p=Pok%C3%A9mon",
  "Bing RSS maj": "https://www.bing.com/news/search?q=Pok%C3%A9mon&format=RSS", "Bing RSS en": "https://www.bing.com/news/search?q=Pokemon&format=rss",
  "Le Parisien": "https://feeds.leparisien.fr/leparisien/rss", "Le Figaro": "https://www.lefigaro.fr/rss/figaro_actualites.xml", "Libération": "https://www.liberation.fr/arc/outboundfeeds/rss-all/?outputType=xml", "Actu.fr": "https://actu.fr/rss.xml"
})) await feed(n,u);

console.log("\n## Google Actualités décodé → vrai article");
async function gDecode(link){
  const id = link.split("/articles/")[1].split("?")[0];
  const p = await get("https://news.google.com/articles/" + id);
  const sg = (p.t.match(/data-n-a-sg="([^"]+)"/)||[])[1], ts = (p.t.match(/data-n-a-ts="([^"]+)"/)||[])[1];
  if (!sg) return { err: "pas de signature (" + p.s + ")" };
  const req = [[["Fbv4je", JSON.stringify(["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0], id, +ts, sg]), null, "generic"]]];
  const r = await get("https://news.google.com/_/DotsSplashUi/data/batchexecute", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" }, body: "f.req=" + encodeURIComponent(JSON.stringify(req)) });
  try { const j = JSON.parse(r.t.split("\n\n")[1]); return { url: JSON.parse(j[0][2])[1] }; } catch (e) { return { err: "réponse " + r.s + " " + r.t.slice(0,80) }; }
}
for (const q of ["Pokémon","crypto"]){
  const g = await get("https://news.google.com/rss/search?" + new URLSearchParams({ q: q + " when:2d", hl: "fr", gl: "FR", ceid: "FR:fr" }));
  const items = (g.t.match(/<item>[\s\S]*?<\/item>/g) || []).slice(0,6);
  for (const b of items){
    const d = await gDecode(tag(b,"link"));
    if (!d.url){ console.log("  ✗", d.err); continue; }
    const a = await get(d.url);
    console.log(`  [${a.s}] ${new URL(d.url).hostname} | meta ${meta(a.t).length} car | paragraphes ${paras(a.t)} car | « ${meta(a.t).slice(0,100)} »`);
    await new Promise(r => setTimeout(r, 500));
  }
}

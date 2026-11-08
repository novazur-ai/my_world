import { readFileSync } from "node:fs";
const j = JSON.parse(readFileSync("gazette-essai.json", "utf8"));
for (const s of j.sections){ console.log(`\n### ${s.topic} (${s.items.length})`);
  for (const i of s.items) console.log(`- ${i.title.slice(0,80)}\n   ${i.source} | ${i.url.slice(0,60)}\n   ESSENTIEL (${i.lead.length}) : ${i.lead.slice(0,160)}\n   PHRASES (${(i.more||"").length}) : ${(i.more||"").slice(0,160)}`); }
console.log("\nChiffres :", JSON.stringify(j.numbers.map(n => n.n + " · " + n.topic)));
// essai 2

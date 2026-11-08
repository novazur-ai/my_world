import { readFileSync } from "node:fs";
const j = JSON.parse(readFileSync("gazette-essai.json", "utf8"));
console.log("UNE =", JSON.stringify(j.une, null, 1));

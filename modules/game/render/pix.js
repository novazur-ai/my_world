/* Forpharos : boîte à outils pixel art (police pixel maison 3×5, icônes, tampon de pixels, ombrage et contour).
   Les textes de l'interface sont dessinés en SVG (pixels nets à toutes les tailles, couleur héritée du CSS). */
export const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const cl = v => v < 0 ? 0 : v > 255 ? 255 : v | 0;
export const mul = (c, f) => [cl(c[0]*f), cl(c[1]*f), cl(c[2]*f)];
export const mix = (a, b, t) => [cl(a[0] + (b[0] - a[0])*t), cl(a[1] + (b[1] - a[1])*t), cl(a[2] + (b[2] - a[2])*t)];
export function hash(x, y, s){ let h = (x*374761393 + y*668265263 + (s || 0)*1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0)/4294967296; }
export const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
export const rgb = c => "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")";
export const rgba = (c, a) => "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")";

/* ---------- tampon de pixels ---------- */
export class PB {
  constructor(w, h){ this.w = w; this.h = h; this.d = new Uint8ClampedArray(w*h*4); }
  set(x, y, c){ x |= 0; y |= 0; if (!c || x < 0 || y < 0 || x >= this.w || y >= this.h) return; const i = (y*this.w + x)*4; this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = 255; }
  a(x, y){ if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0; return this.d[(y*this.w + x)*4 + 3]; }
  get(x, y){ const i = (y*this.w + x)*4; return [this.d[i], this.d[i + 1], this.d[i + 2]]; }
  canvas(){ const c = document.createElement("canvas"); c.width = this.w; c.height = this.h; const x = c.getContext("2d"); const im = x.createImageData(this.w, this.h); im.data.set(this.d); x.putImageData(im, 0, 0); return c; }
}
/* ombrage automatique (haut éclairé, bas/droite assombris) + contour sélectif */
export function finish(pb, v, pad){
  pad = pad || 0;
  const o = new PB(pb.w + pad*2, pb.h + pad*2);
  for (let y = 0; y < pb.h; y++) for (let x = 0; x < pb.w; x++){
    if (!pb.a(x, y)) continue;
    let c = pb.get(x, y);
    if (v.hi && !pb.a(x, y - 1)) c = mix(c, [255, 240, 205], v.hi);
    else if (v.shade && (!pb.a(x + 1, y) || !pb.a(x, y + 1))) c = mul(c, 1 - v.shade);
    o.set(x + pad, y + pad, c);
  }
  if (v.outline !== "none"){
    const marks = [];
    for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++){
      if (o.a(x, y)) continue;
      const n = [[x, y - 1], [x - 1, y], [x + 1, y], [x, y + 1]].find(p => o.a(p[0], p[1]));
      if (n) marks.push([x, y, v.outline === "dark" ? [36, 24, 16] : mul(o.get(n[0], n[1]), .45)]);
    }
    marks.forEach(m => o.set(m[0], m[1], m[2]));
  }
  return o;
}
export const STYLE = { outline: "sel", shade: .15, hi: .12, tone: "base", ground: "noise", flat: false };
export function sprite(rows, pal, extra, pad){
  const w = Math.max.apply(null, rows.map(r => r.length)), h = rows.length, pb = new PB(w, h), P = Object.assign({}, pal, extra || {});
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++){ const ch = r[x]; if (ch !== "." && P[ch]) pb.set(x, y, hex(P[ch])); } });
  return finish(pb, STYLE, pad == null ? 1 : pad).canvas();
}

/* ---------- police pixel 3×5 (5 lignes de 3 cases) ---------- */
export const GLYPHS = {
  A: ".#.#.#####.##.#", B: "##.#.###.#.###.", C: ".###..#..#...##", D: "##.#.##.##.###.", E: "####..##.#..###", F: "####..##.#..#..",
  G: ".###..#.##.#.##", H: "#.##.#####.##.#", I: "###.#..#..#.###", J: "..#..#..##.#.#.", K: "#.##.###.#.##.#", L: "#..#..#..#..###",
  M: "#.########.##.#", N: "##.#.##.##.##.#", O: ".#.#.##.##.#.#.", P: "##.#.###.#..#..", Q: ".#.#.##.####.##", R: "##.#.###.#.##.#",
  S: ".###...#...###.", T: "###.#..#..#..#.", U: "#.##.##.##.#.##", V: "#.##.##.#.#..#.", W: "#.##.########.#", X: "#.##.#.#.#.##.#",
  Y: "#.##.#.#..#..#.", Z: "###..#.#.#..###",
  "0": "####.##.##.####", "1": ".#.##..#..#.###", "2": "##...#.#.#..###", "3": "##...#.#...###.", "4": "#.##.####..#..#",
  "5": "####..##...###.", "6": ".###..####.####", "7": "###..#.#..#..#.", "8": "####.#####.####", "9": "####.####..###.",
  ":": "....#.....#....", "-": "......###......", ".": ".............#.", "·": ".......#.......", " ": "...............",
  "+": "....#.###.#....", "!": ".#..#..#.....#.", "?": "##...#.#.....#.", "/": "..#..#.#.#..#..", "'": ".#..#..........",
  ",": "..........#.#..", "%": "#....#.#.#....#", "(": ".#.#..#..#...#.", ")": ".#...#..#..#.#.", "×": "...#.#.#.#.#..."
};
const norm = s => String(s).toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/Œ/g, "OE").replace(/Æ/g, "AE");
export const textW = str => { let w = 0; for (const ch of norm(str)) w += ch === " " ? 3 : 4; return Math.max(0, w - 1); };
/* texte dans un tampon de pixels */
export function text(pb, str, x, y, col, shadow){
  let cx = x;
  for (const ch of norm(str)){
    const g = GLYPHS[ch] || GLYPHS[" "];
    for (let i = 0; i < 15; i++) if (g[i] === "#"){ const gx = cx + i % 3, gy = y + (i/3 | 0); if (shadow) pb.set(gx + 1, gy + 1, shadow); pb.set(gx, gy, col); }
    cx += ch === " " ? 3 : 4;
  }
  return cx - x;
}
/* texte en SVG : un pixel = une case ; hauteur à l'écran réglée en CSS (--px) */
export function pixSVG(str, opt){
  opt = opt || {};
  let d = "", cx = 0;
  for (const ch of norm(str)){
    const g = GLYPHS[ch] || GLYPHS[" "];
    for (let i = 0; i < 15; i++) if (g[i] === "#") d += "M" + (cx + i % 3) + " " + (i/3 | 0) + "h1v1h-1z";
    cx += ch === " " ? 3 : 4;
  }
  const w = Math.max(1, cx - 1) + (opt.shadow ? 1 : 0), h = 5 + (opt.shadow ? 1 : 0);
  return '<svg class="pxt" viewBox="0 0 ' + w + " " + h + '" style="--w:' + w + ";--h:" + h + '" shape-rendering="crispEdges" aria-hidden="true">'
    + (opt.shadow ? '<path transform="translate(1 1)" fill="' + opt.shadow + '" d="' + d + '"/>' : "") + '<path fill="currentColor" d="' + d + '"/></svg>';
}

/* ---------- icônes des ressources (7 × 7) ---------- */
export const ICONS = {
  or:     { pal: { y: "#E2B53C", Y: "#F6DD86", o: "#A87A1E" }, r: ["..yyy..", ".yYYyo.", "yYyyyyo", "yYyoyyo", "yyyyyyo", ".yyyyo.", "..ooo.."] },
  bois:   { pal: { n: "#8A5C35", N: "#5E3D24", w: "#D2A86E" }, r: ["nnnnnw.", "NNNNwNw", "nnnnnw.", "nnnnnw.", "NNNNwNw", "nnnnnw.", "......."] },
  pierre: { pal: { a: "#9A9284", A: "#6F685D", l: "#C4BCAD" }, r: [".......", "..lla..", ".llaaA.", "llaaaAA", "laaaAAA", ".AAAAA.", "......."] },
  vivres: { pal: { k: "#C88A45", K: "#9A6230", L: "#ECBF7C" }, r: [".......", "..LLL..", ".LkLkL.", "LkkkkkK", "kkkkkKK", ".KKKKK.", "......."] },
  eclats: { pal: { z: "#FBE6CF", x: "#E9B49A", X: "#B9705C" }, r: ["...z...", "..zxX..", "..zxX..", ".zxxXX.", ".zxxXX.", "..xXX..", "...X..."] },
  xp:     { pal: { y: "#F6DD86", o: "#C98A2A" }, r: ["...y...", "...y...", ".yyyyy.", "..yyy..", ".yo.oy.", "yo...oy", "......."] },
  coeur:  { pal: { r: "#C9433A", R: "#8A2A24", w: "#F2A49A" }, r: [".rr.rr.", "rwrrrrR", "rrrrrrR", ".rrrrR.", "..rrR..", "...R...", "......."] }
};
/* icône en SVG, avec contour sombre d'un pixel */
export function iconSVG(k){
  const ic = ICONS[k], w = 9, h = 9, cells = {};
  ic.r.forEach((row, y) => { for (let x = 0; x < row.length; x++){ const c = ic.pal[row[x]]; if (c) cells[(x + 1) + "," + (y + 1)] = c; } });
  let out = "";
  const has = (x, y) => cells[x + "," + y];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!has(x, y) && (has(x - 1, y) || has(x + 1, y) || has(x, y - 1) || has(x, y + 1))) out += '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="#241810"/>';
  Object.keys(cells).forEach(k2 => { const [x, y] = k2.split(","); out += '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="' + cells[k2] + '"/>'; });
  return '<svg class="pxi" viewBox="0 0 9 9" shape-rendering="crispEdges" aria-hidden="true">' + out + "</svg>";
}

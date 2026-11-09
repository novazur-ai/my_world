/* Forpharos : le village en pixel art isométrique (rendu B3 validé : pixels nets + lumières douces par-dessus).
   Dessiné en code, à 60 images par seconde, taille de pixel entière à l'écran. L'état du village (niveaux, chantiers) vient du jeu. */
import { PB, finish, hex, mul, mix, hash, BAYER, rgb, rgba, sprite, STYLE } from "./pix.js";

const TW = 12, TH = 6, OX = 95, OY = 42, MX = 7, MY = 6;
export const VW = 190, VH = 128;
const P = (tx, ty, z) => [(tx - ty)*TW + OX, (tx + ty)*TH + OY - (z || 0)];
const T = c => hex(c);
const V = STYLE;
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

/* ---------- primitives isométriques ---------- */
function inside(px, py, pts){ let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++){ const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1]; if (((yi > py) !== (yj > py)) && (px < (xj - xi)*(py - yi)/(yj - yi) + xi)) c = !c; } return c; }
function poly(pb, pts, fn){
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  pts.forEach(p => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) if (inside(x + .5, y + .5, pts)) pb.set(x, y, fn(x, y));
}
function line(pb, a, b, col){
  let x0 = Math.round(a[0]), y0 = Math.round(a[1]); const x1 = Math.round(b[0]), y1 = Math.round(b[1]);
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1; let e = dx + dy;
  for (;;){ pb.set(x0, y0, typeof col === "function" ? col(x0, y0) : col); if (x0 === x1 && y0 === y1) break; const e2 = 2*e; if (e2 >= dy){ e += dy; x0 += sx; } if (e2 <= dx){ e += dx; y0 += sy; } }
}
function box(pb, x0, y0, x1, y1, z, h, mat){
  poly(pb, [P(x0, y1, z), P(x1, y1, z), P(x1, y1, z + h), P(x0, y1, z + h)], mat.L);
  poly(pb, [P(x1, y0, z), P(x1, y1, z), P(x1, y1, z + h), P(x1, y0, z + h)], mat.R);
  if (mat.T) poly(pb, [P(x0, y0, z + h), P(x1, y0, z + h), P(x1, y1, z + h), P(x0, y1, z + h)], mat.T);
}
function pyramid(pb, x0, y0, x1, y1, z, rh, mat){
  const ap = P((x0 + x1)/2, (y0 + y1)/2, z + rh);
  poly(pb, [P(x0, y0, z), P(x0, y1, z), ap], mat.L); poly(pb, [P(x0, y0, z), P(x1, y0, z), ap], mat.R);
  poly(pb, [P(x0, y1, z), P(x1, y1, z), ap], mat.L); poly(pb, [P(x1, y0, z), P(x1, y1, z), ap], mat.R);
}
function gable(pb, x0, y0, x1, y1, z, rh, mat, gableMat){
  const ym = (y0 + y1)/2, R0 = P(x0 - .08, ym, z + rh), R1 = P(x1 + .08, ym, z + rh);
  poly(pb, [P(x0 - .08, y0 - .08, z), P(x1 + .08, y0 - .08, z), R1, R0], mat.R);
  poly(pb, [P(x1, y0, z), P(x1, y1, z), P(x1, ym, z + rh)], gableMat);
  poly(pb, [P(x0 - .08, y1 + .08, z), P(x1 + .08, y1 + .08, z), R1, R0], mat.L);
}

/* ---------- matières procédurales ---------- */
function mats(){
  const n = (x, y, s, amp) => 1 + (hash(x, y, s) - .5)*amp;
  const st = { l: T("#ABA191"), m: T("#8A8173"), d: T("#666055"), mo: T("#4D463E") };
  const stone = face => (x, y) => {
    const slope = face === "L" ? .5 : -.5, vv = y - slope*x, course = Math.floor(vv/4), r = ((vv % 4) + 4) % 4;
    if (r < 1) return st.mo;
    if ((((Math.floor(x) + course*3) % 6) + 6) % 6 === 0) return st.mo;
    return mul(face === "L" ? st.m : st.d, n(x, y, 1, .12));
  };
  const wd = { l: T("#A47447"), m: T("#7E5431"), d: T("#5E3D24"), g: T("#46301C") };
  const wood = face => (x, y) => ((x % 4) + 4) % 4 === 0 ? wd.g : mul(face === "L" ? wd.m : wd.d, n(x, y, 2, .14));
  const pl = { l: T("#DCCBA4"), d: T("#B9A57C"), beam: T("#5A3A22") };
  const timber = face => (x, y) => { const vv = y - (face === "L" ? .5 : -.5)*x; if ((((x % 7) + 7) % 7) === 0 || (((vv % 8) + 8) % 8) < 1) return pl.beam; return mul(face === "L" ? pl.l : pl.d, n(x, y, 3, .06)); };
  const rf = { l: T("#AE5A3E"), m: T("#8C4430"), d: T("#66301F") };
  const roof = face => (x, y) => { const vv = y - (face === "L" ? .5 : -.5)*x; const row = Math.floor(vv/3), r = ((vv % 3) + 3) % 3; if (r < 1) return rf.d; const odd = (((x + row*2) % 4) + 4) % 4 === 0; return mul(face === "L" ? rf.l : rf.m, odd ? .86 : n(x, y, 4, .1)); };
  const sl = { l: T("#5E6A78"), m: T("#4A5562"), d: T("#353D47") };
  const slate = face => (x, y) => { const vv = y - (face === "L" ? .5 : -.5)*x; const row = Math.floor(vv/3), r = ((vv % 3) + 3) % 3; if (r < 1) return sl.d; return mul(face === "L" ? sl.l : sl.m, n(x, y, 8, .1)); };
  const dr = { l: T("#5A4A3C"), d: T("#3F332A") };
  const dark = face => () => face === "L" ? dr.l : dr.d;
  return {
    st, wd, rf,
    stone: { L: stone("L"), R: stone("R"), T: (x, y) => mul(st.l, n(x, y, 5, .1)) },
    wood: { L: wood("L"), R: wood("R"), T: () => wd.l },
    timber: { L: timber("L"), R: timber("R") },
    roof: { L: roof("L"), R: roof("R") }, roofGable: timber("R"),
    slate: { L: slate("L"), R: slate("R") },
    darkRoof: { L: dark("L"), R: dark("R") },
    cliff: { L: (x, y) => mul(T("#6F5640"), n(x, y, 6, .18)), R: (x, y) => mul(T("#4F3D2D"), n(x, y, 7, .18)) }
  };
}

/* ---------- couches fixes ---------- */
const ROAD = new Set(["2,3", "2,4", "2,5", "3,5", "4,5", "5,5", "6,5", "6,4", "6,3", "6,2", "6,1", "3,4"]);
function groundLayer(M){
  const pb = new PB(VW, VH), sea = [T("#2E4A52"), T("#355863"), T("#4C7480")];
  for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++){
    const t = y/VH, b = BAYER[y & 3][x & 3]/16;
    let c = t + b*.25 > .62 ? sea[1] : sea[0];
    if (hash(x >> 2, y, 9) > .985) c = sea[2];
    pb.set(x, y, c);
  }
  box(pb, 0, 0, MX, MY, -7, 7, Object.assign({}, M.cliff, { T: null }));
  const g = [T("#6E8B3D"), T("#5F7A34"), T("#83A24A")], d = [T("#A07E54"), T("#866744"), T("#B4936A")], fl = [T("#E6CF78"), T("#C46D55")];
  for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++){
    const fx = (x + .5 - OX)/TW, fy = (y + .5 - OY)/TH, tx = (fx + fy)/2, ty = (fy - fx)/2;
    if (tx < 0 || ty < 0 || tx >= MX || ty >= MY) continue;
    const road = ROAD.has(Math.floor(tx) + "," + Math.floor(ty)), pal = road ? d : g, r = hash(x, y, 12);
    let c = r < .55 ? pal[0] : r < .85 ? pal[1] : pal[2];
    if (!road && hash(x, y, 13) > .992) c = fl[hash(x, y, 14) > .5 ? 1 : 0];
    pb.set(x, y, c);
  }
  return pb.canvas();
}
function hallLayer(M, lv){
  const pb = new PB(VW, VH);
  if (lv >= 4){ box(pb, .25, .3, .95, 1, 0, 30, M.stone); pyramid(pb, .2, .25, 1, 1.05, 30, 9, M.slate); }        /* tour de guet */
  box(pb, 1, 1, 3, 3, 0, 10, M.stone);
  box(pb, 1.05, 1.05, 2.95, 2.95, 10, 8, M.timber);
  box(pb, 1.35, 1.3, 1.62, 1.57, 18, 9, M.stone);
  if (lv >= 3) box(pb, 2.45, 1.3, 2.72, 1.57, 18, 8, M.stone);                                              /* 2e cheminée */
  gable(pb, 1.05, 1.05, 2.95, 2.95, 18, 10, lv >= 5 ? M.slate : M.roof, M.roofGable);
  if (lv >= 2){ box(pb, 3.02, 1.3, 3.72, 2.3, 0, 9, M.wood); gable(pb, 3.02, 1.3, 3.72, 2.3, 9, 5, M.roof, M.wood.R); }   /* annexe */
  const door = P(2, 3, 0), dc = T("#2E2016"), win = T("#E8C46A"), frame = T("#3E2A1A");
  for (let y = -7; y < 0; y++) for (let x = -2; x <= 2; x++) pb.set(door[0] + x, door[1] + y + Math.round(x*.5), dc);
  [[1.45, 3], [2.55, 3]].forEach(w => { const p = P(w[0], w[1], 13); for (let y = 0; y < 3; y++) for (let x = -1; x <= 1; x++) pb.set(p[0] + x, p[1] + y + Math.round(x*.5), (x === 0 && y === 1) ? frame : win); });
  [[3, 1.6], [3, 2.4]].forEach(w => { if (lv >= 2 && w[1] < 2.35) return; const p = P(w[0], w[1], 13); for (let y = 0; y < 3; y++) for (let x = -1; x <= 1; x++) pb.set(p[0] + x, p[1] + y - Math.round(x*.5), (x === 0 && y === 1) ? frame : win); });
  return finish(pb, V).canvas();
}
const HALL_WIN = lv => [[1.45, 3, 13], [2.55, 3, 13], [3, 2.4, 13]].concat(lv >= 2 ? [] : [[3, 1.6, 13]]);
function scaffoldLayer(M, x0, y0, x1, y1, top, k){
  const pb = new PB(VW, VH), wood = T("#7E5431"), plank = T("#A47447");
  const c = [[x0 - .1, y0 - .1], [x1 + .1, y0 - .1], [x1 + .1, y1 + .1], [x0 - .1, y1 + .1]], h = Math.round(top*Math.min(1, .3 + k*1.4));
  c.forEach((p, i) => { if (i === 0) return; const q = P(p[0], p[1], 0); for (let z = 0; z < h; z++) pb.set(q[0], q[1] - z, wood); });
  for (let z = 4; z < h; z += 6){ line(pb, P(c[3][0], c[3][1], z), P(c[2][0], c[2][1], z), plank); line(pb, P(c[2][0], c[2][1], z), P(c[1][0], c[1][1], z), plank); }
  return finish(pb, Object.assign({}, V, { hi: 0 })).canvas();
}
function lighthouseLayer(M){
  const pb = new PB(VW, VH);
  const band = { L: (x, y) => { const z = P(5.5, 1.2, 0)[1] - y; return (Math.floor(z/8) % 2) ? mul(M.st.m, .82) : M.stone.L(x, y); }, R: (x, y) => { const z = P(5.5, 1.2, 0)[1] - y; return (Math.floor(z/8) % 2) ? mul(M.st.d, .82) : M.stone.R(x, y); } };
  box(pb, 5.1, .4, 5.9, 1.2, 0, 42, Object.assign({ T: M.stone.T }, band));
  box(pb, 5.0, .3, 6.0, 1.3, 42, 2, M.wood);
  box(pb, 5.2, .5, 5.8, 1.1, 44, 6, { L: () => T("#F2D27A"), R: () => T("#D9B45A"), T: null });
  pyramid(pb, 5.15, .45, 5.85, 1.15, 50, 7, M.darkRoof);
  return finish(pb, V).canvas();
}
function treeLayer(M, tx, ty, s){
  const pb = new PB(VW, VH), base = P(tx, ty, 0), lv = [T("#3F5E2A"), T("#4E7231"), T("#628C3C")], tr = T("#5A3A22");
  for (let y = -6; y <= 0; y++){ pb.set(base[0], base[1] + y, tr); pb.set(base[0] + 1, base[1] + y, mul(tr, .8)); }
  const cy = base[1] - 6 - 6*s, R = 6*s;
  for (let y = -R - 3; y <= R + 2; y++) for (let x = -R - 2; x <= R + 2; x++){
    const dd = Math.hypot(x/1.1, y) + hash(x + tx*9, y + ty*9, 15)*1.6; if (dd > R + .5) continue;
    const lit = (-x - y)/(R*2) + .5, b = hash(x + tx*7, y, 16);
    pb.set(base[0] + x, cy + y, lit > .72 + b*.2 ? lv[2] : lit > .32 + b*.2 ? lv[1] : lv[0]);
  }
  return finish(pb, V).canvas();
}

/* ---------- Forge : emplacement libre, chantier en 6 phases, forge construite ---------- */
const F = { x0: 4, y0: 3, x1: 5, y1: 4 };
const PH_END = [.10, .25, .55, .70, .88, 1];
export function forgePhase(t){ for (let i = 0; i < PH_END.length; i++) if (t < PH_END[i]) return { i, k: (t - (i ? PH_END[i - 1] : 0))/(PH_END[i] - (i ? PH_END[i - 1] : 0)) }; return { i: 5, k: 1 }; }
export function hallPhase(t){ const n = 5, i = Math.min(n - 1, Math.floor(t*n)); return { i, k: t*n - i }; }
function plotLayer(){
  const pb = new PB(VW, VH), rope = T("#E8D7A8"), peg = T("#7E5431");
  const c = [[F.x0, F.y0], [F.x1, F.y0], [F.x1, F.y1], [F.x0, F.y1]];
  for (let i = 0; i < 4; i++){ const a = P(c[i][0], c[i][1], 1), b = P(c[(i + 1) % 4][0], c[(i + 1) % 4][1], 1); line(pb, a, b, (x, y) => ((x + y) % 4 < 2 ? rope : null)); }
  c.forEach(p => { const q = P(p[0], p[1], 0); for (let z = 0; z < 4; z++) pb.set(q[0], q[1] - z, peg); });
  /* panneau « à bâtir » */
  const s = P(F.x0 + .2, F.y1 - .1, 0); for (let z = 0; z < 7; z++) pb.set(s[0], s[1] - z, peg);
  for (let y = -11; y <= -7; y++) for (let x = -3; x <= 3; x++) pb.set(s[0] + x, s[1] + y, y === -11 || y === -7 || x === -3 || x === 3 ? T("#5E3D24") : T("#D9C08A"));
  pb.set(s[0] - 1, s[1] - 9, T("#5E3D24")); pb.set(s[0], s[1] - 9, T("#5E3D24")); pb.set(s[0] + 1, s[1] - 9, T("#5E3D24"));
  return finish(pb, Object.assign({}, V, { hi: 0 })).canvas();
}
function forgeLayer(M, ph, lv){
  const pb = new PB(VW, VH), wood = T("#7E5431"), rope = T("#CDB27C");
  const corners = [[F.x0 - .05, F.y0 - .05], [F.x1 + .05, F.y0 - .05], [F.x1 + .05, F.y1 + .05], [F.x0 - .05, F.y1 + .05]];
  if (ph.i === 0){
    const n = Math.max(1, Math.ceil(ph.k*4));
    corners.slice(0, n).forEach(c => { const p = P(c[0], c[1], 0); for (let z = 0; z < 4; z++) pb.set(p[0], p[1] - z, wood); });
    if (ph.k > .5) for (let i = 0; i < 4; i++){ const a = corners[i], b = corners[(i + 1) % 4]; line(pb, P(a[0], a[1], 2), P(b[0], b[1], 2), rope); }
    return finish(pb, V).canvas();
  }
  const wall = ph.i === 1 ? Math.max(1, Math.round(3*ph.k)) : ph.i === 2 ? 3 + Math.round(11*ph.k) : 14;
  box(pb, F.x0, F.y0, F.x1, F.y1, 0, wall, M.stone);
  if (wall >= 6){ const p = P(F.x0 + .5, F.y1, 0); for (let y = 0; y < 6; y++) for (let x = -1; x <= 1; x++) pb.set(p[0] + x, p[1] - 1 - y + Math.round(x*.5), T("#2E2016")); if (ph.i >= 5){ pb.set(p[0], p[1] - 3, T("#E08A3A")); pb.set(p[0] - 1, p[1] - 2, T("#C8642C")); } }
  if (ph.i >= 2 && ph.i <= 4){
    const top = wall + 5;
    corners.forEach((c, i) => { if (i === 0) return; const p = P(c[0], c[1], 0); for (let z = 0; z < top; z++) pb.set(p[0], p[1] - z, wood); });
    for (let z = 4; z < top; z += 5){ line(pb, P(corners[3][0], corners[3][1], z), P(corners[2][0], corners[2][1], z), T("#A47447")); line(pb, P(corners[2][0], corners[2][1], z), P(corners[1][0], corners[1][1], z), T("#A47447")); }
  }
  if (ph.i === 3){
    const z = 14, ap = P(4.5, 3.5, 14 + Math.round(9*Math.min(1, ph.k*1.4)));
    corners.forEach(c => line(pb, P(c[0] + (c[0] < 4.5 ? .05 : -.05), c[1] + (c[1] < 3.5 ? .05 : -.05), z), ap, wood));
    line(pb, P(F.x0, F.y1, z), P(F.x1, F.y1, z), wood); line(pb, P(F.x1, F.y0, z), P(F.x1, F.y1, z), wood);
  }
  if (ph.i >= 4){
    const rh = ph.i === 4 ? Math.max(2, Math.round(9*ph.k)) : 9;
    box(pb, 4.15, 3.15, 4.42, 3.42, 14, ph.i === 4 ? Math.round(10*ph.k) : 10 + (lv >= 3 ? 4 : 0), M.stone);
    pyramid(pb, F.x0 - .05, F.y0 - .05, F.x1 + .05, F.y1 + .05, 14, rh, lv >= 4 ? M.slate : M.roof);
    if (ph.i >= 5){
      const s = P(F.x1 + .18, F.y1 - .15, 9), an = T("#3A3A40");
      for (let x = -2; x <= 2; x++) pb.set(s[0] + x, s[1], an); pb.set(s[0] - 1, s[1] + 1, an); pb.set(s[0], s[1] + 1, an); pb.set(s[0], s[1] + 2, an); pb.set(s[0] - 1, s[1] + 3, an); pb.set(s[0] + 1, s[1] + 3, an);
      line(pb, [s[0], s[1] - 4], [s[0], s[1] - 1], wood);
      if (lv >= 2){ const b = P(F.x1 + .15, F.y0 + .3, 0); box(pb, F.x1 + .05, F.y0 + .15, F.x1 + .45, F.y0 + .55, 0, 4, M.wood); pb.set(b[0], b[1] - 6, T("#C8642C")); }   /* établi */
    }
  }
  return finish(pb, V).canvas();
}

/* ---------- habitants ---------- */
const VIL_PAL = { h: "#5B3B22", H: "#3E2716", s: "#D9A274", p: "#574636", b: "#3B281A", M: "#6D7275", m: "#B4B8BA", c: "#8A3328", t: "#6E7B3E" };
const LEGS = [[".p..p.", "b....b"], ["..pp..", "..bb.."], [".p..p.", ".b..b."], ["..pp..", "..bb.."]];
const vilFrame = k => ["..hh..", ".hhhh.", ".hsss.", "..ss..", ".tttt.", "tttttt", k === 0 ? "sttttt" : k === 2 ? "ttttts" : "stttts", ".tttt."].concat(LEGS[k]);
const miniTito = k => ["..hh..", ".hhhh.", "hhssh.", ".hHHh.", "cttttc", "cttttc", "c.tt.c", ".tttt."].concat(LEGS[k]);
const BLD_1 = ["....m.", "...hm.", "..hhh.", "..sss.", ".tttts", "stttt.", "..ttt.", "..p.p.", "..b.b."];
const BLD_2 = ["......", "......", "..hhh.", "..sss.", ".tttt.", "stttsM", "..ttt.", "..p.p.", "..b.b."];
const ROUTES = [[[2.5, 3.6], [2.5, 5.5], [6.5, 5.5], [6.5, 1.6]], [[3.3, 3.4], [3.3, 4.6], [5.6, 4.6]], [[2.5, 4.4], [2.5, 5.5], [5.2, 5.5]], [[6.5, 2.4], [6.5, 5.5], [4.2, 5.5]], [[1.2, 4.2], [2.4, 4.2], [2.4, 5.4]]];
const COATS = [{ t: "#9A4B33" }, { t: "#4F6A78", h: "#C9A35A" }, { t: "#7B5A8A" }, { t: "#5E7A3A", h: "#2E241C" }, { t: "#A5793A", h: "#8A8A8A" }];
function along(route, s){
  const segs = []; let L = 0;
  for (let i = 0; i < route.length - 1; i++){ const a = route[i], b = route[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]); segs.push([a, b, l]); L += l; }
  let d = ((s % (2*L)) + 2*L) % (2*L), back = false; if (d > L){ d = 2*L - d; back = true; }
  for (const [a, b, l] of segs){ if (d <= l){ const t = d/l; return { p: [a[0] + (b[0] - a[0])*t, a[1] + (b[1] - a[1])*t], dx: b[0] - a[0], dy: b[1] - a[1], back }; } d -= l; }
  const a = route[route.length - 1]; return { p: a, dx: 0, dy: 0, back };
}
function seaSpots(){
  const out = [];
  for (let i = 0; out.length < 18 && i < 400; i++){
    const x = 6 + hash(i, 1, 61)*170, y = 6 + hash(i, 2, 62)*116;
    const isl = yy => { const fx = (x - OX)/TW, fy = (yy - OY)/TH, tx = (fx + fy)/2, ty = (fy - fx)/2; return tx > -.8 && ty > -.8 && tx < MX + .8 && ty < MY + .8; };
    if (isl(y) || isl(y - 9)) continue;
    out.push({ x, y, ph: hash(i, 3, 63)*6.28, len: 2 + (hash(i, 4, 64)*4 | 0) });
  }
  return out;
}
/* rectangle (en pixels du village) d'une couche : sert à toucher les bâtiments */
function boundsOf(c){
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y*c.width + x)*4 + 3]){ if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x0, y0, x1, y1, data: d, w: c.width };
}

export function createVillage(canvas){
  const ctx = canvas.getContext("2d"), M = mats(), SEA = seaSpots();
  const base = { ground: groundLayer(M), light: lighthouseLayer(M), plot: plotLayer(),
    trees: [[.6, 4.6, 1], [.4, 5.6, .8], [6.6, .2, .75], [3.9, 1.0, .6]].map(t => ({ d: t[0] + t[1], c: treeLayer(M, t[0], t[1], t[2]) })),
    walk: COATS.map(c => [0, 1, 2, 3].map(k => sprite(vilFrame(k), VIL_PAL, c))), walkT: [0, 1, 2, 3].map(k => sprite(miniTito(k), VIL_PAL)),
    builders: [sprite(BLD_1, VIL_PAL, { t: "#8A6A3A" }), sprite(BLD_2, VIL_PAL, { t: "#8A6A3A" })] };
  const cache = {}, hits = {};
  let k = 1, smoke = [], dust = [], lastSmoke = 0, view = null;
  function layerKey(name, key, make){ if (!cache[name] || cache[name].key !== key){ const c = make(); cache[name] = { key, c }; if (name === "hall" || name === "forge") hits[name] = boundsOf(c); } return cache[name].c; }
  function resize(availCss){
    /* pixel entier si possible ; sur un écran peu dense, on agrandit quand même jusqu'à la largeur disponible */
    const dpr = window.devicePixelRatio || 1; k = Math.max(1, Math.floor(availCss*dpr/VW));
    let cssW = VW*k/dpr; if (cssW < availCss*.8){ k = Math.ceil(availCss*dpr/VW); cssW = availCss; }
    canvas.width = VW*k; canvas.height = VH*k; canvas.style.width = cssW + "px"; canvas.style.height = (cssW*VH/VW) + "px";
    ctx.imageSmoothingEnabled = false; return k;
  }
  const layer = c => ctx.drawImage(c, 0, 0, c.width*k, c.height*k);
  const spr = (c, wx, wy, flip, alpha) => { const X = Math.round(wx*k), Y = Math.round(wy*k), W = c.width*k, H = c.height*k;
    if (alpha != null) ctx.globalAlpha = alpha;
    if (flip){ ctx.save(); ctx.translate(X + W, Y); ctx.scale(-1, 1); ctx.drawImage(c, 0, 0, W, H); ctx.restore(); } else ctx.drawImage(c, X, Y, W, H);
    if (alpha != null) ctx.globalAlpha = 1; };
  const px = (wx, wy, ww, wh, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(wx*k), Math.round(wy*k), Math.max(1, Math.round(ww*k)), Math.max(1, Math.round(wh*k))); };
  const glow = (wx, wy, r, col, a) => { const X = wx*k, Y = wy*k, R = r*k, gr = ctx.createRadialGradient(X, Y, 0, X, Y, R); gr.addColorStop(0, rgba(col, a)); gr.addColorStop(1, rgba(col, 0)); ctx.fillStyle = gr; ctx.fillRect(X - R, Y - R, R*2, R*2); };

  /* v : { hallLv, hallJob (0..1 ou null), forgeLv, forgeJob (0..1 ou null), sel } */
  function draw(now, dt, v){
    view = v; ctx.globalCompositeOperation = "source-over"; ctx.imageSmoothingEnabled = false;
    layer(base.ground);
    const seaL = T("#7FA3AC");
    SEA.forEach(s => { const b = Math.sin(now/650 + s.ph); if (b < .25) return; ctx.globalAlpha = (b - .25)*.9; px(s.x + Math.sin(now/2300 + s.ph)*3, s.y, s.len, 1, rgb(seaL)); ctx.globalAlpha = 1; });
    const hall = layerKey("hall", "h" + v.hallLv, () => hallLayer(M, v.hallLv));
    const items = [{ d: 4, c: hall }, { d: 6.6, c: base.light }].concat(base.trees);
    let fph = null;
    if (v.forgeJob != null){ fph = forgePhase(v.forgeJob); const key = fph.i + ":" + Math.round(fph.k*24) + ":" + v.forgeLv; items.push({ d: 8, c: layerKey("forge", key, () => forgeLayer(M, fph, Math.max(1, v.forgeLv))) }); }
    else if (v.forgeLv > 0){ fph = { i: 5, k: 1 }; items.push({ d: 8, c: layerKey("forge", "built" + v.forgeLv, () => forgeLayer(M, fph, v.forgeLv)) }); }
    else { items.push({ d: 8, c: base.plot }); if (!hits.forge || cache.forge) { hits.forge = boundsOf(base.plot); delete cache.forge; } }
    if (v.hallJob != null){ items.push({ d: 4.2, c: layerKey("scaf", Math.round(v.hallJob*20), () => scaffoldLayer(M, 1, 1, v.hallLv >= 1 ? 3 : 3, 3, 30, v.hallJob)) }); }
    /* habitants : plus nombreux quand l'Hôtel de ville grandit */
    const walkers = Math.min(ROUTES.length, 1 + v.hallLv);
    const walk = (frames, route, speed, off) => { const s = now/speed + off, a = along(route, s), p = P(a.p[0], a.p[1], 0), f = frames[Math.floor(s*7) % 4];
      items.push({ d: a.p[0] + a.p[1] + .3, c: f, wx: p[0] - 3, wy: p[1] - 10 + ((Math.floor(s*7) % 2) ? -.5 : 0), flip: (a.back ? -1 : 1)*(a.dx - a.dy) < 0, shadow: p }); };
    for (let i = 0; i < walkers; i++) walk(base.walk[i], ROUTES[i === 1 ? 2 : i === 2 ? 3 : i], 1500 + i*230, i*6.5);
    walk(base.walkT, ROUTES[1], 2100, 1.2);
    const building = (fph && v.forgeJob != null && fph.i >= 1 && fph.i <= 4) || v.hallJob != null;
    if (building){
      const f = Math.floor(now/260) % 2, spots = v.forgeJob != null ? [[4.5, 4.55], [5.45, 3.55]] : [[2, 3.45], [3.35, 2.7]];
      spots.forEach((b, i) => { const p = P(b[0], b[1], 0); items.push({ d: b[0] + b[1] + .2, c: base.builders[(f + i) % 2], wx: p[0] - 3, wy: p[1] - 9, flip: i === 1, shadow: p }); });
      if (Math.random() < dt/90){ const c = v.forgeJob != null ? P(4.6, 4.2, 0) : P(2.2, 3.2, 0); dust.push({ x: c[0] + (Math.random()*16 - 8), y: c[1] - Math.random()*6, vx: (Math.random() - .5)*.01, life: 1 }); }
    }
    items.sort((a, b) => a.d - b.d).forEach(it => {
      if (it.wx == null){ layer(it.c); return; }
      if (it.shadow) glow(it.shadow[0], it.shadow[1], 4, [20, 14, 8], .35);
      spr(it.c, it.wx, it.wy, it.flip);
    });
    /* sélection : liseré doré autour du bâtiment touché */
    if (v.sel && hits[v.sel]){ const h = hits[v.sel]; ctx.globalAlpha = .55 + .35*Math.sin(now/220); ctx.strokeStyle = "#F6DD86"; ctx.lineWidth = Math.max(1, k*.75);
      ctx.strokeRect((h.x0 - 1.5)*k, (h.y0 - 1.5)*k, (h.x1 - h.x0 + 3)*k, (h.y1 - h.y0 + 3)*k); ctx.globalAlpha = 1; }
    /* drapeau */
    const fp = P(2.95, 2, 28), wave = Math.floor(now/160) % 4, red = rgb(T("#8A3328"));
    px(fp[0], fp[1] - 7, 1, 8, rgb(T("#3E2716"))); px(fp[0] + 1, fp[1] - 7 + (wave === 1 ? 1 : 0), 4, 3, red); px(fp[0] + 5, fp[1] - 6 + (wave > 1 ? 1 : 0), 1, 2, red); px(fp[0] + 2, fp[1] - 6 + (wave === 1 ? 1 : 0), 1, 1, rgb(T("#E2B53C")));
    /* fumée des cheminées */
    const chim = [P(1.48, 1.44, 27)]; if (v.hallLv >= 3) chim.push(P(2.58, 1.44, 26)); if (v.forgeLv > 0 && v.forgeJob == null) chim.push(P(4.28, 3.28, v.forgeLv >= 3 ? 28 : 24));
    if (now - lastSmoke > 220){ lastSmoke = now; chim.forEach(c => smoke.push({ x: c[0], y: c[1] - 1, age: 0, s: Math.random()*6 })); }
    const sm = T("#D9D2C4");
    smoke = smoke.filter(s => { s.age += dt/1000; s.y -= dt/110; if (s.age > 3.4) return false; glow(s.x + Math.sin(s.age*1.8 + s.s)*1.8 + s.age*2.4, s.y, 2 + s.age*1.6, sm, .42*(1 - s.age/3.4)); return true; });
    const du = rgb(T("#CDB27C"));
    dust = dust.filter(d => { d.life -= dt/650; d.y -= dt/240; d.x += d.vx*dt; if (d.life <= 0) return false; ctx.globalAlpha = d.life; px(d.x, d.y, 1, 1, du); ctx.globalAlpha = 1; return true; });
    /* lumières : faisceau du phare, fenêtres, foyer de la forge, lumière de fin de journée, vignette */
    const L = P(5.5, .8, 47), ang = now/1500, dir = Math.cos(ang) >= 0 ? 1 : -1, power = Math.abs(Math.cos(ang)), beam = T("#F6E3A1");
    ctx.globalCompositeOperation = "lighter";
    const X = L[0]*k, Y = L[1]*k, len = 62*k, spread = 9*k + power*4*k, gr = ctx.createLinearGradient(X, Y, X + dir*len, Y);
    gr.addColorStop(0, rgba(beam, .55*power)); gr.addColorStop(1, rgba(beam, 0));
    ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(X, Y - k); ctx.lineTo(X + dir*len, Y - spread - 6*k); ctx.lineTo(X + dir*len, Y + spread - 6*k); ctx.lineTo(X, Y + k); ctx.closePath(); ctx.fill();
    glow(L[0], L[1], 9 + Math.sin(now/300)*1.2, [255, 214, 130], .7);
    HALL_WIN(v.hallLv).forEach(q => { const p = P(q[0], q[1], q[2]); glow(p[0], p[1] + 1, 4, [255, 190, 90], .45 + Math.sin(now/500 + q[0])*.08); });
    if (v.forgeLv > 0 && v.forgeJob == null){ const p = P(F.x0 + .5, F.y1, 3); glow(p[0], p[1], 6 + v.forgeLv*.6, [255, 140, 60], .5 + Math.sin(now/120)*.15); }
    ctx.globalCompositeOperation = "soft-light";
    const wl = ctx.createLinearGradient(0, 0, canvas.width, canvas.height); wl.addColorStop(0, "rgba(255,180,90,.55)"); wl.addColorStop(1, "rgba(60,40,90,.35)");
    ctx.fillStyle = wl; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "source-over";
    const vg = ctx.createRadialGradient(canvas.width/2, canvas.height/2, canvas.height*.35, canvas.width/2, canvas.height/2, canvas.width*.7);
    vg.addColorStop(0, "rgba(10,8,6,0)"); vg.addColorStop(1, "rgba(10,8,6,.45)"); ctx.fillStyle = vg; ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  /* bâtiment sous le doigt (coordonnées CSS dans le canevas) ; le plus en avant d'abord */
  function hit(cssX, cssY){
    const r = canvas.getBoundingClientRect(), x = Math.floor(cssX/r.width*VW), y = Math.floor(cssY/r.height*VH);
    for (const name of ["forge", "hall"]){ const h = hits[name]; if (!h) continue;
      if (x >= h.x0 - 2 && x <= h.x1 + 2 && y >= h.y0 - 2 && y <= h.y1 + 2){
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++){ const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < h.w && yy < VH && h.data[(yy*h.w + xx)*4 + 3]) return name; } } }
    const lp = P(5.5, .8, 0); if (Math.abs(x - lp[0]) < 8 && y > lp[1] - 60 && y < lp[1] + 4) return "phare";
    return null;
  }
  return { resize, draw, hit };
}

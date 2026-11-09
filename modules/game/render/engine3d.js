/* Forpharos : moteur 3D maison (WebGL 2, sans bibliothèque), repris des maquettes validées (série 6, rendu C3 « 3D douce »).
   Contenu : outils couleur et pixels, maths 3D, shaders, rendu (ombres, halo, post-traitement), formes, décor de la Lande du Phare,
   acteurs (monstres), lecteur GLB (Tito animé). Aucun état global : tout ce qui touche à WebGL passe par l objet R créé par makeGL. */
/* ---------- outils couleur ---------- */
const hex = h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
const cl = v => v < 0 ? 0 : v > 255 ? 255 : v | 0;
const mul = (c,f) => [cl(c[0]*f), cl(c[1]*f), cl(c[2]*f)];
const mix = (a,b,t) => [cl(a[0]+(b[0]-a[0])*t), cl(a[1]+(b[1]-a[1])*t), cl(a[2]+(b[2]-a[2])*t)];
function hash(x,y,s){ let h = (x*374761393 + y*668265263 + (s||0)*1442695041) | 0; h = Math.imul(h ^ (h>>>13), 1274126177); return ((h ^ (h>>>16)) >>> 0) / 4294967296; }
const BAYER = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]];
const REDUCED = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- tampon de pixels ---------- */
class PB {
  constructor(w,h){ this.w = w; this.h = h; this.d = new Uint8ClampedArray(w*h*4); }
  set(x,y,c){ x |= 0; y |= 0; if (!c || x < 0 || y < 0 || x >= this.w || y >= this.h) return; const i = (y*this.w + x)*4; this.d[i]=c[0]; this.d[i+1]=c[1]; this.d[i+2]=c[2]; this.d[i+3]=255; }
  a(x,y){ if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0; return this.d[(y*this.w + x)*4 + 3]; }
  get(x,y){ const i = (y*this.w + x)*4; return [this.d[i], this.d[i+1], this.d[i+2]]; }
  canvas(){ const c = document.createElement("canvas"); c.width = this.w; c.height = this.h; const x = c.getContext("2d"); const im = x.createImageData(this.w, this.h); im.data.set(this.d); x.putImageData(im,0,0); return c; }
}

function tone(c,v){
  if (v.tone === "vivid"){ const m = (c[0]+c[1]+c[2])/3; return [cl(m+(c[0]-m)*1.22+3), cl(m+(c[1]-m)*1.22+3), cl(m+(c[2]-m)*1.22+3)]; }
  if (v.tone === "warm") return [cl(c[0]*1.05+10), cl(c[1]*1.0+4), cl(c[2]*.84)];
  return c;
}
/* ombrage automatique + contour, sur une copie élargie de `pad` pixels */
function finish(pb, v, pad){
  pad = pad || 0;
  const o = new PB(pb.w + pad*2, pb.h + pad*2);
  for (let y = 0; y < pb.h; y++) for (let x = 0; x < pb.w; x++){
    if (!pb.a(x,y)) continue;
    let c = pb.get(x,y);
    if (v.hi && !pb.a(x,y-1)) c = mix(c, [255,240,205], v.hi);
    else if (v.shade && (!pb.a(x+1,y) || !pb.a(x,y+1))) c = mul(c, 1 - v.shade);
    o.set(x+pad, y+pad, c);
  }
  if (v.outline !== "none"){
    const marks = [];
    for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++){
      if (o.a(x,y)) continue;
      const n = [[x,y-1],[x-1,y],[x+1,y],[x,y+1]].find(p => o.a(p[0],p[1]));
      if (n) marks.push([x, y, v.outline === "dark" ? [36,24,16] : mul(o.get(n[0],n[1]), .45)]);
    }
    marks.forEach(m => o.set(m[0], m[1], m[2]));
  }
  return o;
}

/* chaque glyphe : 5 lignes de 3 cases, lues de gauche à droite */
const GLYPHS = {
  A:".#.#.#####.##.#",
  B:"##.#.###.#.###.",
  C:".###..#..#...##",
  D:"##.#.##.##.###.",
  E:"####..##.#..###",
  F:"####..##.#..#..",
  G:".###..#.##.#.##",
  H:"#.##.#####.##.#",
  I:"###.#..#..#.###",
  J:"..#..#..##.#.#.",
  K:"#.##.###.#.##.#",
  L:"#..#..#..#..###",
  M:"#.########.##.#",
  N:"##.#.##.##.##.#",
  O:".#.#.##.##.#.#.",
  P:"##.#.###.#..#..",
  Q:".#.#.##.####.##",
  R:"##.#.###.#.##.#",
  S:".###...#...###.",
  T:"###.#..#..#..#.",
  U:"#.##.##.##.#.##",
  V:"#.##.##.#.#..#.",
  W:"#.##.########.#",
  X:"#.##.#.#.#.##.#",
  Y:"#.##.#.#..#..#.",
  Z:"###..#.#.#..###",
  "0":"####.##.##.####",
  "1":".#.##..#..#.###",
  "2":"##...#.#.#..###",
  "3":"##...#.#...###.",
  "4":"#.##.####..#..#",
  "5":"####..##...###.",
  "6":".###..####.####",
  "7":"###..#.#..#..#.",
  "8":"####.#####.####",
  "9":"####.####..###.",
  ":":"....#.....#....",
  "-":"......###......",
  ".":".............#.",
  "·":".......#.......",
  " ":"..............."
};
function text(pb, str, x, y, col, shadow){
  str = String(str).toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  let cx = x;
  for (const ch of str){
    const g = GLYPHS[ch] || GLYPHS[" "];
    for (let i = 0; i < 15; i++) if (g[i] === "#"){ const gx = cx + i % 3, gy = y + (i/3 | 0); if (shadow) pb.set(gx+1, gy+1, shadow); pb.set(gx, gy, col); }
    cx += ch === " " ? 3 : 4;
  }
  return cx - x;
}
const textW = str => { let w = 0; for (const ch of String(str)) w += ch === " " ? 3 : 4; return w - 1; };

function woodPanel(pb, x0, y0, w, h, v, T){
  const base = T("#6B4528"), dk = T("#4A2F1C"), hi = T("#8E6038"), nail = T("#B9B2A0");
  for (let y = y0; y < y0+h; y++) for (let x = x0; x < x0+w; x++){
    let c = base; const yy = y - y0;
    if (((yy) % 5) === 4) c = dk; else if (!v.flat && hash(x>>1, y, 21) > .82) c = mul(base, .88);
    if (v.ground === "dither" && BAYER[y & 3][x & 3] / 16 > .8) c = mul(c, 1.08);
    pb.set(x, y, c);
  }
  for (let x = x0; x < x0+w; x++){ pb.set(x, y0, hi); pb.set(x, y0+h-1, dk); }
  for (let y = y0; y < y0+h; y++){ pb.set(x0, y, hi); pb.set(x0+w-1, y, dk); }
  [[x0+2,y0+2],[x0+w-3,y0+2],[x0+2,y0+h-3],[x0+w-3,y0+h-3]].forEach(p => pb.set(p[0], p[1], nail));
}

/* =================== Forpharos · moteur 3D WebGL maison (aucune bibliothèque) =================== */
const C3 = h => [parseInt(h.slice(1,3),16)/255, parseInt(h.slice(3,5),16)/255, parseInt(h.slice(5,7),16)/255];
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v, lerp = (a,b,t) => a + (b-a)*t;
const easeOut = t => 1 - Math.pow(1 - clamp01(t), 3), easeIn = t => clamp01(t)*clamp01(t), easeIO = t => { t = clamp01(t); return t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3)/2; };
const v3 = { sub:(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]], add:(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]], sc:(a,s)=>[a[0]*s,a[1]*s,a[2]*s], dot:(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],
  cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]], nrm:a=>{ const l = Math.hypot(a[0],a[1],a[2]) || 1; return [a[0]/l,a[1]/l,a[2]/l]; } };

function vnoise(x, z, s){ const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi, sx = fx*fx*(3-2*fx), sz = fz*fz*(3-2*fz);
  const a = hash(xi, zi, s), b = hash(xi+1, zi, s), c = hash(xi, zi+1, s), d = hash(xi+1, zi+1, s); return lerp(lerp(a,b,sx), lerp(c,d,sx), sz); }
/* ---------- matrices 4×4 (colonnes) ---------- */
const m4 = {
  id: () => [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1],
  mul(a,b){ const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++){ let s = 0; for (let k = 0; k < 4; k++) s += a[k*4+r]*b[c*4+k]; o[c*4+r] = s; } return o; },
  T: (x,y,z) => [1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1],
  S: (x,y,z) => [x,0,0,0, 0,y,0,0, 0,0,z,0, 0,0,0,1],
  RX: a => { const c = Math.cos(a), s = Math.sin(a); return [1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]; },
  RY: a => { const c = Math.cos(a), s = Math.sin(a); return [c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]; },
  RZ: a => { const c = Math.cos(a), s = Math.sin(a); return [c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1]; },
  persp(fov, asp, n, f){ const t = 1/Math.tan(fov/2); return [t/asp,0,0,0, 0,t,0,0, 0,0,(f+n)/(n-f),-1, 0,0,2*f*n/(n-f),0]; },
  look(e, c, up){ const z = v3.nrm(v3.sub(e, c)), x = v3.nrm(v3.cross(up, z)), y = v3.cross(z, x);
    return [x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0, -v3.dot(x,e),-v3.dot(y,e),-v3.dot(z,e),1]; },
  /* inverse transposée du bloc 3×3, en colonnes (pour les normales) */
  nmat(m){ const a=m[0],b=m[1],c=m[2],d=m[4],e=m[5],f=m[6],g=m[8],h=m[9],i=m[10];
    const c00 = e*i-h*f, c01 = -(b*i-h*c), c02 = b*f-e*c, c10 = -(d*i-g*f), c11 = a*i-g*c, c12 = -(a*f-d*c), c20 = d*h-g*e, c21 = -(a*h-g*b), c22 = a*e-d*b;
    const det = a*c00 + d*c01 + g*c02 || 1;
    return [c00/det, c10/det, c20/det, c01/det, c11/det, c21/det, c02/det, c12/det, c22/det]; },
  tp(m, p){ return [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12], m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13], m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]]; },
  tn(m, n){ return v3.nrm([m[0]*n[0]+m[4]*n[1]+m[8]*n[2], m[1]*n[0]+m[5]*n[1]+m[9]*n[2], m[2]*n[0]+m[6]*n[1]+m[10]*n[2]]); }
};
const M = (...ms) => ms.reduce((a,b) => m4.mul(a,b));

/* ---------- géométrie (listes de triangles, normales lisses) ---------- */
function gridTris(P, N, cols, rows){ const p = [], n = [];
  const put = k => { p.push(P[k][0],P[k][1],P[k][2]); n.push(N[k][0],N[k][1],N[k][2]); };
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++){ const a = j*(cols+1)+i, b = a+1, c = a+cols+1, d = c+1; put(a); put(c); put(b); put(b); put(c); put(d); }
  return { p, n }; }
function sphereG(su, sv){ su = su || 28; sv = sv || 18; const P = [], N = [];
  for (let j = 0; j <= sv; j++){ const ph = j/sv*Math.PI; for (let i = 0; i <= su; i++){ const th = (i + .5)/su*Math.PI*2, q = [Math.sin(ph)*Math.cos(th), Math.cos(ph), Math.sin(ph)*Math.sin(th)]; P.push(q); N.push(q); } }
  return gridTris(P, N, su, sv); }
function latheG(prof, seg){ seg = seg || 28; const P = [], N = [], L = prof.length;
  for (let k = 0; k < L; k++){ const a = prof[Math.max(0,k-1)], b = prof[Math.min(L-1,k+1)]; let tx = b[0]-a[0], ty = b[1]-a[1]; const l = Math.hypot(tx,ty) || 1; const nx = ty/l, ny = -tx/l;
    for (let i = 0; i <= seg; i++){ const th = i/seg*Math.PI*2, c = Math.cos(th), s = Math.sin(th); P.push([prof[k][0]*c, prof[k][1], prof[k][0]*s]); N.push(v3.nrm([nx*c, ny, nx*s])); } }
  return gridTris(P, N, seg, L-1); }
function tubeG(path, rad, seg){ seg = seg || 10; const P = [], N = [], L = path.length;
  for (let k = 0; k < L; k++){ const a = path[Math.max(0,k-1)], b = path[Math.min(L-1,k+1)], T = v3.nrm(v3.sub(b, a)), up = Math.abs(T[1]) < .9 ? [0,1,0] : [1,0,0];
    const B = v3.nrm(v3.cross(T, up)), Nn = v3.cross(B, T), r = rad(k/(L-1));
    for (let i = 0; i <= seg; i++){ const an = i/seg*Math.PI*2, d = v3.add(v3.sc(Nn, Math.cos(an)), v3.sc(B, Math.sin(an))); P.push(v3.add(path[k], v3.sc(d, r))); N.push(d); } }
  return gridTris(P, N, seg, L-1); }
function torusG(R, r, su, sv){ su = su || 28; sv = sv || 10; const P = [], N = [];
  for (let j = 0; j <= sv; j++){ const v = j/sv*Math.PI*2; for (let i = 0; i <= su; i++){ const u = i/su*Math.PI*2, c = [Math.cos(u), 0, Math.sin(u)], n = [c[0]*Math.cos(v), Math.sin(v), c[2]*Math.cos(v)]; P.push([c[0]*R + n[0]*r, n[1]*r, c[2]*R + n[2]*r]); N.push(n); } }
  return gridTris(P, N, su, sv); }
function rboxG(w, h, d, r){ const s = sphereG(15, 13), p = s.p.slice(), hw = w/2 - r, hh = h/2 - r, hd = d/2 - r;
  for (let i = 0; i < p.length; i += 3){ const x = p[i], y = p[i+1], z = p[i+2]; p[i] = x*r + Math.sign(x)*hw; p[i+1] = y*r + Math.sign(Math.round(y*1e6))*hh; p[i+2] = z*r + Math.sign(z)*hd; }
  return { p, n: s.n }; }
function clothG(cols, rows, fn){ const P = [], N = [];
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) P.push(fn(i/cols, j/rows));
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++){ const g = (a,b) => P[Math.min(rows,Math.max(0,b))*(cols+1) + Math.min(cols,Math.max(0,a))];
    N.push(v3.nrm(v3.cross(v3.sub(g(i,j+1), g(i,j-1)), v3.sub(g(i+1,j), g(i-1,j))))); }
  return gridTris(P, N, cols, rows); }
/* fusion de géométries (décor fixe) avec couleur par sommet */
function bake(list){ const p = [], n = [], c = [];
  list.forEach(({ g, m, col, jit }) => { const nm = m4.nmat(m);
    for (let i = 0; i < g.p.length; i += 3){ const q = m4.tp(m, [g.p[i],g.p[i+1],g.p[i+2]]), nn = v3.nrm([nm[0]*g.n[i]+nm[3]*g.n[i+1]+nm[6]*g.n[i+2], nm[1]*g.n[i]+nm[4]*g.n[i+1]+nm[7]*g.n[i+2], nm[2]*g.n[i]+nm[5]*g.n[i+1]+nm[8]*g.n[i+2]]);
      p.push(q[0],q[1],q[2]); n.push(nn[0],nn[1],nn[2]); const k = jit ? 1 + (hash(Math.floor(q[0]*9), Math.floor(q[1]*9 + q[2]*7), 3) - .5)*jit : 1; c.push(col[0]*k, col[1]*k, col[2]*k); } });
  return { p, n, c }; }


/* ---------- shaders (série 5 : ombres portées, tons filmiques, feuillage, runes, post-traitement) ---------- */
const VS = `#version 300 es
layout(location=0) in vec3 aP; layout(location=1) in vec3 aN; layout(location=2) in vec3 aC;
layout(location=3) in vec4 aI; layout(location=4) in vec4 aJ; layout(location=5) in vec4 aK;
layout(location=6) in vec4 aJo; layout(location=7) in vec4 aWe; layout(location=8) in vec2 aUV;
uniform mat4 uVP, uM; uniform mat3 uNM; uniform float uT; uniform vec4 uWob; uniform int uInst, uSkin; uniform vec2 uWind; uniform mat4 uJ[32];
out vec3 vW, vN, vC, vL; out vec4 vI; out vec2 vUV;
void main(){
  vec3 p = aP, n = aN; vI = vec4(0.0);
  if (uWob.x > 0.0){ float k = uWob.w > 1.5 ? smoothstep(-0.35, 0.85, p.y) : 1.0;
    float w = sin(p.y*uWob.y + uT*uWob.z + p.x*4.0)*0.6 + sin(p.y*uWob.y*1.7 - uT*uWob.z*1.3 + p.z*5.0)*0.4;
    p += aN*w*uWob.x*k; if (uWob.w > 1.5) p.x += sin(uT*9.0 + p.y*6.0)*0.035*k; }
  if (uSkin == 1){ mat4 sk = aWe.x*uJ[int(aJo.x)] + aWe.y*uJ[int(aJo.y)] + aWe.z*uJ[int(aJo.z)] + aWe.w*uJ[int(aJo.w)]; p = (sk*vec4(p, 1.0)).xyz; n = mat3(sk)*n; }
  vL = p; vUV = aUV;
  vec4 w;
  if (uInst == 1){
    float s = aJ.x, cy = cos(aI.w), sy = sin(aI.w), ct = cos(aJ.w), st = sin(aJ.w);
    vec3 q = p*s; q = vec3(q.x, q.y*ct - q.z*st, q.y*st + q.z*ct); q = vec3(q.x*cy + q.z*sy, q.y, -q.x*sy + q.z*cy);
    vec3 nn = vec3(n.x, n.y*ct - n.z*st, n.y*st + n.z*ct); nn = vec3(nn.x*cy + nn.z*sy, nn.y, -nn.x*sy + nn.z*cy);
    vec3 wp = aI.xyz + q;
    float hgt = max(p.y, 0.0)*s, wv = sin(uT*1.5 + wp.x*0.6 + wp.z*0.45 + aJ.z) + 0.45*sin(uT*3.4 + wp.x*1.9 + aJ.z*2.0);
    wp.xz += uWind*wv*aK.w*(hgt*hgt + 0.25*hgt);
    if (dot(aK.xyz, aK.xyz) > 0.01) nn = normalize(mix(nn, aK.xyz, 0.75));
    w = vec4(wp, 1.0); vN = nn; vI = vec4(aJ.y, aJ.z, hgt, 1.0);
  } else { w = uM*vec4(p, 1.0); vN = uNM*n; }
  vW = w.xyz; vC = aC; gl_Position = uVP*w; }`;

const FS = `#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 vW, vN, vC, vL; in vec4 vI; in vec2 vUV; out vec4 o; uniform sampler2D uBase; uniform int uTexOn;
uniform vec3 uCA, uCB, uCam, uSun, uSunC, uSky, uGnd, uRim, uFogC, uSunDir2; uniform vec2 uG, uStr, uFog;
uniform vec4 uF1, uF2, uSh[8]; uniform float uEm, uFl, uSpec, uShin, uInner, uT, uExpo, uRune, uSeed; uniform int uKind, uLeaf, uPass, uShadowOn;
uniform mat4 uLVP; uniform sampler2DShadow uShadow;
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a*n2(p); p = p*2.03 + vec2(1.7,9.2); a *= 0.5; } return s; }
float seg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa,ba)/dot(ba,ba), 0.0, 1.0); return length(pa - ba*h); }
vec3 sky(vec3 d){
  float el = d.y, az = atan(d.x, d.z);
  vec3 hz = vec3(0.98,0.64,0.38), mid = vec3(0.66,0.40,0.47), top = vec3(0.13,0.12,0.26);
  vec3 c = mix(mix(hz, mid, smoothstep(0.0,0.2,el)), top, smoothstep(0.16,0.7,el));
  float s = max(dot(d, uSunDir2), 0.0);
  c += vec3(1.0,0.66,0.38)*pow(s, 6.0)*0.22 + vec3(1.0,0.75,0.45)*pow(s, 70.0)*0.55 + vec3(1.0,0.9,0.7)*smoothstep(0.9997,0.99988,s);
  vec2 uv = d.xz/(max(d.y,0.0)+0.09); float cl = fbm(uv*0.9 + vec2(uT*0.006, 0.0))*0.8 + fbm(uv*2.4 - vec2(uT*0.01,0.0))*0.35;
  float band = smoothstep(0.52, 0.82, cl)*smoothstep(0.015,0.09,el)*(1.0 - smoothstep(0.3,0.62,el));
  vec3 cc = mix(vec3(0.42,0.30,0.44), vec3(1.0,0.66,0.46), clamp(pow(s,4.0)*1.4 + (1.0-smoothstep(0.0,0.25,el))*0.35, 0.0, 1.0));
  c = mix(c, cc, band*0.9);
  if (el > 0.2){ vec2 st = floor(vec2(az*160.0, el*160.0)); c += vec3(1.0,0.95,0.85)*step(0.9965, h2(st))*smoothstep(0.22,0.5,el)*(0.5 + 0.5*sin(uT*2.0 + h2(st+3.0)*20.0)); }
  float sideL = smoothstep(0.12, 0.42, -az), sideR = smoothstep(0.18, 0.5, az);
  float r1 = (0.03 + 0.055*fbm(vec2(az*2.4, 1.0)))*max(sideL, sideR*0.8), r2 = (0.012 + 0.04*fbm(vec2(az*5.3, 7.0)))*max(sideL, sideR);
  if (el < r1 && el > -0.05) c = mix(vec3(0.33,0.27,0.41), hz*0.75, 0.42 - el*2.0);
  if (el < r2 && el > -0.05) c = mix(vec3(0.20,0.17,0.25), hz*0.5, 0.25);
  return c; }
/* forme des feuilles (cartes découpées) */
float leafMask(vec2 uv){
  vec2 p = uv*2.0 - 1.0;
  if (uLeaf == 1){ /* bouquet d'aiguilles de pin */
    float a = atan(p.x, p.y + 1.0), r = length(vec2(p.x, p.y + 1.0)), k = abs(fract(a*5.0/3.14159 + 0.5) - 0.5);
    return step(k, 0.11*(1.0 - r*0.4))*step(r, 1.95)*step(0.12, r); }
  if (uLeaf == 2){ /* écailles de cyprès */
    float d = length(p*vec2(1.0, 0.75)); return step(d + n2(uv*9.0)*0.35, 0.95); }
  /* feuilles d'olivier : trois feuilles fines */
  float m = 0.0;
  for (int i = 0; i < 3; i++){ float an = (float(i) - 1.0)*0.55; vec2 q = mat2(cos(an), -sin(an), sin(an), cos(an))*vec2(p.x, p.y + 1.0) - vec2(0.0, 1.0);
    m = max(m, step(length(q*vec2(3.2, 1.0)), 0.95)); }
  return m; }
/* runes gravées (dans l'espace local de la pierre) */
float glyph(vec2 p, float id){
  float a = h2(vec2(id, 1.3)), b = h2(vec2(id, 2.7)), c = h2(vec2(id, 4.1));
  float d = seg(p, vec2(0.0,-1.0), vec2(0.0,1.0));
  d = min(d, seg(p, vec2(0.0, mix(0.2,0.9,a)), vec2(b > 0.5 ? 0.7 : -0.7, mix(-0.2,0.5,c))));
  if (b > 0.3) d = min(d, seg(p, vec2(0.0, mix(-0.6,0.0,c)), vec2(a > 0.5 ? -0.65 : 0.65, mix(-1.0,-0.25,b))));
  if (c > 0.55) d = min(d, seg(p, vec2(-0.55, 0.95), vec2(0.55, 0.55)));
  if (a < 0.25) d = min(d, length(p - vec2(0.55, -0.5)) - 0.05);
  return d; }
vec3 aces(vec3 x){ return clamp(x*(2.51*x + 0.03)/(x*(2.43*x + 0.59) + 0.14), 0.0, 1.0); }
float shadowAt(vec3 N){
  if (uShadowOn == 0) return 1.0;
  vec4 lp = uLVP*vec4(vW + N*0.04, 1.0); vec3 sc = lp.xyz/lp.w*0.5 + 0.5;
  if (sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z > 1.0) return 1.0;
  vec2 ts = 1.0/vec2(textureSize(uShadow, 0)); float s = 0.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) s += texture(uShadow, vec3(sc.xy + vec2(x, y)*ts*1.25, sc.z - 0.0012));
  return s/9.0; }
void main(){
  if (uKind == 6 && leafMask(vL.xy + vec2(0.5, 0.0)) < 0.5) discard;
  if (uPass == 1){ o = vec4(1.0); return; }
  vec3 N = normalize(vN), V = normalize(uCam - vW), base;
  if (uKind == 4){ vec3 d = normalize(vW - uCam); o = vec4(sky(d), 1.0); return; }
  if (uKind == 2){ /* mer */
    vec2 q = vW.xz*0.35; float e = 0.25, a = fbm(q + vec2(uT*0.05, uT*0.03)), bx = fbm(q + vec2(e,0) + vec2(uT*0.05, uT*0.03)), bz = fbm(q + vec2(0,e) + vec2(uT*0.05, uT*0.03));
    vec3 n = normalize(vec3((a-bx)*1.6, 1.0, (a-bz)*1.6)); vec3 R = reflect(-V, n);
    float fr = 0.12 + 0.5*pow(1.0 - max(dot(n, V), 0.0), 5.0);
    vec3 c = mix(vec3(0.09,0.19,0.27), sky(normalize(vec3(R.x, abs(R.y), R.z)))*0.75, fr);
    c += vec3(1.0,0.78,0.5)*pow(max(dot(R, uSunDir2), 0.0), 300.0)*1.6;
    float f = smoothstep(uFog.x, uFog.y*2.5, length(vW - uCam)); o = vec4(mix(c, vec3(0.42,0.32,0.4), f*0.65), 1.0); return; }
  if (uKind == 1){ /* sol de la lande */
    float a = fbm(vW.xz*0.45), b = n2(vW.xz*3.1), c2 = n2(vW.xz*13.0), c3 = n2(vW.xz*41.0);
    vec3 g = mix(vec3(0.25,0.34,0.13), vec3(0.45,0.55,0.22), a); g = mix(g, vec3(0.60,0.56,0.28), smoothstep(0.6,0.9,b)*0.5);
    g = mix(g, vec3(0.20,0.29,0.12), smoothstep(0.55,0.8,fbm(vW.xz*1.3 + 4.0))*0.5); g *= 0.82 + c2*0.22 + c3*0.12;
    vec2 q = (vW.xz - vec2(0.1, 2.4))/vec2(3.4, 3.6); float e = dot(q,q) + (a - 0.5)*0.6;
    float path = smoothstep(0.75, 0.25, abs(vW.x - 0.6 - sin(vW.z*0.45)*0.9))*smoothstep(3.5, 6.0, vW.z);
    vec3 dirt = mix(vec3(0.42,0.31,0.20), vec3(0.62,0.50,0.35), b)*(0.84 + c2*0.2 + c3*0.12);
    dirt = mix(dirt, vec3(0.33,0.24,0.16), smoothstep(0.62, 0.8, fbm(vW.xz*2.2 + 9.0))*0.6);
    float crack = smoothstep(0.018, 0.0, abs(n2(vW.xz*2.6) - 0.5))*smoothstep(0.5, 0.75, n2(vW.xz*0.9 + 3.0));
    dirt *= 1.0 - crack*0.2;
    float k = max(1.0 - smoothstep(0.72, 1.0, e), path*0.85); k = clamp(k + (c3 - 0.5)*0.25*k*(1.0 - k)*4.0, 0.0, 1.0);
    base = mix(g, dirt, k);
    float ed = smoothstep(0.3, 0.0, abs(k - 0.5))*0.25; base *= 1.0 - ed;
    N = normalize(vN); base = mix(base, vec3(0.42,0.40,0.36)*(0.8 + c2*0.3), smoothstep(0.82, 0.62, N.y));
  } else base = mix(uCA, uCB, smoothstep(uG.x, uG.y, vL.y))*vC;
  if (uTexOn == 1) base = texture(uBase, vUV).rgb*uCA;
  if (vI.w > 0.5) base *= mix(vec3(0.78,0.86,0.72), vec3(1.16,1.1,0.92), vI.x);
  if (uKind == 3 || uKind == 7){ /* roche : mousse, lichens */
    float r = fbm(vW.xz*1.7 + vW.y*1.3), r2 = n2(vec2(vW.x*9.0 + vW.z*7.0, vW.y*9.0));
    base *= 0.6 + r*0.5 + r2*0.12;
    float moss = smoothstep(0.35, 0.85, N.y + (r - 0.5)*0.9 + (1.0 - smoothstep(0.0, 0.5, vW.y))*0.25);
    base = mix(base, mix(vec3(0.24,0.33,0.12), vec3(0.42,0.48,0.18), r2), moss*0.85);
    vec2 lc = vec2(vW.x*11.0 + vW.z*5.0, vW.y*11.0 + vW.z*6.0); float lh = h2(floor(lc));
    if (lh > 0.93 && length(fract(lc) - 0.5) < 0.38*(lh - 0.9)*12.0) base = mix(base, lh > 0.965 ? vec3(0.85,0.55,0.18) : vec3(0.78,0.78,0.66), 0.75*(1.0 - moss)); }
  if (uKind == 5){ /* écorce */
    float s1 = n2(vec2((vW.x + vW.z)*7.0, vW.y*1.6)), s2 = n2(vec2((vW.x - vW.z)*16.0, vW.y*4.0));
    base *= 0.62 + s1*0.42 + s2*0.2; base *= 1.0 - smoothstep(0.42, 0.5, abs(s2 - 0.5))*0.5;
    base = mix(base, vec3(0.30,0.36,0.16), smoothstep(0.55, 0.95, N.y + n2(vW.xz*6.0)*0.4)*0.5); }
  if (uStr.y > 0.0) base *= 1.0 - uStr.y*smoothstep(0.32, 0.48, abs(fract(vL.y*uStr.x) - 0.5));
  if (dot(N, V) < 0.0){ N = -N; base *= uInner; }
  vec3 lin = pow(max(base, vec3(0.0)), vec3(2.2));
  float sh = 1.0;
  for (int i = 0; i < 8; i++){ if (uSh[i].z <= 0.0) continue; float d = length((vW.xz - uSh[i].xy)/vec2(1.0,0.82))/uSh[i].z; sh *= 1.0 - uSh[i].w*(1.0 - smoothstep(0.1, 1.0, d))*smoothstep(1.0, 0.0, vW.y); }
  float shd = shadowAt(N);
  float ndl = dot(N, uSun), wr = clamp((ndl + 0.35)/1.35, 0.0, 1.0); wr = wr*wr*(3.0 - 2.0*wr);
  if (uKind == 6 || uKind == 8) wr = mix(wr, 0.75, 0.35);
  vec3 amb = mix(uGnd, uSky, N.y*0.5 + 0.5)*mix(0.55, 1.0, sh);
  if (uKind == 6 || uKind == 8) amb *= 0.55 + 0.45*clamp(vI.z*1.4 + vL.y, 0.0, 1.0);
  vec3 col = lin*(amb + uSunC*wr*shd*sh);
  if (uKind == 6 || uKind == 8) col += lin*uSunC*pow(max(dot(-V, uSun), 0.0), 3.0)*0.55*shd;
  vec3 L = uF1.xyz - vW; float d2 = dot(L,L); col += lin*vec3(1.0,0.5,0.2)*uF1.w*max(dot(N, L*inversesqrt(d2)), 0.0)/(1.0 + d2*0.45);
  L = uF2.xyz - vW; d2 = dot(L,L); col += lin*vec3(1.0,0.6,0.25)*uF2.w*max(dot(N, L*inversesqrt(d2)), 0.0)/(1.0 + d2*0.9);
  vec3 H = normalize(uSun + V); col += uSunC*pow(max(dot(N,H), 0.0), uShin)*uSpec*shd*0.6;
  col += uRim*uRim*pow(1.0 - max(dot(N,V), 0.0), 3.0)*0.4*(uKind == 1 ? 0.0 : 1.0)*(0.4 + 0.6*shd);
  if (uKind == 7){ /* runes de la pierre */
    float best = 9.0;
    for (int g = 0; g < 3; g++){ vec2 c = vec2(0.0, 0.72 - float(g)*0.125); vec2 p = (vL.xy - c)/vec2(0.04, 0.05); best = min(best, glyph(p, uSeed*7.0 + float(g))*0.045); }
    float front = smoothstep(-0.04, -0.09, vL.z), groove = (1.0 - smoothstep(0.012, 0.022, best))*front, glow = (1.0 - smoothstep(0.0, 0.03, best))*front;
    col *= 1.0 - groove*0.6; col += vec3(1.0, 0.62, 0.2)*groove*uRune*1.1 + vec3(1.0,0.55,0.18)*glow*uRune*0.18; }
  col = mix(col, lin*1.2 + lin*lin*0.6, uEm);
  col = mix(col, vec3(1.0,0.96,0.88), uFl);
  float f = smoothstep(uFog.x, uFog.y, length(vW - uCam)); col = mix(col, pow(uFogC, vec3(2.2))*1.2, f*0.75);
  col = pow(aces(col*uExpo), vec3(1.0/2.2));
  o = vec4(col, 1.0); }`;

/* quads lumineux et brume */
const QVS = `#version 300 es
layout(location=0) in vec3 aP; layout(location=1) in vec4 aU; uniform mat4 uVP; out vec4 vU;
void main(){ vU = aU; gl_Position = uVP*vec4(aP,1.0); }`;
const QFS = `#version 300 es
precision highp float; in vec4 vU; out vec4 o; uniform vec4 uCol; uniform int uType; uniform float uT;
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
void main(){ vec2 uv = vU.xy*2.0 - 1.0; float r = length(uv), a;
  if (uType == 0) a = pow(max(1.0 - r, 0.0), 2.2);
  else if (uType == 1){ float n = n2(vU.xy*3.0 + vec2(vU.z*7.0 + uT*0.08, vU.z*3.0))*0.65 + n2(vU.xy*7.0 - uT*0.05)*0.35; a = smoothstep(1.0, 0.2, r)*smoothstep(0.32, 0.75, n); }
  else if (uType == 2) a = (1.0 - vU.x)*smoothstep(1.0, 0.0, abs(vU.y*2.0 - 1.0));
  else if (uType == 3) a = smoothstep(1.0, 0.6, abs(vU.y*2.0 - 1.0))*sin(vU.x*3.14159);
  else a = 1.0;
  o = vec4(uCol.rgb, uCol.a*a*vU.w); }`;

/* post-traitement plein écran : extraction des lumières, flou, composition */
const PVS = `#version 300 es
out vec2 vUV; void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); vUV = p; gl_Position = vec4(p*2.0 - 1.0, 0.0, 1.0); }`;
const PFS = `#version 300 es
precision highp float; in vec2 vUV; out vec4 o;
uniform sampler2D uTex, uBloom; uniform int uMode; uniform vec2 uDir; uniform float uBloomK, uT; uniform int uBloomOn;
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
void main(){
  if (uMode == 0){ vec2 ts = 1.0/vec2(textureSize(uTex, 0)); vec3 c = vec3(0.0);
    for (int i = 0; i < 4; i++){ vec2 off = vec2(float(i & 1), float(i >> 1)) - 0.5; vec3 s = texture(uTex, vUV + off*ts*2.0).rgb; float l = dot(s, vec3(0.3,0.59,0.11)); c += s*smoothstep(0.8, 1.0, l); }
    o = vec4(c*0.25, 1.0); return; }
  if (uMode == 1){ vec2 ts = 1.0/vec2(textureSize(uTex, 0)); vec3 c = texture(uTex, vUV).rgb*0.227;
    c += (texture(uTex, vUV + uDir*ts*1.384).rgb + texture(uTex, vUV - uDir*ts*1.384).rgb)*0.316;
    c += (texture(uTex, vUV + uDir*ts*3.23).rgb + texture(uTex, vUV - uDir*ts*3.23).rgb)*0.07;
    o = vec4(c, 1.0); return; }
  vec3 c = texture(uTex, vUV).rgb;
  if (uBloomOn == 1) c += texture(uBloom, vUV).rgb*uBloomK;
  vec2 q = vUV - vec2(0.5, 0.55);
  c *= mix(vec3(1.0), vec3(1.06, 0.98, 0.9), 1.0 - vUV.y) * mix(vec3(1.0), vec3(0.94, 0.95, 1.05), vUV.y*0.6);
  c *= 1.0 - smoothstep(0.35, 0.85, length(q*vec2(1.0, 0.85)))*0.5;
  c += (h2(vUV*913.0 + fract(uT)*31.0) - 0.5)*0.018;
  o = vec4(c, 1.0); }`;

/* =================== rendu WebGL : programmes, maillages, cibles de rendu =================== */
function makeGL(canvas){
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false, powerPreference: "high-performance" });
  if (!gl) return null;
  const prog = (vs, fs) => { const p = gl.createProgram(); [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]].forEach(([t, s]) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); gl.attachShader(p, sh); }); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; };
  const R = { gl, P: prog(VS, FS), Q: prog(QVS, QFS), PP: prog(PVS, PFS), loc: {}, qloc: {}, ploc: {} };
  R.u = n => R.loc[n] !== undefined ? R.loc[n] : (R.loc[n] = gl.getUniformLocation(R.P, n));
  R.qu = n => R.qloc[n] !== undefined ? R.qloc[n] : (R.qloc[n] = gl.getUniformLocation(R.Q, n));
  R.pu = n => R.ploc[n] !== undefined ? R.ploc[n] : (R.ploc[n] = gl.getUniformLocation(R.PP, n));
  R.qbuf = gl.createBuffer(); R.qvao = gl.createVertexArray(); gl.bindVertexArray(R.qvao); gl.bindBuffer(gl.ARRAY_BUFFER, R.qbuf);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
  R.evao = gl.createVertexArray(); gl.bindVertexArray(null);
  return R;
}
function mesh(R, g, dynamic){
  const gl = R.gl, o = { vao: gl.createVertexArray(), b: [gl.createBuffer(), gl.createBuffer(), gl.createBuffer()], n: 0 };
  gl.bindVertexArray(o.vao);
  [0,1,2].forEach(i => { gl.bindBuffer(gl.ARRAY_BUFFER, o.b[i]); gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 3, gl.FLOAT, false, 0, 0); });
  gl.bindVertexArray(null); o.set = gg => { o.n = gg.p.length/3; const c = gg.c || new Array(gg.p.length).fill(1);
    [gg.p, gg.n, c].forEach((arr, i) => { gl.bindBuffer(gl.ARRAY_BUFFER, o.b[i]); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW); }); };
  o.set(g); return o;
}
const DEF = { ca:[1,1,1], cb:null, g:[0,1], str:[0,0], em:0, fl:0, spec:.12, shin:22, inner:1, kind:0, wob:[0,0,0,0], leaf:0, rune:0, seed:0 };
const ID4 = m4.id();
function setMat(R, a, m){
  const gl = R.gl;
  gl.uniformMatrix4fv(R.u("uM"), false, m); gl.uniformMatrix3fv(R.u("uNM"), false, m4.nmat(m));
  gl.uniform3fv(R.u("uCA"), a.ca); gl.uniform3fv(R.u("uCB"), a.cb || a.ca); gl.uniform2fv(R.u("uG"), a.g); gl.uniform2fv(R.u("uStr"), a.str);
  gl.uniform1f(R.u("uEm"), a.em); gl.uniform1f(R.u("uFl"), a.fl); gl.uniform1f(R.u("uSpec"), a.spec); gl.uniform1f(R.u("uShin"), a.shin); gl.uniform1f(R.u("uInner"), a.inner);
  gl.uniform1i(R.u("uKind"), a.kind); gl.uniform4fv(R.u("uWob"), a.wob); gl.uniform1i(R.u("uLeaf"), a.leaf); gl.uniform1f(R.u("uRune"), a.rune); gl.uniform1f(R.u("uSeed"), a.seed);
}
function draw(R, o, m, mat){ const gl = R.gl; setMat(R, Object.assign({}, DEF, mat), m); gl.uniform1i(R.u("uInst"), 0); gl.bindVertexArray(o.vao); gl.drawArrays(gl.TRIANGLES, 0, o.n); }
function drawI(R, o, mat, count){ const gl = R.gl; setMat(R, Object.assign({}, DEF, mat), ID4); gl.uniform1i(R.u("uInst"), 1); gl.bindVertexArray(o.vao);
  gl.drawArraysInstanced(gl.TRIANGLES, 0, o.n, Math.min(o.count, count == null ? o.count : count)); gl.uniform1i(R.u("uInst"), 0); }

/* cibles : carte d'ombre, scène multi-échantillonnée, halo lumineux */
function makeTargets(R, W, H, q){
  const gl = R.gl, T = R.T || {};
  const del = () => { ["shTex","sceneTex","b1","b2"].forEach(k => T[k] && gl.deleteTexture(T[k])); ["msColor","msDepth"].forEach(k => T[k] && gl.deleteRenderbuffer(T[k])); ["shFB","msFB","sceneFB","b1FB","b2FB"].forEach(k => T[k] && gl.deleteFramebuffer(T[k])); };
  del();
  const tex = (w, h, fmt, ifmt, type, lin) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, lin ? gl.LINEAR : gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, lin ? gl.LINEAR : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
  const fb = (t, depth) => { const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, depth ? gl.DEPTH_ATTACHMENT : gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); return f; };
  T.shSize = q.shadow || 1;
  T.shTex = tex(T.shSize, T.shSize, gl.DEPTH_COMPONENT, gl.DEPTH_COMPONENT24, gl.UNSIGNED_INT, true);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  T.shFB = fb(T.shTex, true); gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
  const samples = Math.min(q.msaa, gl.getParameter(gl.MAX_SAMPLES));
  T.msFB = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, T.msFB);
  T.msColor = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, T.msColor); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, W, H); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, T.msColor);
  T.msDepth = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, T.msDepth); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, W, H); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, T.msDepth);
  T.sceneTex = tex(W, H, gl.RGBA, gl.RGBA8, gl.UNSIGNED_BYTE, true); T.sceneFB = fb(T.sceneTex);
  T.bw = Math.max(1, W >> 2); T.bh = Math.max(1, H >> 2);
  T.b1 = tex(T.bw, T.bh, gl.RGBA, gl.RGBA8, gl.UNSIGNED_BYTE, true); T.b1FB = fb(T.b1); T.b2 = tex(T.bw, T.bh, gl.RGBA, gl.RGBA8, gl.UNSIGNED_BYTE, true); T.b2FB = fb(T.b2);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); T.W = W; T.H = H; R.T = T; return T;
}
function post(R, q, t){
  const gl = R.gl, T = R.T;
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, T.msFB); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, T.sceneFB);
  gl.blitFramebuffer(0, 0, T.W, T.H, 0, 0, T.W, T.H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
  gl.useProgram(R.PP); gl.bindVertexArray(R.evao); gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
  gl.uniform1i(R.pu("uTex"), 0); gl.uniform1i(R.pu("uBloom"), 2); gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, null); gl.activeTexture(gl.TEXTURE0);
  const pass = (fbo, w, h, src, mode, dir) => { gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, w, h); gl.bindTexture(gl.TEXTURE_2D, src); gl.uniform1i(R.pu("uMode"), mode); gl.uniform2fv(R.pu("uDir"), dir || [0, 0]); gl.drawArrays(gl.TRIANGLES, 0, 3); };
  if (q.bloom){ pass(T.b1FB, T.bw, T.bh, T.sceneTex, 0); pass(T.b2FB, T.bw, T.bh, T.b1, 1, [1, 0]); pass(T.b1FB, T.bw, T.bh, T.b2, 1, [0, 1]); pass(T.b2FB, T.bw, T.bh, T.b1, 1, [2, 0]); pass(T.b1FB, T.bw, T.bh, T.b2, 1, [0, 2]); }
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, T.b1); gl.activeTexture(gl.TEXTURE0);
  gl.uniform1i(R.pu("uBloomOn"), q.bloom ? 1 : 0); gl.uniform1f(R.pu("uBloomK"), .7); gl.uniform1f(R.pu("uT"), t);
  pass(null, T.W, T.H, T.sceneTex, 2);
  gl.enable(gl.DEPTH_TEST);
}

/* =================== bibliothèque de formes =================== */
function buildShapes(R){
  const S = {}, add = (k, g, dyn) => { S["_" + k] = g; return (S[k] = mesh(R, g, dyn)); };
  add("sph", sphereG(28, 18)); add("sphLo", sphereG(14, 9));
  add("cyl", latheG([[0,0],[1,0],[1,0],[1,1],[1,1],[0,1]], 18)); add("cone", latheG([[0,0],[1,0],[1,0],[0,1]], 18));
  add("tunic", latheG([[0,.2],[.255,.215],[.27,.26],[.24,.36],[.205,.47],[.215,.58],[.205,.67],[.14,.725],[.07,.75],[0,.755]], 30));
  add("leg", latheG([[0,0],[.055,.005],[.066,.05],[.064,.16],[.06,.26],[0,.28]], 14));
  add("limb", latheG([[0,0],[.05,.004],[.056,.04],[.052,.15],[0,.17]], 14));
  add("boot", rboxG(.15, .13, .26, .05)); add("cuff", torusG(.075, .022, 18, 8));
  add("belt", torusG(.215, .026, 32, 8)); add("ring", torusG(1, .08, 28, 8));
  add("rbox", rboxG(1, 1, 1, .18)); add("rboxS", rboxG(1, 1, 1, .06));
  add("blade", latheG([[0,0],[.5,.02],[.5,.84],[0,1]], 4));
  add("leaf", latheG([[0,0],[.5,.22],[.34,.8],[0,1]], 4));
  add("helmet", latheG([[0,.12],[.29,.125],[.315,.19],[.3,.26],[.25,.33],[.15,.385],[0,.405]], 28));
  add("brim", latheG([[.27,.145],[.41,.112],[.42,.1],[.41,.092],[.27,.125]], 28));
  add("shield", latheG([[0,.05],[.12,.045],[.22,.03],[.27,.005],[.28,-.015],[.25,-.03],[0,-.035]], 30));
  add("quiver", latheG([[0,0],[.075,0],[.082,.04],[.08,.4],[.092,.42],[.088,.44],[0,.44]], 16));
  add("lambin", latheG([[0,0],[.6,.01],[.68,.05],[.66,.12],[.6,.24],[.52,.38],[.4,.52],[.24,.63],[.1,.68],[0,.69]], 40));
  add("flame", latheG([[0,-.34],[.2,-.3],[.31,-.18],[.35,-.03],[.31,.12],[.22,.28],[.13,.45],[.06,.62],[.02,.76],[0,.82]], 34));
  add("scroll", latheG([[0,0],[1,0],[1,0],[1,1],[1,1],[0,1]], 16));
  add("pageHead", rboxG(.46, .36, .38, .06)); add("sheet", rboxG(.62, .05, .46, .02)); add("book", rboxG(.22, .1, .3, .025)); add("pages", rboxG(.2, .075, .27, .015));
  add("seal", latheG([[0,.03],[.1,.03],[.12,.015],[.12,-.015],[0,-.02]], 20));
  add("lantern", latheG([[0,0],[.42,0],[.42,0],[.42,.9],[.42,.9],[0,.9]], 16));
  add("tower", latheG([[1.15,0],[1.15,.3],[1.0,4.5],[.86,8.4],[1.12,8.5],[1.12,8.75],[.6,8.8],[0,8.8]], 28));
  add("dome", latheG([[0,0],[.62,0],[.6,.15],[.42,.5],[.12,.8],[0,.95]], 20));
  /* cheveux, barbe, moustache de Tito */
  const hair = [], beard = [];
  for (let k = 0; k < 11; k++){ const ph = -1.45 + 2.9*k/10, wv = (k % 2 ? .02 : -.015);
    const path = []; for (let i = 0; i <= 8; i++){ const t = i/8; path.push([Math.sin(ph)*(.24 + .06*t + Math.sin(t*3)*.02) + Math.sin(t*5 + k)*.015, .17 - .6*t + wv*t, -Math.cos(ph)*(.23 + .08*t) - .02]); }
    hair.push(tubeG(path, t => .085*Math.pow(1 - t, .7) + .012, 10)); }
  [-1, 0, 1].forEach((s, k) => { const path = []; for (let i = 0; i <= 5; i++){ const t = i/5; path.push([s*.09 + s*.05*t, .25 - .12*t, .2 + .1*t]); } hair.push(tubeG(path, t => .07*(1 - t) + .015, 9)); });
  for (let k = 0; k < 7; k++){ const ps = -1.05 + 2.1*k/6, st = [Math.sin(ps)*.22, -.08, Math.cos(ps)*.2], tip = [Math.sin(ps)*.06, -.4, .19 + Math.cos(ps)*.02];
    const path = []; for (let i = 0; i <= 6; i++){ const t = i/6; path.push([lerp(st[0], tip[0], t), lerp(st[1], tip[1], t) - Math.sin(t*Math.PI)*.02, lerp(st[2], tip[2], t) + Math.sin(t*Math.PI)*.05]); }
    beard.push(tubeG(path, t => .075*Math.pow(1 - t, .8) + .012, 9)); }
  [-1, 1].forEach(s => { const path = []; for (let i = 0; i <= 5; i++){ const t = i/5; path.push([s*(.02 + .13*t), -.04 - .1*t*t, .27 - .05*t]); } beard.push(tubeG(path, t => .03*(1 - t*.6), 8)); });
  const merge = arr => ({ p: [].concat(...arr.map(a => a.p)), n: [].concat(...arr.map(a => a.n)) });
  add("titoHair", merge(hair)); add("titoBeard", merge(beard));
  /* queue de cheval de l'Archère, pointe de capuche */
  const pony = []; for (let k = 0; k < 3; k++){ const path = []; for (let i = 0; i <= 7; i++){ const t = i/7; path.push([(k - 1)*.04 + Math.sin(t*4 + k)*.02, .02 - .42*t, -.3 - .1*t + .05*t*t]); } pony.push(tubeG(path, t => .055*(1 - t) + .01, 9)); }
  add("pony", merge(pony));
  { const path = []; for (let i = 0; i <= 8; i++){ const t = i/8; path.push([0, .2 - .32*t*t, -.24 - .22*t]); } add("hoodTip", tubeG(path, t => .14*Math.pow(1 - t, 1.2) + .01, 12)); }
  /* arc recourbé */
  { const path = []; for (let i = 0; i <= 16; i++){ const t = i/16, y = lerp(-.46, .46, t), yy = Math.abs(y)/.46; path.push([0, y, -.13*(1 - yy*yy) + .05*Math.pow(yy, 6)]); } add("bow", tubeG(path, t => .022 - .01*Math.abs(t - .5)*2, 8)); }
  /* flammes latérales du Feu-de-Rancune */
  const wisps = []; [[1, .2], [-1, .2], [1, -.1], [-1, -.1]].forEach(([s, h], k) => { const path = []; for (let i = 0; i <= 7; i++){ const t = i/7; path.push([s*(.25 + .2*t), h + .18*t*t - .05*t, (k > 1 ? -.16 : -.08) - .1*t]); } wisps.push(tubeG(path, t => .075*Math.pow(1 - t, 1.3) + .006, 10)); });
  add("wisps", merge(wisps));
  { const path = []; for (let i = 0; i <= 6; i++){ const t = i/6; path.push([Math.sin(t*4)*.05, -.3 - .28*t, -.02 + Math.sin(t*3)*.04]); } add("tail", tubeG(path, t => .08*(1 - t) + .006, 10)); }
  /* sourcils et bouche boudeuse (tube courbé) */
  { const path = []; for (let i = 0; i <= 6; i++){ const t = i/6, a = lerp(-.9, .9, t); path.push([Math.sin(a)*.09, -Math.cos(a)*.035, 0]); } add("frown", tubeG(path, () => .018, 8)); }
  { const path = []; for (let i = 0; i <= 5; i++){ const t = i/5; path.push([lerp(-.07, .07, t), Math.sin(t*Math.PI)*.012, 0]); } add("brow", tubeG(path, t => .024*(1 - Math.abs(t - .5)*.6), 8)); }
  /* plume d'oie du Paperasseux */
  add("feather", clothG(2, 8, (u, v) => { const w = Math.sin(v*Math.PI)*.07*(1 - v*.3); return [(u - .5)*2*w, v*.45, Math.sin(v*3)*.04 + (u - .5)*(u - .5)*.05]; }));
  /* oriflamme rouge sous la lance */
  return S;
}


/* =================== zone de combat : « Lande du Phare » (décor organique) =================== */
m4.ortho = (l, r, b, t, n, f) => [2/(r-l),0,0,0, 0,2/(t-b),0,0, 0,0,-2/(f-n),0, -(r+l)/(r-l),-(t+b)/(t-b),-(f+n)/(f-n),1];
const smooth = (a, b, x) => { const t = clamp01((x - a)/(b - a)); return t*t*(3 - 2*t); };
function rng(seed){ let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => (s = (s*16807) % 2147483647) / 2147483647; }

const ZONE_LANDE = {
  name: "Lande du Phare",
  sun: v3.nrm([-.72, .6, .34]), sunC: [1.55, 1.18, .86], sky: [.30, .30, .44], gnd: [.20, .15, .13], rim: [1.0, .62, .36],
  fogC: [.50, .40, .50], fog: [11, 42], sunDir2: v3.nrm([-.3, .055, 1]), wind: [.05, .02], expo: 1.15,
  arena: { cx: .1, cz: 2.4, rx: 3.6, rz: 3.8 }
};
/* relief : arène plate, collines douces sur les côtés, retour à plat au bord de la falaise */
function terrainH(x, z){
  const A = ZONE_LANDE.arena, q = ((x - A.cx)/(A.rx + 1))**2 + ((z - A.cz)/(A.rz + .8))**2;
  const rise = smooth(1, 3.2, q), side = smooth(5, 12, Math.abs(x)) * 2.4;
  const n = (vnoise(x*.32, z*.32, 21) - .5)*1.3 + (vnoise(x*1.05, z*1.05, 22) - .5)*.3;
  const cliff = 1 - smooth(9.5, 12.1, z);
  return Math.max(0, (rise*(.35 + n*.6) + side*(.6 + n*.4)) * cliff);
}
const inArena = (x, z, m) => { const A = ZONE_LANDE.arena; return ((x - A.cx)/A.rx)**2 + ((z - A.cz)/A.rz)**2 < (m || 1); };
const onPath = (x, z) => z > 3.5 && Math.abs(x - .6 - Math.sin(z*.45)*.9) < .7;

/* ---------- géométries de base ---------- */
const QUAD = { p: [-.5,0,0, .5,0,0, .5,1,0, -.5,0,0, .5,1,0, -.5,1,0], n: [0,0,1, 0,0,1, 0,0,1, 0,0,1, 0,0,1, 0,0,1] };
function merge(arr){ return { p: [].concat(...arr.map(a => a.p)), n: [].concat(...arr.map(a => a.n)) }; }
function xform(g, m){ const nm = m4.nmat(m), p = [], n = [];
  for (let i = 0; i < g.p.length; i += 3){ const q = m4.tp(m, [g.p[i], g.p[i+1], g.p[i+2]]); p.push(q[0], q[1], q[2]);
    const nn = v3.nrm([nm[0]*g.n[i]+nm[3]*g.n[i+1]+nm[6]*g.n[i+2], nm[1]*g.n[i]+nm[4]*g.n[i+1]+nm[7]*g.n[i+2], nm[2]*g.n[i]+nm[5]*g.n[i+1]+nm[8]*g.n[i+2]]); n.push(nn[0], nn[1], nn[2]); }
  return { p, n }; }
function tuftG(blades, h, w, curl){ const out = [];
  for (let b = 0; b < blades; b++){ const a = b/blades*Math.PI*2 + b*.7, lean = .25 + (b % 3)*.12, hh = h*(.75 + (b % 4)*.1);
    const g = clothG(1, 4, (u, v) => [(u - .5)*w*(1 - v*.85), v*hh, v*v*curl*lean*hh]);
    out.push(xform(g, M(m4.RY(a), m4.RX(-lean*.4), m4.T((b % 2 ? .02 : -.02), 0, 0)))); }
  return merge(out); }
function rockG(seed, detail){ const g = sphereG(detail || 13, Math.round((detail || 13)*.7)), p = g.p.slice();
  for (let i = 0; i < p.length; i += 3){ const d = .78 + vnoise(p[i]*2.3 + seed, p[i+1]*2.3 + p[i+2]*1.7, 7)*.45 + vnoise(p[i]*6 + seed, p[i+2]*6, 8)*.1; p[i] *= d; p[i+1] *= d; p[i+2] *= d; }
  return { p, n: g.n }; }
function flowerG(kind){ const parts = [], h = .3;
  parts.push(xform(latheG([[0,0],[.007,0],[.006,h],[0,h]], 5), m4.id()));
  if (kind === "pavot"){ for (let i = 0; i < 4; i++) parts.push(xform(sphereG(8, 6), M(m4.T(0, h, 0), m4.RY(i*Math.PI/2), m4.T(.035, .01, 0), m4.RZ(-.5), m4.S(.04, .012, .035))));
    parts.push(xform(sphereG(6, 4), M(m4.T(0, h + .012, 0), m4.S(.015, .015, .015)))); }
  else if (kind === "marguerite"){ for (let i = 0; i < 10; i++) parts.push(xform(sphereG(6, 4), M(m4.T(0, h, 0), m4.RY(i*Math.PI/5), m4.T(.028, 0, 0), m4.S(.026, .006, .009))));
    parts.push(xform(sphereG(6, 4), M(m4.T(0, h + .004, 0), m4.S(.014, .01, .014)))); }
  else { for (let i = 0; i < 6; i++) parts.push(xform(sphereG(6, 4), M(m4.T(0, h - .05 + i*.012, 0), m4.RY(i*2.1), m4.T(.018, 0, 0), m4.S(.016, .012, .016)))); }
  return merge(parts); }
function lavenderG(){ const parts = [];
  for (let i = 0; i < 9; i++){ const a = i/9*Math.PI*2 + i, lean = .15 + (i % 3)*.12, h = .32 + (i % 4)*.05, m = M(m4.RY(a), m4.RZ(lean));
    parts.push(xform(latheG([[0,0],[.006,0],[.005,h],[0,h]], 4), m));
    parts.push(xform(latheG([[0,0],[.018,.02],[.022,.06],[.016,.1],[0,.12]], 6), M(m, m4.T(0, h - .02, 0)))); }
  return merge(parts); }
/* menhir organique : silhouette irrégulière, bosses, arêtes adoucies */
function menhirG(seed, w, d, bend){
  return clothG(48, 36, (u, v) => {
    const a = u*Math.PI*2, t = v, c = Math.cos(a), s = Math.sin(a);
    const sx = Math.sign(c)*Math.pow(Math.abs(c), .5), sz = Math.sign(s)*Math.pow(Math.abs(s), .5);
    const prof = (1 + .14*Math.sin(t*2.6 + seed) - .38*t) * Math.sqrt(Math.max(0, 1 - Math.pow(t, 7)));
    const low = vnoise(c*1.5 + seed, t*2.1 + s, 31) - .5, mid = vnoise(s*4 + seed*1.7, t*7 + c, 32) - .5, chip = Math.abs(vnoise(c*9 + s*3, t*16 + seed, 33) - .5), fine = vnoise(c*22, t*30 + s*9 + seed, 35) - .5;
    const disp = low*.5 + mid*.18 - chip*.16 + fine*.03;
    const top = (vnoise(c*2.2, s*2.2 + seed, 34) - .5)*.28*Math.pow(t, 4);
    return [sx*w*prof*(1 + disp) + bend*t*t, t*1.06 - .14 + top, sz*d*prof*(1 + disp*.85)]; });
}

/* ---------- arbres organiques (branches récursives + feuillage en cartes) ---------- */
function makeTrees(rand){
  const bark = [], bodies = [], cards = { pine: [], olive: [], cyp: [], bush: [], broom: [] };
  const BARK = { pine: C3("#6E4A33"), olive: C3("#7A6F5E"), cyp: C3("#5A4434") };
  const tube = (path, r0, r1, col) => bark.push({ g: tubeG(path, t => lerp(r0, r1, Math.pow(t, .8)), 10), m: m4.id(), col, jit: .1 });
  const grow = (a, dir, len, bend, up, n, sd) => { const path = [a.slice()]; let p = a.slice(), d = dir.slice();
    for (let i = 1; i <= n; i++){ d = v3.nrm(v3.add(d, [(rand() - .5)*bend, (rand() - .5)*bend*.5 + up, (rand() - .5)*bend])); p = v3.add(p, v3.sc(d, len/n)); path.push(p.slice()); }
    return { path, end: p, dir: d }; };
  const clump = (set, c, rad, flat, count, leafScale, bodyCol, wind) => {
    bodies.push({ g: rockG(rand()*50, 12), m: M(m4.T(c[0], c[1], c[2]), m4.S(rad*.82, rad*.82*flat, rad*.82)), col: bodyCol, jit: .25 });
    for (let i = 0; i < count; i++){
      let dir = v3.nrm([rand()*2 - 1, (rand()*2 - 1)*.8 + .35, rand()*2 - 1]); const r = rad*(.72 + rand()*.38);
      const p = [c[0] + dir[0]*r, c[1] + dir[1]*r*flat, c[2] + dir[2]*r], nn = v3.nrm([dir[0], dir[1]/Math.max(flat, .3), dir[2]]);
      set.push(p[0], p[1] - leafScale*.3, p[2], Math.atan2(dir[0], dir[2]) + (rand() - .5)*1.2, leafScale*(.75 + rand()*.5), rand(), rand()*6.28, (rand() - .5)*1.4 - dir[1]*.6, nn[0], nn[1], nn[2], wind);
    } };
  const roots = (b, n, r, col) => { for (let i = 0; i < n; i++){ const a = i/n*Math.PI*2 + rand(); const g = grow([b[0], b[1] + .35, b[2]], [Math.cos(a), -.5, Math.sin(a)], .75, .3, -.05, 5); tube(g.path, r, .02, col); } };
  /* pin parasol */
  const umbrella = (x, z, H, s) => { const y = terrainH(x, z), b = [x, y - .1, z], lean = [(rand() - .5)*.3, 1, (rand() - .5)*.3];
    roots(b, 5, .16*s, BARK.pine);
    const tr = grow(b, v3.nrm(lean), H*.62*s, .22, .04, 8); tube(tr.path, .26*s, .17*s, BARK.pine);
    const tips = [];
    for (let k = 0; k < 4; k++){ const a = k/4*Math.PI*2 + rand()*.8, br = grow(tr.end, v3.nrm([Math.cos(a), .55, Math.sin(a)]), (1.3 + rand()*.6)*s, .35, .03, 6); tube(br.path, .15*s, .085*s, BARK.pine);
      for (let j = 0; j < 2 + (rand() > .5 ? 1 : 0); j++){ const sb = grow(br.end, v3.nrm(v3.add(br.dir, [(rand() - .5)*1.2, .3, (rand() - .5)*1.2])), (.7 + rand()*.5)*s, .4, .05, 4); tube(sb.path, .08*s, .03*s, BARK.pine); tips.push(sb.end); } }
    tips.push(v3.add(tr.end, [0, .9*s, 0]));
    tips.forEach(t => clump(cards.pine, v3.add(t, [0, .2*s, 0]), (.95 + rand()*.3)*s, .48, 120, .5*s, C3("#2E431F"), .12)); };
  /* olivier tortueux */
  const olive = (x, z, s) => { const y = terrainH(x, z), b = [x, y - .05, z];
    roots(b, 4, .13*s, BARK.olive);
    for (let k = 0; k < 3; k++){ const a = k/3*Math.PI*2 + rand(), path = [];
      for (let i = 0; i <= 10; i++){ const t = i/10, sp = a + t*2.4; path.push([b[0] + Math.cos(sp)*.12*s*(1 - t*.3) + Math.cos(a)*t*.35*s, b[1] + t*1.35*s, b[2] + Math.sin(sp)*.12*s*(1 - t*.3) + Math.sin(a)*t*.35*s]); }
      tube(path, .14*s, .1*s, BARK.olive);
      const top = path[10];
      for (let j = 0; j < 3; j++){ const aa = a + (j - 1)*.9, br = grow(top, v3.nrm([Math.cos(aa), .8, Math.sin(aa)]), (.8 + rand()*.5)*s, .55, .02, 5); tube(br.path, .08*s, .035*s, BARK.olive);
        clump(cards.olive, v3.add(br.end, [0, .15*s, 0]), (.62 + rand()*.25)*s, .72, 75, .32*s, C3("#3C4A2A"), .18); } } };
  /* cyprès */
  const cypress = (x, z, s) => { const y = terrainH(x, z), b = [x, y - .05, z];
    tube([b, v3.add(b, [0, .6*s, 0])], .14*s, .1*s, BARK.cyp);
    for (let i = 0; i < 17; i++){ const t = i/17, rad = (.55*(1 - Math.pow(t, 1.4)) + .1)*s;
      clump(cards.cyp, [x + (rand() - .5)*.1*s, b[1] + (.5 + t*4.3)*s, z + (rand() - .5)*.1*s], rad, 1.1, 64, .3*s, C3("#1A2814"), .1); } };
  /* garrigue : buissons et genêts */
  const bush = (x, z, s, broom) => { const y = terrainH(x, z);
    clump(cards.bush, [x, y + .32*s, z], .5*s, .7, 45, .24*s, C3("#34421F"), .3);
    if (broom) for (let i = 0; i < 26; i++){ const a = rand()*6.28, r = rand()*.42*s; cards.broom.push(x + Math.cos(a)*r, y + .45*s + rand()*.25*s, z + Math.sin(a)*r, rand()*6.28, .13*s, rand(), rand()*6.28, -.4, 0, 1, 0, .3); } };
  umbrella(-6.4, 9.6, 4.6, 1.1); umbrella(-9.6, 3.0, 4.0, 1.0); umbrella(6.2, 10.4, 4.4, 1.05);
  olive(-4.7, 4.4, 1.0); olive(5.2, 6.6, 1.05); olive(-5.6, -1.4, .9);
  [[-3.4, 10.9, 1.0], [-2.7, 11.4, .82], [3.3, 11.1, .95], [8.4, 9.4, .9]].forEach(c => cypress(c[0], c[1], c[2]));
  [[-4.2, 3.4, 1, 1], [-3.6, 6.8, .8, 0], [4.6, 5.6, 1.1, 0], [3.4, 8.2, .8, 1], [-6.5, 4.8, 1.2, 1], [5.8, -.6, .9, 0], [-2.6, 9.4, .75, 0], [7.6, 5.4, 1.2, 1], [-8.4, 8.6, 1.3, 0], [2.0, 10.4, .7, 1], [-3.2, -2.6, .9, 0], [4.0, -2.4, 1.0, 1]].forEach(b => bush(b[0], b[1], b[2], b[3]));
  return { bark, bodies, cards };
}

function buildWorld(R, S){
  const gl = R.gl, W = {}, rand = rng(4242);
  /* sol en relief */
  W.ground = mesh(R, clothG(150, 64, (u, v) => { const x = lerp(-34, 34, u), z = lerp(-14, 12.25, v); return [x, terrainH(x, z), z]; }));
  W.sea = mesh(R, { p: [-500,-4.2,-20, -500,-4.2,600, 500,-4.2,-20, 500,-4.2,-20, -500,-4.2,600, 500,-4.2,600], n: [0,1,0, 0,1,0, 0,1,0, 0,1,0, 0,1,0, 0,1,0] });
  /* falaise, rochers, mur de pierres sèches, dalles du chemin */
  const rocks = [];
  rocks.push({ g: clothG(110, 9, (u, v) => { const x = lerp(-34, 34, u), nn = vnoise(x*.6, v*3, 2)*.9 + vnoise(x*2, v*6, 4)*.35; return [x, lerp(.02, -4.6, v) + (v > 0 && v < 1 ? (vnoise(x*1.3, v*5, 5) - .5)*.6 : 0), 12.15 + v*1.1 + nn*.8 - .4]; }), m: m4.id(), col: C3("#7A6F60"), jit: .18 });
  [[-3.9,1.6,.5],[4.2,1.2,.45],[-4.6,4.6,.6],[3.8,6.4,.55],[-2.6,8.6,.4],[5.2,9.2,.7],[-6.8,10.5,.9],[1.9,10.9,.35],[6.6,2.4,.35],[-5.6,-1.6,.4],[8.2,4.0,.8],[-8.8,5.6,.7]].forEach(([x,z,s], i) =>
    rocks.push({ g: rockG(i*3.1, 18), m: M(m4.T(x, terrainH(x, z) - s*.2, z), m4.RY(i), m4.S(s*1.3, s*.8, s)), col: C3(i % 2 ? "#857B6C" : "#7A7264"), jit: .2 }));
  for (let i = 0; i < 16; i++){ const x = -10.4 + i*.32 + (rand() - .5)*.06, z = 6.9 - i*.1, row = i % 3, miss = (i > 6 && i < 9) || i > 13;
    for (let r = 0; r < (miss ? 1 : 3) - (row === 1 && i % 5 === 0 ? 1 : 0); r++){ const sx = .3 + rand()*.12, sy = .18 + rand()*.06;
      rocks.push({ g: rockG(i*7 + r, 10), m: M(m4.T(x + (r % 2)*.15, terrainH(x, z) + .08 + r*.19, z + (rand() - .5)*.08), m4.RY(-.32 + (rand() - .5)*.3), m4.S(sx, sy, .2)), col: C3(rand() > .5 ? "#8F8574" : "#80786A"), jit: .25 }); } }
  for (let i = 0; i < 9; i++){ const z = 4.8 + i*.75, x = .6 + Math.sin(z*.45)*.9 + (rand() - .5)*.3;
    rocks.push({ g: rockG(i*11, 12), m: M(m4.T(x, terrainH(x, z) - .04, z), m4.RY(rand()*3), m4.S(.42 + rand()*.15, .07, .32 + rand()*.1)), col: C3("#958B7B"), jit: .2 }); }
  W.rocks = mesh(R, bake(rocks));
  /* menhirs (deux portent des runes), un menhir couché */
  W.menhirs = [];
  [[-4.6,7.6,2.1,.16,0],[-2.0,8.8,2.6,-.08,1],[1.7,9.1,2.4,.1,1],[4.5,8.0,2.0,-.15,0],[6.0,5.8,1.6,.22,0]].forEach(([x,z,h,tilt,rune], i) => {
    const g = menhirG(i*5.3 + 1, .27, .17, (rand() - .5)*.1);
    W.menhirs.push({ o: mesh(R, g), m: M(m4.T(x, terrainH(x, z), z), m4.RY(-x*.06 + (rand() - .5)*.2), m4.RZ(tilt*.35), m4.RX(-.04), m4.S(h, h, h)), rune, seed: i + 1 });
    for (let k = 0; k < 5; k++){ const a = rand()*6.28, r = .45 + rand()*.35; W.extraRubble = W.extraRubble || []; W.extraRubble.push({ g: rockG(i*9 + k, 9), m: M(m4.T(x + Math.cos(a)*r, terrainH(x, z) - .02, z + Math.sin(a)*r*.7), m4.RY(rand()*3), m4.S(.12 + rand()*.1, .08, .1 + rand()*.08)), col: C3("#7D7568"), jit: .25 }); } });
  W.menhirs.push({ o: mesh(R, menhirG(31, .27, .17, 0)), m: M(m4.T(-6.6, terrainH(-6.6, 7.4) + .22, 7.4), m4.RY(.6), m4.RZ(Math.PI/2 - .05), m4.S(2.2, 2.2, 2.2)), rune: 0, seed: 9 });
  W.rubble = mesh(R, bake(W.extraRubble));
  /* arbres, buissons, souche, tronc couché, clôture */
  const T = makeTrees(rand), wood = [];
  { const path = []; for (let i = 0; i <= 8; i++){ const t = i/8; path.push([-3.2 + t*2.3, terrainH(-2, 10) + .22 + Math.sin(t*3)*.05, 10.0 + t*.5]); }
    wood.push({ g: tubeG(path, t => .24 - t*.05, 14), m: m4.id(), col: C3("#5E4532"), jit: .15 });
    const br = []; for (let i = 0; i <= 4; i++){ const t = i/4; br.push([-2.4 + t*.2, terrainH(-2, 10) + .35 + t*.5, 10.3 - t*.15]); } wood.push({ g: tubeG(br, t => .07*(1 - t*.7), 8), m: m4.id(), col: C3("#5E4532"), jit: .15 }); }
  for (let i = 0; i < 8; i++){ const x = -6.8 + i*1.65 + (rand() - .5)*.2, z = 11.15 + Math.sin(i*1.3)*.22, y = terrainH(x, z), h = .75 + rand()*.25, lean = (rand() - .5)*.16;
    wood.push({ g: tubeG([[x, y - .1, z], [x + lean*.3, y + h*.5, z], [x + lean, y + h, z + lean*.3]], t => .055 - t*.012, 7), m: m4.id(), col: C3("#6E5640"), jit: .2 });
    if (i < 7 && i !== 3){ const x2 = x + 1.65; wood.push({ g: tubeG([[x, y + .55, z + .03], [x + .82, y + .5 - .04, z + .06], [x2, terrainH(x2, z) + .55, z + .03]], () => .03, 6), m: m4.id(), col: C3("#7A6048"), jit: .2 }); } }
  W.bark = mesh(R, bake(T.bark.concat(wood)));
  W.bodies = mesh(R, bake(T.bodies));
  const mush = []; [[-2.9, .0], [-2.55, .08], [-1.6, .02]].forEach(([dx, dz], i) => { const x = dx, z = 10.15 + dz, y = terrainH(-2, 10) + .38;
    mush.push({ g: latheG([[0,0],[.018,0],[.016,.07],[0,.07]], 6), m: M(m4.T(x, y, z), m4.RZ(.2)), col: C3("#E6DCC6") });
    mush.push({ g: latheG([[0,0],[.06,.0],[.055,.02],[.03,.04],[0,.045]], 12), m: M(m4.T(x + .013, y + .07, z), m4.RZ(.2)), col: C3(i === 1 ? "#B7643A" : "#C9873F") }); });
  W.props = mesh(R, bake(mush));
  /* jeux d'instances (herbe, fleurs, lavande, cailloux, feuillages) */
  const inst = (g, data) => { const o = mesh(R, g); gl.bindVertexArray(o.vao); const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    [3,4,5].forEach((loc, i) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 48, i*16); gl.vertexAttribDivisor(loc, 1); }); gl.bindVertexArray(null); o.count = data.length/12; return o; };
  const scatter = (n, test, rec) => { const out = []; let guard = 0; while (out.length/12 < n && guard++ < n*40){ const x = (rand() - .5)*30, z = rand()*17.5 - 5.6; if (!test(x, z)) continue; out.push(...rec(x, z)); } return out; };
  const grassOK = (x, z) => !inArena(x, z, 1.08) && !onPath(x, z) && z < 11.9 && !(x > -10.7 && x < -5.3 && Math.abs(z - (6.9 - (x + 10.4)/.32*.1)) < .32);
  W.grass = inst(tuftG(7, .34, .05, .9), scatter(3200, (x, z) => grassOK(x, z) || (inArena(x, z, 1.25) && rand() > .55 && !inArena(x, z, .95)), (x, z) => [x, terrainH(x, z) - .02, z, rand()*6.28, .7 + rand()*.7, rand(), rand()*6.28, 0, 0, 1, 0, 1]));
  W.dry = inst(tuftG(9, .55, .035, 1.2), scatter(420, (x, z) => grassOK(x, z) && (Math.abs(x) > 3.5 || z > 7), (x, z) => [x, terrainH(x, z) - .02, z, rand()*6.28, .8 + rand()*.6, rand(), rand()*6.28, 0, 0, 1, 0, 1]));
  const fl = (n) => scatter(n, (x, z) => grassOK(x, z) && vnoise(x*.5, z*.5, 51) > .45, (x, z) => [x, terrainH(x, z), z, rand()*6.28, .8 + rand()*.6, rand(), rand()*6.28, (rand() - .5)*.3, 0, 0, 0, .8]);
  W.pavot = inst(flowerG("pavot"), fl(170)); W.marg = inst(flowerG("marguerite"), fl(220)); W.bouton = inst(flowerG("bouton"), fl(160));
  W.lav = inst(lavenderG(), (() => { const out = []; [[-4.6, .6], [-5.4, 2.6], [4.9, 1.2], [5.6, 3.4], [-3.6, -1.6], [3.6, -1.0], [-1.0, 10.8]].forEach(([cx, cz]) => {
    for (let i = 0; i < 14; i++){ const x = cx + (rand() - .5)*1.7, z = cz + (rand() - .5)*1.1; out.push(x, terrainH(x, z), z, rand()*6.28, .9 + rand()*.5, rand(), rand()*6.28, 0, 0, 0, 0, .7); } }); return out; })());
  W.pebbles = inst(rockG(3, 9), scatter(520, (x, z) => z < 11.8, (x, z) => { const s = .03 + Math.pow(rand(), 3)*.08; return [x, terrainH(x, z) - s*.3, z, rand()*6.28, s, rand(), 0, (rand() - .5)*.4, 0, 0, 0, 0]; }));
  W.card = { pine: inst(QUAD, T.cards.pine), olive: inst(QUAD, T.cards.olive), cyp: inst(QUAD, T.cards.cyp), bush: inst(QUAD, T.cards.bush), broom: inst(QUAD, T.cards.broom) };
  /* îlot du phare, maison du gardien, voilier, goélands */
  W.isle = mesh(R, bake([{ g: rockG(9), m: M(m4.T(6.5, -4.6, 40), m4.S(2.6, 6.0, 2.3)), col: C3("#5A5248"), jit: .2 }, { g: rockG(4), m: M(m4.T(9.2, -4.4, 41.5), m4.S(2.2, 2.4, 1.8)), col: C3("#5E564C"), jit: .2 },
    { g: S._rboxS, m: M(m4.T(8.2, 1.9, 40.6), m4.S(1.4, 1.1, 1.2)), col: C3("#D8CCB4"), jit: .05 }, { g: latheG([[0,0],[1,0],[0,1]], 4), m: M(m4.T(8.2, 2.45, 40.6), m4.RY(Math.PI/4), m4.S(1.1, .8, .95)), col: C3("#A4523A"), jit: .1 }]));
  W.boatHull = mesh(R, bake([{ g: S._rboxS, m: m4.S(1.8, .35, .55), col: C3("#5A3A26") }]));
  W.sail = mesh(R, bake([{ g: clothG(3, 4, (u, v) => [0, v*2.0, u*1.1*(1 - v*.85) + Math.sin(v*3)*.1]), m: m4.id(), col: C3("#E8DCC2") }]));
  W.wing = mesh(R, clothG(3, 2, (u, v) => [u*.55, Math.sin(u*Math.PI)*.04, (v - .5)*.16*(1 - u*.7)]));
  W.gullBody = mesh(R, sphereG(10, 6));
  return W;
}

/* =================== personnages =================== */
const PALS = {
  tito: { skin:C3("#E0A97C"), hair:C3("#5B3B22"), beard:C3("#46301C"), tunic:C3("#6E7B3E"), tunic2:C3("#56602F"), pants:C3("#574636"), boot:C3("#3B281A"), leather:C3("#6B4528"), gold:C3("#D9A93E"), cape:C3("#8E3428"), cape2:C3("#6A2219"), steel:C3("#C4C8CB"), rust:C3("#8C5A3C"), iron:C3("#55524E") },
  piq: { skin:C3("#C99266"), hair:C3("#2E2520"), tunic:C3("#55707E"), tunic2:C3("#3F5662"), pants:C3("#4A4038"), boot:C3("#33261C"), leather:C3("#5A3A22"), metal:C3("#A7AFB4"), wood:C3("#7E5431"), paint:C3("#A33A2C"), ribbon:C3("#B23A2A") },
  arch: { skin:C3("#E6B892"), hair:C3("#D4AE62"), tunic:C3("#58733E"), tunic2:C3("#435A2F"), pants:C3("#5A4A38"), boot:C3("#3B2A1C"), leather:C3("#6B4528"), hood:C3("#6E5C3C"), hood2:C3("#58492F"), wood:C3("#8A5C35"), string:C3("#E6D9B8"), fletch:C3("#C0392B") }
};
function capeG(t, flap, wide, len){
  return clothG(14, 9, (u, v) => {
    const th = lerp(-1.55*wide, 1.55*wide, u), R0 = .24 + v*.13, jag = (hash(Math.floor(u*14), 7, 2)*.12 + Math.abs(((u*7) % 1) - .5)*.1) * Math.pow(v, 4);
    const wave = v*v*(.05*Math.sin(t*3.1 + u*7) + flap*.28), side = v*v*.03*Math.sin(t*2.6 + u*5);
    return [Math.sin(th)*R0*(1 + .05*v) + side, .73 - v*len + jag, -Math.cos(th)*R0*.92 - wave - v*.04]; });
}
function humanoid(R, S, D, o){
  const P = PALS[o.kind], t = o.t, base = M(m4.T(o.x, o.y || 0, o.z), m4.RY(o.yaw));
  const sw = o.run ? Math.sin(o.runPh)*.8 : 0, br = Math.sin(t*2.3 + o.z)*.012, fl = o.flash || 0;
  const mat = (ca, x) => Object.assign({ ca, fl }, x || {});
  /* jambes et bottes */
  [-1, 1].forEach(s => { const hip = M(base, m4.T(s*.095, .36, 0), m4.RX(s*sw)), knee = M(hip, m4.T(0, -.3, 0));
    draw(R, S.leg, M(hip, m4.T(0, -.3, 0)), mat(P.pants)); draw(R, S.boot, M(knee, m4.T(0, -.02, .035)), mat(P.boot, { spec:.25, shin:30 })); draw(R, S.cuff, M(knee, m4.T(0, .07, .0)), mat(P.boot)); });
  const body = M(base, m4.T(0, br, 0), m4.RY(o.twist || 0));
  draw(R, S.tunic, M(body, m4.S(1, 1, .84)), mat(P.tunic2, { cb:P.tunic, g:[.22,.5], str: o.kind === "piq" ? [26, .22] : [0,0] }));
  draw(R, S.belt, M(body, m4.T(0, .43, 0), m4.S(1, 1, .86)), mat(P.leather, { spec:.3, shin:30 }));
  if (o.kind === "tito"){ draw(R, S.rboxS, M(body, m4.T(0, .43, .18), m4.S(.075, .065, .03)), mat(P.gold, { spec:.9, shin:50 })); draw(R, S.rbox, M(body, m4.T(-.17, .38, -.1), m4.RY(.5), m4.S(.1, .12, .07)), mat(P.leather)); }
  /* bras (épaule, coude, gant) */
  const arm = (s, rx, rz, elbow) => { const sh = M(body, m4.T(s*.235, .655, 0), m4.RX(rx), m4.RZ(s*rz)); const el = M(sh, m4.T(0, -.17, 0), m4.RX(elbow));
    draw(R, S.limb, M(sh, m4.T(0, -.17, 0)), mat(P.tunic)); draw(R, S.limb, M(el, m4.T(0, -.16, 0)), mat(o.kind === "tito" ? P.leather : P.tunic));
    draw(R, S.sph, M(el, m4.T(0, -.18, 0), m4.S(.06, .062, .06)), mat(o.kind === "tito" ? P.leather : P.skin)); return M(el, m4.T(0, -.19, 0)); };
  const handL = arm(-1, -sw*.8 + (o.armL || 0), .14 + (o.armLz || 0), o.elbowL || -.25), handR = arm(1, sw*.8 + (o.armR || 0), .14 + (o.armRz || 0), o.elbowR || -.3);
  /* tête */
  const head = M(body, m4.T(0, .99, 0), m4.RY(o.headYaw || 0), m4.RX(o.headPitch || 0));
  draw(R, S.sph, M(head, m4.S(.3, .29, .285)), mat(P.skin, { spec:.08 }));
  [-1, 1].forEach(s => draw(R, S.sphLo, M(head, m4.T(s*.285, -.01, -.01), m4.S(.045, .07, .05)), mat(P.skin)));
  draw(R, S.sphLo, M(head, m4.T(0, -.04, .285), m4.S(.045, .045, .04)), mat(P.skin));
  [-1, 1].forEach(s => { draw(R, S.sphLo, M(head, m4.T(s*.11, .03, .262), m4.S(.035, .048, .02)), mat(C3("#221812"), { spec:.6, shin:60 })); });
  if (o.kind === "tito"){
    draw(R, S.sph, M(head, m4.T(0, .05, -.035), m4.S(.312, .3, .3)), mat(P.hair, { spec:.18, shin:16 }));
    draw(R, S.titoHair, head, mat(P.hair, { spec:.2, shin:14, inner:.8 }));
    draw(R, S.titoBeard, head, mat(P.beard, { spec:.12 }));
    [-1, 1].forEach(s => draw(R, S.brow, M(head, m4.T(s*.11, .1, .265), m4.RZ(s*-.15)), mat(P.beard)));
    draw(R, D.cape, body, mat(P.cape2, { cb:P.cape, g:[.1,.6], inner:.62, spec:.05 }));
    [-1, 1].forEach(s => draw(R, S.sphLo, M(body, m4.T(s*.17, .7, .15), m4.S(.035, .035, .035)), mat(P.gold, { spec:.9, shin:50 })));
    /* épée rouillée */
    const sw2 = M(handR, m4.RX(o.blade != null ? o.blade : -1.3));
    draw(R, S.cyl, M(sw2, m4.T(0, -.06, 0), m4.S(.026, .16, .026)), mat(P.leather, { str:[60, .35] }));
    draw(R, S.sphLo, M(sw2, m4.T(0, -.08, 0), m4.S(.035, .035, .035)), mat(P.iron, { spec:.6, shin:40 }));
    draw(R, S.rboxS, M(sw2, m4.T(0, .1, 0), m4.S(.22, .035, .05)), mat(P.iron, { spec:.6, shin:40 }));
    draw(R, S.blade, M(sw2, m4.T(0, .11, 0), m4.S(.075, .66, .02)), mat(P.rust, { cb:P.steel, g:[.0, .45], spec:.9, shin:70 }));
  } else if (o.kind === "piq"){
    draw(R, S.sph, M(head, m4.T(0, -.04, -.05), m4.S(.3, .22, .28)), mat(P.hair));
    draw(R, S.helmet, head, mat(P.metal, { spec:1.0, shin:60 })); draw(R, S.brim, head, mat(P.metal, { spec:1.0, shin:60 }));
    [-1, 1].forEach(s => draw(R, S.sph, M(body, m4.T(s*.24, .69, 0), m4.S(.13, .09, .14)), mat(P.metal, { spec:1, shin:60 })));
    const sp = M(handR, m4.RX(-.1));
    draw(R, S.cyl, M(sp, m4.T(0, -.5, 0), m4.S(.026, 1.85, .026)), mat(P.wood, { spec:.2 }));
    draw(R, S.leaf, M(sp, m4.T(0, 1.34, 0), m4.S(.09, .3, .022)), mat(P.metal, { spec:1, shin:70 }));
    draw(R, D.ribbon, M(sp, m4.T(0, 1.3, 0)), mat(P.ribbon, { inner:.8 }));
    const sh = M(handL, m4.T(-.06, .02, .02), m4.RZ(Math.PI/2), m4.RX(.1));
    draw(R, S.shield, M(sh, m4.S(1.05, 1, 1.05)), mat(P.paint, { cb:P.wood, g:[-.01, .03] }));
    draw(R, S.ring, M(sh, m4.T(0, .0, 0), m4.S(.272, .24, .272)), mat(P.metal, { spec:1, shin:60 }));
    draw(R, S.sphLo, M(sh, m4.T(0, .05, 0), m4.S(.06, .05, .06)), mat(P.metal, { spec:1, shin:60 }));
  } else {
    draw(R, S.sph, M(head, m4.T(0, .05, -.03), m4.S(.33, .315, .32)), mat(P.hood2, { cb:P.hood, g:[-.1,.3] }));
    draw(R, S.hoodTip, head, mat(P.hood));
    draw(R, S.pony, head, mat(P.hair, { spec:.3, shin:18 }));
    draw(R, D.capelet, body, mat(P.hood2, { cb:P.hood, g:[.4,.7], inner:.65 }));
    const q = M(body, m4.T(.1, .42, -.2), m4.RZ(-.35));
    draw(R, S.quiver, q, mat(P.leather, { str:[20, .2] }));
    [-.03, .015, .05].forEach((dx, i) => { draw(R, S.cyl, M(q, m4.T(dx, .3, 0), m4.S(.01, .28, .01)), mat(P.wood)); draw(R, S.leaf, M(q, m4.T(dx, .5, 0), m4.S(.05, .1, .006)), mat(P.fletch)); });
    const bw = M(handL, m4.RX(o.bowAim || -1.15), m4.RY(-.2));
    draw(R, S.bow, bw, mat(P.wood, { spec:.35, shin:30 }));
    draw(R, D.string, bw, mat(P.string, { em:.3 }));
  }
}
function lambin(R, S, o){
  const kk = o.k == null ? 1 : o.k, b = M(m4.T(o.x, o.y || 0, o.z), m4.RY(Math.PI + (o.yaw || 0)), m4.S(kk, kk, kk)), s = 1 + Math.sin(o.t*2.4)*.05, fl = o.flash || 0;
  const body = M(b, m4.S(1/Math.sqrt(s), s, 1/Math.sqrt(s)));
  draw(R, S.lambin, body, { ca:C3("#5C536F"), cb:C3("#C9C0DA"), g:[0, .62], wob:[.022, 9, 3, 1], spec:.55, shin:40, fl });
  [-1, 1].forEach(k => { const e = M(body, m4.T(k*.17, .44, .43), m4.RX(-.25));
    draw(R, S.sph, M(e, m4.S(.1, .1, .07)), { ca:C3("#F4EFE6"), spec:.8, shin:60, fl });
    draw(R, S.sphLo, M(e, m4.T(0, -.025, .055), m4.S(.05, .05, .03)), { ca:C3("#231C2C"), spec:1, shin:80, fl });
    draw(R, S.sph, M(e, m4.T(0, .035, .006), m4.S(.112, .07, .082)), { ca:C3("#A69CB9"), spec:.4, fl }); });
  draw(R, S.sph, M(body, m4.T(0, .27, .5), m4.S(.075, .05 + Math.max(0, Math.sin(o.t*.9))*.03, .03)), { ca:C3("#2E2338"), fl });
  for (let i = 0; i < 4; i++){ const a = i/4*Math.PI*2 + .6, ph = (o.t*.35 + i*.25) % 1; draw(R, S.sphLo, M(b, m4.T(Math.cos(a)*.6, .06 - ph*.05, Math.sin(a)*.55), m4.S(.06, .08 - ph*.03, .06)), { ca:C3("#6E6585"), spec:.5, fl }); }
}
function paperasseux(R, S, o){
  const kk = o.k == null ? 1 : o.k, b = M(m4.T(o.x, o.y || 0, o.z), m4.RY(Math.PI + (o.yaw || 0)), m4.S(kk, kk, kk)), t = o.t, fl = o.flash || 0, paper = C3("#ECE2C6"), paper2 = C3("#DCCFAE"), ink = C3("#2C2522"), red = C3("#A3302A");
  [-1, 1].forEach(k => { const f = M(b, m4.T(k*.15, .05, .03));
    draw(R, S.book, f, { ca:C3("#6B3E2A"), spec:.3, fl }); draw(R, S.pages, M(f, m4.T(0, .002, .02)), { ca:paper, fl });
    draw(R, S.cyl, M(f, m4.T(0, .05, 0), m4.S(.075, .28, .075)), { ca:paper2, str:[30, .15], fl }); });
  for (let i = 0; i < 6; i++) draw(R, S.sheet, M(b, m4.T(Math.sin(i*2.1)*.02, .36 + i*.075, 0), m4.RY(Math.sin(i*1.7)*.13 + Math.sin(t*2 + i)*.04), m4.RZ(Math.sin(t*1.6 + i)*.02)), { ca: i % 2 ? paper2 : paper, spec:.1, fl });
  [[.32, .5, .12, 1], [-.33, .62, -.05, -1]].forEach(([x, y, z, s], i) => draw(R, S.sheet, M(b, m4.T(x, y, z), m4.RZ(s*(.35 + Math.sin(t*5 + i)*.15)), m4.RY(.3*s), m4.S(.55, 1, .7)), { ca:paper, fl }));
  draw(R, S.ring, M(b, m4.T(0, .56, 0), m4.S(.36, .25, .27)), { ca:red, fl });
  draw(R, S.seal, M(b, m4.T(0, .58, .25), m4.RX(Math.PI/2)), { ca:red, spec:.7, shin:40, fl });
  const hd = M(b, m4.T(0, 1.02, 0), m4.RZ(Math.sin(t*1.3)*.07));
  draw(R, S.pageHead, hd, { ca:paper, str:[16, .16], fl });
  [-1, 1].forEach(k => { draw(R, S.sph, M(hd, m4.T(k*.1, .03, .19), m4.S(.05, .065, .02)), { ca:ink, spec:.8, shin:70, fl }); draw(R, S.brow, M(hd, m4.T(k*.1, .12, .195), m4.RZ(k*.35), m4.S(.8, 1, 1)), { ca:ink, fl }); });
  draw(R, S.frown, M(hd, m4.T(0, -.08, .2), m4.S(.8, .8, 1)), { ca:ink, fl });
  const q = M(hd, m4.T(.12, .17, -.05), m4.RZ(-.45), m4.RX(-.2));
  draw(R, S.cyl, M(q, m4.S(.012, .5, .012)), { ca:C3("#3A2E28"), fl }); draw(R, S.feather, M(q, m4.T(0, .12, 0)), { ca:C3("#BDB6AA"), cb:C3("#FBF7EE"), g:[0, .4], inner:.8, fl });
  [-1, 1].forEach(k => { const a = M(b, m4.T(k*.38, .78, 0), m4.RZ(k*(.55 + Math.sin(t*3 + k)*.25)));
    draw(R, S.scroll, M(a, m4.T(0, -.5, 0), m4.S(.085, .5, .085)), { ca:paper, fl });
    draw(R, S.ring, M(a, m4.T(0, -.28, 0), m4.S(.09, .25, .09)), { ca:red, fl });
    draw(R, S.ring, M(a, m4.T(0, -.5, 0), m4.S(.06, .4, .06)), { ca:paper2, fl }); });
}
function feuDeRancune(R, S, o){
  const kk = o.k == null ? 1 : o.k, b = M(m4.T(o.x, o.y, o.z), m4.RY(Math.PI + (o.yaw || 0)), m4.S(kk, kk, kk)), g = o.grow || 1, fl = o.flash || 0;
  const hot = { ca:C3("#FFC45E"), cb:C3("#D9431F"), g:[-.3, .7], em:.92, fl };
  draw(R, S.flame, M(b, m4.S(g, g, g)), Object.assign({ wob:[.035, 7, 6, 2] }, hot));
  draw(R, S.wisps, M(b, m4.S(g, g*(1 + Math.sin(o.t*9)*.08), g)), { ca:C3("#F7A53F"), cb:C3("#D8401E"), g:[0, .6], em:1, wob:[.02, 10, 8, 2], fl });
  draw(R, S.tail, M(b, m4.RZ(Math.sin(o.t*3)*.3)), { ca:C3("#F07A30"), cb:C3("#C83A1C"), g:[-.55, -.3], em:1, fl });
  [-1, 1].forEach(k => { const e = M(b, m4.T(k*.12, .04, .3), m4.RZ(k*.35));
    draw(R, S.sph, M(e, m4.S(.075, .045, .03)), { ca:C3("#2A1712"), em:1 });
    draw(R, S.sphLo, M(e, m4.T(k*-.01, -.005, .02), m4.S(.022, .022, .012)), { ca:C3("#FFF3B8"), em:1 });
    draw(R, S.brow, M(b, m4.T(k*.12, .12, .3), m4.RZ(k*.55), m4.S(1, 1.3, 1)), { ca:C3("#3A1A10"), em:1 }); });
  draw(R, S.frown, M(b, m4.T(0, -.13, .32), m4.S(.75, .9, 1)), { ca:C3("#2A1712"), em:1 });
}

/* =================== lecteur GLB maison : maillages, texture, squelette, animations =================== */
const q4 = {
  slerp(a, b, t){ let d = a[0]*b[0] + a[1]*b[1] + a[2]*b[2] + a[3]*b[3], s = 1; if (d < 0){ d = -d; s = -1; }
    let k0, k1; if (d > .9995){ k0 = 1 - t; k1 = t*s; } else { const th = Math.acos(d), sn = Math.sin(th); k0 = Math.sin((1 - t)*th)/sn; k1 = Math.sin(t*th)/sn*s; }
    const o = [a[0]*k0 + b[0]*k1, a[1]*k0 + b[1]*k1, a[2]*k0 + b[2]*k1, a[3]*k0 + b[3]*k1], l = Math.hypot(...o) || 1; return o.map(v => v/l); }
};
function trsMat(t, r, s){ const [x, y, z, w] = r, xx = x*x, yy = y*y, zz = z*z, xy = x*y, xz = x*z, yz = y*z, wx = w*x, wy = w*y, wz = w*z;
  return [(1 - 2*(yy + zz))*s[0], 2*(xy + wz)*s[0], 2*(xz - wy)*s[0], 0, 2*(xy - wz)*s[1], (1 - 2*(xx + zz))*s[1], 2*(yz + wx)*s[1], 0, 2*(xz + wy)*s[2], 2*(yz - wx)*s[2], (1 - 2*(xx + yy))*s[2], 0, t[0], t[1], t[2], 1]; }

async function loadGLB(R, url){
  const gl = R.gl, res = await fetch(url); if (!res.ok) throw new Error("Fichier introuvable : " + url);
  let buf; if (/\.txt$/.test(url)){ const b64 = (await res.text()).trim(), bin = atob(b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); buf = u8.buffer; } else buf = await res.arrayBuffer();
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546C67) throw new Error("Ce fichier n'est pas un GLB.");
  let off = 12, J = null, BIN = null;
  while (off < buf.byteLength){ const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true), chunk = buf.slice(off + 8, off + 8 + len);
    if (type === 0x4E4F534A) J = JSON.parse(new TextDecoder().decode(chunk)); else if (type === 0x004E4942) BIN = chunk; off += 8 + len; }
  const NC = { SCALAR:1, VEC2:2, VEC3:3, VEC4:4, MAT4:16 }, CT = { 5126:Float32Array, 5125:Uint32Array, 5123:Uint16Array, 5121:Uint8Array, 5122:Int16Array, 5120:Int8Array };
  const acc = i => { const a = J.accessors[i], bv = J.bufferViews[a.bufferView], n = NC[a.type], C = CT[a.componentType], o = (bv.byteOffset || 0) + (a.byteOffset || 0);
    const stride = bv.byteStride || 0, sz = C.BYTES_PER_ELEMENT*n;
    if (!stride || stride === sz) return new C(BIN.slice(o, o + a.count*sz));
    const out = new C(a.count*n), src = new C(BIN.slice(o, o + stride*(a.count - 1) + sz)), step = stride/C.BYTES_PER_ELEMENT;
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k*n + c] = src[k*step + c]; return out; };
  const toF = (arr, norm) => { if (arr instanceof Float32Array) return arr; const f = new Float32Array(arr.length), d = norm ? (arr instanceof Uint8Array ? 255 : 65535) : 1; for (let i = 0; i < arr.length; i++) f[i] = arr[i]/d; return f; };
  /* textures */
  const tex = await Promise.all((J.images || []).map(async im => { const bv = J.bufferViews[im.bufferView], blob = new Blob([BIN.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength)], { type: im.mimeType });
    const bmp = await createImageBitmap(blob, { imageOrientation: "none" }); const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bmp); gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const an = gl.getExtension("EXT_texture_filter_anisotropic"); if (an) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, 4); return t; }));
  const matOf = i => { const m = (J.materials || [])[i] || {}, p = m.pbrMetallicRoughness || {}, c = p.baseColorFactor || [1, 1, 1, 1];
    return { tex: p.baseColorTexture ? tex[J.textures[p.baseColorTexture.index].source] : null, col: c.slice(0, 3).map(v => Math.pow(v, 1/2.2)), metal: p.metallicFactor == null ? 1 : p.metallicFactor, name: m.name }; };
  /* maillages */
  const meshes = J.meshes.map(me => me.primitives.map(pr => {
    const A = pr.attributes, vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const put = (loc, data, n) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 0, 0); };
    put(0, toF(acc(A.POSITION)), 3); put(1, toF(acc(A.NORMAL)), 3);
    if (A.TEXCOORD_0 != null) put(8, toF(acc(A.TEXCOORD_0), J.accessors[A.TEXCOORD_0].normalized), 2);
    const skinned = A.JOINTS_0 != null;
    if (skinned){ put(6, toF(acc(A.JOINTS_0)), 4); put(7, toF(acc(A.WEIGHTS_0), J.accessors[A.WEIGHTS_0].normalized), 4); }
    const idx = acc(pr.indices), eb = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, eb); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, n: idx.length, type: idx instanceof Uint32Array ? gl.UNSIGNED_INT : idx instanceof Uint16Array ? gl.UNSIGNED_SHORT : gl.UNSIGNED_BYTE, skinned, mat: matOf(pr.material) }; }));
  /* nœuds, squelette, animations */
  const nodes = J.nodes.map(n => ({ name: n.name, children: n.children || [], mesh: n.mesh, skin: n.skin, t: n.translation || [0, 0, 0], r: n.rotation || [0, 0, 0, 1], s: n.scale || [1, 1, 1], m: n.matrix }));
  const parent = new Array(nodes.length).fill(-1); nodes.forEach((n, i) => n.children.forEach(c => parent[c] = i));
  const order = []; const visit = i => { order.push(i); nodes[i].children.forEach(visit); }; J.scenes[J.scene || 0].nodes.forEach(visit);
  const skin = J.skins[0], joints = skin.joints, ibm = acc(skin.inverseBindMatrices);
  const clips = {}; (J.animations || []).forEach(a => { let dur = 0; const ch = a.channels.map(c => { const s = a.samplers[c.sampler], times = acc(s.input), vals = toF(acc(s.output)); dur = Math.max(dur, times[times.length - 1]);
    return { node: c.target.node, path: c.target.path, times, vals, step: s.interpolation === "STEP", n: c.target.path === "rotation" ? 4 : 3 }; }); clips[a.name] = { ch, dur }; });
  return { nodes, meshes, parent, order, joints, ibm, clips, world: nodes.map(() => m4.id()), jm: new Float32Array(Math.max(1, joints.length)*16) };
}
/* échantillonne une animation au temps t dans les TRS des nœuds */
function sampleClip(G, clip, t, out){
  clip.ch.forEach(c => { const T = c.times, n = c.n; let i = 0; while (i < T.length - 2 && t > T[i + 1]) i++;
    let k = T.length > 1 ? clamp01((t - T[i])/((T[i + 1] - T[i]) || 1)) : 0; if (c.step) k = 0;
    const a = Array.from(c.vals.subarray(i*n, i*n + n)), b = Array.from(c.vals.subarray(Math.min(T.length - 1, i + 1)*n, Math.min(T.length - 1, i + 1)*n + n));
    const o = out[c.node] || (out[c.node] = {}); o[c.path === "translation" ? "t" : c.path === "rotation" ? "r" : "s"] = n === 4 ? q4.slerp(a, b, k) : a.map((v, j) => v + (b[j] - v)*k); });
}
/* pose finale : mélange de deux animations (fondu), matrices des os */
function poseGLB(G, A, wA, B, wB){
  const pa = {}, pb = {}; if (A) sampleClip(G, A.clip, A.t, pa); if (B && wB > 0) sampleClip(G, B.clip, B.t, pb);
  G.order.forEach(i => { const n = G.nodes[i]; let t = n.t, r = n.r, s = n.s; const a = pa[i], b = pb[i];
    if (a){ t = a.t || t; r = a.r || r; s = a.s || s; }
    if (b && wB > 0){ t = t.map((v, j) => v + ((b.t || n.t)[j] - v)*wB); r = q4.slerp(r, b.r || n.r, wB); s = s.map((v, j) => v + ((b.s || n.s)[j] - v)*wB); }
    const L = n.m || trsMat(t, r, s), p = G.parent[i]; G.world[i] = p >= 0 ? m4.mul(G.world[p], L) : L; });
  G.joints.forEach((j, k) => G.jm.set(m4.mul(G.world[j], Array.from(G.ibm.subarray(k*16, k*16 + 16))), k*16));
}
function drawGLB(R, G, place, mat){
  const gl = R.gl;
  G.order.forEach(i => { const n = G.nodes[i]; if (n.mesh == null) return;
    G.meshes[n.mesh].forEach(pr => {
      const metal = pr.mat.metal > .5, base = Object.assign({ ca: pr.mat.col, spec: metal ? .9 : .12, shin: metal ? 70 : 20 }, mat || {});
      setMat(R, Object.assign({}, DEF, base), pr.skinned ? place : m4.mul(place, G.world[i]));
      gl.uniform1i(R.u("uInst"), 0); gl.uniform1i(R.u("uSkin"), pr.skinned ? 1 : 0); gl.uniform1i(R.u("uTexOn"), pr.mat.tex ? 1 : 0);
      if (pr.skinned) gl.uniformMatrix4fv(R.u("uJ[0]"), false, G.jm);
      if (pr.mat.tex){ gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, pr.mat.tex); gl.activeTexture(gl.TEXTURE0); }
      gl.vertexAttrib3f(2, 1, 1, 1); gl.bindVertexArray(pr.vao); gl.drawElements(gl.TRIANGLES, pr.n, pr.type, 0); });
  });
  gl.uniform1i(R.u("uSkin"), 0); gl.uniform1i(R.u("uTexOn"), 0);
}

export { C3, M, m4, v3, clamp01, lerp, easeOut, easeIn, easeIO, hash, makeGL, mesh, draw, drawI, setMat, DEF, ID4, makeTargets, post, buildShapes, buildWorld, ZONE_LANDE, terrainH, inArena, capeG, tubeG, humanoid, lambin, paperasseux, feuDeRancune, loadGLB, poseGLB, drawGLB, PB, text, textW, finish, tone, hex, woodPanel };

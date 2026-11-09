/* Forpharos : la scène de combat en 3D (Lande du Phare), reprise de la maquette série 6 (rendu C3 « 3D douce »).
   Elle ne décide de rien : le combat (ui/combat.js) lui donne à chaque image la position et l'animation de chacun,
   et lui demande des effets (arc de lame, éclat, boule de feu, feuilles, chiffres). */
import { C3, M, m4, v3, clamp01, lerp, easeOut, easeIn, easeIO, hash, makeGL, draw, drawI, ID4, makeTargets, post, buildShapes, buildWorld,
  ZONE_LANDE, terrainH, inArena, lambin, paperasseux, feuDeRancune, loadGLB, poseGLB, drawGLB } from "./engine3d.js";
import { PB, text, textW, finish, hex } from "./pix.js";

export const QUALITY = {
  haute:      { label: "Haute",      dpr: 2,   shadow: 2048, msaa: 4, bloom: true,  grass: 1,   fx: 1 },
  equilibree: { label: "Équilibrée", dpr: 1.5, shadow: 1024, msaa: 4, bloom: true,  grass: .65, fx: 1 },
  economie:   { label: "Économie",   dpr: 1,   shadow: 0,    msaa: 2, bloom: false, grass: .35, fx: .6 }
};
export const HOME = [-.2, 0, .3];
export const SLOTS = { ground: [[.75, 0, 4.3], [-1.35, 0, 5.0], [2.35, 0, 5.5]], air: [[1.8, 1.8, 5.3], [-.4, 2.1, 6.1]] };
export const yawTo = (a, b) => Math.atan2(b[0] - a[0], b[2] - a[2]);
const CAM = { eye: [-1.1, 3.7, -7.8], tgt: [.15, 1.45, 4.4], fov: 40*Math.PI/180 };
const LEAF = {
  pine:  { kind: 6, leaf: 1, ca: C3("#2C4A20"), cb: C3("#6E8F3A"), g: [0, 1], inner: .8, spec: .05 },
  olive: { kind: 6, leaf: 0, ca: C3("#3D4C2C"), cb: C3("#A5AE8E"), g: [.2, 1], inner: .85, spec: .08 },
  cyp:   { kind: 6, leaf: 2, ca: C3("#1E3018"), cb: C3("#466A32"), g: [0, 1], inner: .8, spec: .04 },
  bush:  { kind: 6, leaf: 0, ca: C3("#3A4826"), cb: C3("#7C8A55"), g: [0, 1], inner: .85, spec: .05 },
  broom: { kind: 6, leaf: 2, ca: C3("#E0B12C"), cb: C3("#F6D65A"), g: [0, 1], spec: .05 }
};
export { lerp, easeOut, easeIn, easeIO, clamp01, v3 };

/* chiffres de dégâts en police pixel (agrandis ×2, contour sombre) */
const dmgCache = {};
function dmgPix(str, col){
  const key = str + col; if (dmgCache[key]) return dmgCache[key];
  const pb = new PB(textW(str) + 1, 6); text(pb, str, 0, 0, hex(col));
  const big = new PB(pb.w*2, pb.h*2);
  for (let y = 0; y < pb.h; y++) for (let x = 0; x < pb.w; x++) if (pb.a(x, y)){ const c = pb.get(x, y); big.set(x*2, y*2, c); big.set(x*2 + 1, y*2, c); big.set(x*2, y*2 + 1, c); big.set(x*2 + 1, y*2 + 1, c); }
  return (dmgCache[key] = finish(big, { outline: "dark", hi: 0, shade: 0 }, 1).canvas());
}

export function createArena(canvas, ov, opts){
  const R = makeGL(canvas); if (!R) throw new Error("webgl2");
  const gl = R.gl, S = buildShapes(R), Wd = buildWorld(R, S), Z = ZONE_LANDE;
  let Q = QUALITY[opts.quality] || QUALITY.equilibree, VP = m4.id(), VIEW = m4.id(), LVP, W = 0, H = 0, EYE = CAM.eye, TITO = null, lost = false;
  const ox = ov.getContext("2d");
  canvas.addEventListener("webglcontextlost", e => { e.preventDefault(); lost = true; });
  const ready = loadGLB(R, opts.glbUrl).then(g => { TITO = g; return g; });
  gl.useProgram(R.P); gl.uniform1i(R.u("uBase"), 3);
  { const c = [.2, 0, 3.6], e = v3.add(c, v3.sc(Z.sun, 40)); LVP = m4.mul(m4.ortho(-13, 13, -11, 11, 5, 80), m4.look(e, c, [0, 1, 0])); }
  function setCam(eye, tgt){ EYE = eye; VIEW = m4.look(eye, tgt, [0, 1, 0]); VP = m4.mul(m4.persp(CAM.fov, W/H, .1, 900), m4.mul(VIEW, m4.S(-1, 1, 1))); }
  function resize(cssW, cssH){
    const dpr = Math.min(Q.dpr, window.devicePixelRatio || 1);
    W = Math.round(cssW*dpr); H = Math.round(cssH*dpr);
    [canvas, ov].forEach(c => { c.width = W; c.height = H; c.style.width = cssW + "px"; c.style.height = cssH + "px"; });
    setCam(CAM.eye, CAM.tgt); makeTargets(R, W, H, Q);
  }
  function setQuality(k){ Q = QUALITY[k] || Q; if (W) resize(parseFloat(canvas.style.width), parseFloat(canvas.style.height)); }
  const proj = p => { const x = VP[0]*p[0] + VP[4]*p[1] + VP[8]*p[2] + VP[12], y = VP[1]*p[0] + VP[5]*p[1] + VP[9]*p[2] + VP[13], w = VP[3]*p[0] + VP[7]*p[1] + VP[11]*p[2] + VP[15]; if (w <= .01) return null; return [(x/w*.5 + .5)*W, (1 - (y/w*.5 + .5))*H, w]; };
  /* position à l'écran en pixels CSS (pour l'interface) */
  const projCss = p => { const r = proj(p); if (!r) return null; const k = parseFloat(canvas.style.width)/W; return [r[0]*k, r[1]*k]; };

  /* ---------- effets ---------- */
  const quads = [];
  const camR = () => v3.nrm([-VIEW[0], VIEW[4], VIEW[8]]), camU = () => v3.nrm([VIEW[1], VIEW[5], VIEW[9]]);
  function bill(c, s, type, col, a, add, seed){ const r = v3.sc(camR(), s), u = v3.sc(camU(), s);
    quads.push({ pts: [v3.sub(v3.sub(c, r), u), v3.sub(v3.add(c, r), u), v3.add(v3.add(c, r), u), v3.add(v3.sub(c, r), u)], type, col, a, add, seed: seed || 0 }); }
  function quadPts(pts, type, col, a, add){ quads.push({ pts, type, col, a, add, seed: 0 }); }
  function flushQuads(t){
    gl.useProgram(R.Q); gl.uniformMatrix4fv(R.qu("uVP"), false, VP); gl.uniform1f(R.qu("uT"), t);
    gl.enable(gl.BLEND); gl.depthMask(false); gl.bindVertexArray(R.qvao); gl.bindBuffer(gl.ARRAY_BUFFER, R.qbuf);
    [false, true].forEach(addPass => quads.filter(q => q.add === addPass).forEach(q => {
      gl.blendFunc(gl.SRC_ALPHA, addPass ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
      const [a, b, c, d] = q.pts, uv = [[0, 0], [1, 0], [1, 1], [0, 1]], v = [];
      [0, 1, 2, 0, 2, 3].forEach(i => { const p = [a, b, c, d][i]; v.push(p[0], p[1], p[2], uv[i][0], uv[i][1], q.seed, 1); });
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.DYNAMIC_DRAW);
      gl.uniform4f(R.qu("uCol"), q.col[0], q.col[1], q.col[2], q.a); gl.uniform1i(R.qu("uType"), q.type); gl.drawArrays(gl.TRIANGLES, 0, 6); }));
    gl.depthMask(true); gl.disable(gl.BLEND); quads.length = 0;
  }
  const FOG = []; for (let i = 0; i < 14; i++){ const a = i/14*Math.PI*2, r = 5.5 + hash(i, 1, 41)*3; FOG.push({ x: .2 + Math.cos(a)*r*1.1, z: 3.6 + Math.sin(a)*r*.75, s: 2 + hash(i, 2, 42)*1.6, seed: i*.37, sp: .1 + hash(i, 3, 43)*.15 }); }
  const FLIES = []; for (let i = 0; i < 18; i++){ let x, z, k = 0; do { x = (hash(i, 7 + k, 61) - .5)*18; z = hash(i, 8 + k, 62)*12 - 1; k++; } while (inArena(x, z, 1.1) && k < 50); FLIES.push({ x, z, ph: hash(i, 9, 63)*6.28, sp: .4 + hash(i, 10, 64)*.5 }); }
  let embers = [], scraps = [], trail = [], fx = [], nums = [];
  /* effets demandés par le combat : chacun vit `dur` secondes */
  const FX = {
    slash(c, big){ fx.push({ k: "slash", c, t0: null, dur: .3, big }); },
    burst(c, col, s){ fx.push({ k: "burst", c, col: col || [1, .95, .8], s: s || 1.1, t0: null, dur: .2 }); },
    light(c){ fx.push({ k: "light", c, t0: null, dur: .7 }); },
    ball(a, b, dur){ fx.push({ k: "ball", a, b, t0: null, dur: dur || .4 }); },
    sheet(a, b, dur){ fx.push({ k: "sheet", a, b, t0: null, dur: dur || .45 }); },
    scraps(c){ for (let i = 0; i < 8; i++) scraps.push({ p: c.slice(), v: [(Math.random() - .5)*1.6, 1 + Math.random(), -Math.random()*.6], r: Math.random()*6, life: 1 }); },
    puff(c, col){ for (let i = 0; i < 14; i++) embers.push({ p: [c[0] + (Math.random() - .5)*.5, c[1] + Math.random()*.6, c[2] + (Math.random() - .5)*.5], v: [(Math.random() - .5)*.6, .4 + Math.random()*.8, (Math.random() - .5)*.4], life: 1, col: col || [.75, .7, .85], s: .09 }); },
    heal(c){ for (let i = 0; i < 12; i++) embers.push({ p: [c[0] + (Math.random() - .5)*.6, c[1] + Math.random()*.4, c[2] + (Math.random() - .5)*.4], v: [0, .5 + Math.random()*.6, 0], life: 1, col: [.6, 1, .55], s: .06 }); },
    num(p3, str, col){ nums.push({ p: p3, str: String(str), col: col || "#FFF1C9", t0: null }); }
  };

  /* ---------- décor ---------- */
  function staticCasters(t, shadowPass){
    draw(R, Wd.rocks, ID4, { kind: 3 }); draw(R, Wd.rubble, ID4, { kind: 3 });
    Wd.menhirs.forEach((mh, i) => draw(R, mh.o, mh.m, { kind: mh.rune ? 7 : 3, ca: C3(i % 2 ? "#8C8577" : "#7F796D"), rune: mh.rune ? .7 + Math.sin(t*1.6 + i)*.3 : 0, seed: mh.seed }));
    draw(R, Wd.bark, ID4, { kind: 5, spec: .05 });
    draw(R, Wd.bodies, ID4, { kind: 8, spec: .03 });
    Object.keys(Wd.card).forEach(k => drawI(R, Wd.card[k], LEAF[k]));
    if (!shadowPass) draw(R, Wd.props, ID4, { spec: .2 });
  }
  function receivers(t){
    gl.depthMask(false); draw(R, S.sph, M(m4.T(EYE[0], EYE[1], EYE[2]), m4.S(400, 400, 400)), { kind: 4 }); gl.depthMask(true);
    draw(R, Wd.sea, ID4, { kind: 2 }); draw(R, Wd.isle, ID4, { kind: 3 });
    const TW = m4.T(6.5, 1.4, 40);
    draw(R, S.tower, TW, { ca: C3("#B9AE9C"), str: [.42, .32], spec: .1 });
    draw(R, S.ring, M(TW, m4.T(0, 8.62, 0), m4.S(1.18, .6, 1.18)), { ca: C3("#3E3532") });
    draw(R, S.lantern, M(TW, m4.T(0, 8.75, 0)), { ca: C3("#FFE3A3"), em: 1 });
    draw(R, S.dome, M(TW, m4.T(0, 9.6, 0)), { ca: C3("#3A2E2A"), spec: .4 });
    const BT = M(m4.T(-7.5, -4.15 + Math.sin(t*1.2)*.05, 36), m4.RY(.5), m4.RZ(Math.sin(t*1.1)*.05));
    draw(R, Wd.boatHull, BT, {}); draw(R, Wd.sail, M(BT, m4.T(0, .15, -.4)), { inner: .85 });
    for (let i = 0; i < 3; i++){ const a = t*(.18 + i*.04) + i*2.1, c = [-2 + i*4, 6.5 + i*1.2, 26 + i*5], p = [c[0] + Math.cos(a)*(6 + i*2), c[1] + Math.sin(a*2)*.4, c[2] + Math.sin(a)*(4 + i)];
      const G = M(m4.T(p[0], p[1], p[2]), m4.RY(-a + (i % 2 ? Math.PI : 0)), m4.S(1.4, 1.4, 1.4)), fl = Math.sin(t*7 + i*2)*.5;
      draw(R, Wd.gullBody, M(G, m4.S(.07, .06, .24)), { ca: C3("#ECEAE4") });
      draw(R, Wd.wing, M(G, m4.RZ(fl)), { ca: C3("#D6D4CE"), cb: C3("#4A4A4E"), g: [0, .04] }); draw(R, Wd.wing, M(G, m4.S(-1, 1, 1), m4.RZ(fl)), { ca: C3("#D6D4CE"), cb: C3("#4A4A4E"), g: [0, .04] }); }
    draw(R, Wd.ground, ID4, { kind: 1 });
    const gN = Q.grass, half = Math.max(.5, gN);
    drawI(R, Wd.grass, { kind: 8, ca: C3("#3C5520"), cb: C3("#9DB04E"), g: [0, .4] }, Math.round(Wd.grass.count*gN));
    drawI(R, Wd.dry, { kind: 8, ca: C3("#7A7032"), cb: C3("#D8C27A"), g: [0, .5] }, Math.round(Wd.dry.count*half));
    drawI(R, Wd.pavot, { kind: 8, ca: C3("#4F6A2A"), cb: C3("#C7281E"), g: [.27, .29] }, Math.round(Wd.pavot.count*half));
    drawI(R, Wd.marg, { kind: 8, ca: C3("#4F6A2A"), cb: C3("#F2EEE2"), g: [.28, .295] }, Math.round(Wd.marg.count*half));
    drawI(R, Wd.bouton, { kind: 8, ca: C3("#4F6A2A"), cb: C3("#E8C23A"), g: [.22, .25] }, Math.round(Wd.bouton.count*half));
    drawI(R, Wd.lav, { kind: 8, ca: C3("#55703C"), cb: C3("#8E76C8"), g: [.28, .33] });
    drawI(R, Wd.pebbles, { ca: C3("#746D62"), cb: C3("#9C9486"), g: [-.6, .9], spec: .15 }, Math.round(Wd.pebbles.count*half));
  }
  /* ---------- acteurs ---------- */
  function drawTito(T){
    if (!TITO) return;
    const c = TITO.clips, ev = a => { const cl = c[a.clip] || c.Attente, lt = a.t; return { clip: cl, t: a.loop ? ((lt % cl.dur) + cl.dur) % cl.dur : Math.min(cl.dur, Math.max(0, lt)) }; };
    poseGLB(TITO, ev(T.A), 1, T.B ? ev(T.B) : null, T.w || 0);
    const k = .7;
    drawGLB(R, TITO, M(m4.T(T.pos[0], T.pos[1], T.pos[2]), m4.RY(T.yaw), m4.S(-k, k, k), m4.T(0, .97, 0)), T.flash ? { fl: T.flash } : {});
  }
  function drawMon(m, t){
    const o = { x: m.pos[0], y: m.pos[1], z: m.pos[2], t: t + m.seed, flash: m.flash || 0, yaw: m.yaw || 0, k: m.k == null ? 1 : m.k, grow: m.grow || 1 };
    if (o.k <= .01) return;
    if (m.kind === "lambin") lambin(R, S, o); else if (m.kind === "paperasseux") paperasseux(R, S, o); else feuDeRancune(R, S, o);
  }
  function actors(st, t){ st.mons.forEach(m => drawMon(m, t)); if (st.tito) drawTito(st.tito); if (st.ball) draw(R, S.sph, M(m4.T(st.ball[0], st.ball[1], st.ball[2]), m4.S(.16, .16, .16)), { ca: C3("#FFE7A0"), cb: C3("#F07A30"), g: [-.6, .8], em: 1 }); }

  /* ---------- une image : st = { tito:{pos,yaw,A,B,w,flash}, mons:[{kind,pos,yaw,k,flash,seed,grow,sel}], dim } ---------- */
  function frame(now, dt, st){
    if (lost) return;
    const t = now/1000, T = R.T;
    /* effets qui ont une position animée (boule de feu, feuille lancée) */
    st.ball = null; let sheetP = null;
    fx.forEach(f => { if (f.t0 == null) f.t0 = t; f.k2 = (t - f.t0)/f.dur;
      if (f.k === "ball" && f.k2 <= 1){ const k = easeIn(f.k2); st.ball = [lerp(f.a[0], f.b[0], k), lerp(f.a[1], f.b[1], k) + Math.sin(k*Math.PI)*.45, lerp(f.a[2], f.b[2], k)]; }
      if (f.k === "sheet" && f.k2 <= 1){ const k = f.k2; sheetP = [lerp(f.a[0], f.b[0], k), lerp(f.a[1], f.b[1], k) + Math.sin(k*Math.PI)*.6, lerp(f.a[2], f.b[2], k)]; f.rot = t*14; } });
    const feu = st.mons.find(m => m.kind === "feu" && (m.k == null || m.k > .05));
    gl.useProgram(R.P); gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    gl.uniform1f(R.u("uT"), t); gl.uniform2fv(R.u("uWind"), Z.wind); gl.uniform1i(R.u("uShadow"), 1);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, null); gl.activeTexture(gl.TEXTURE0);
    if (Q.shadow){
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.shFB); gl.viewport(0, 0, T.shSize, T.shSize); gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.uniform1i(R.u("uPass"), 1); gl.uniformMatrix4fv(R.u("uVP"), false, LVP); gl.uniform3fv(R.u("uCam"), v3.add([.2, 0, 3.6], v3.sc(Z.sun, 40)));
      gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(2, 3);
      staticCasters(t, true); actors(st, t);
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.msFB); gl.viewport(0, 0, W, H); gl.frontFace(gl.CW);
    gl.clearColor(.1, .08, .12, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, T.shTex); gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(R.u("uPass"), 0); gl.uniform1i(R.u("uShadowOn"), Q.shadow ? 1 : 0); gl.uniformMatrix4fv(R.u("uLVP"), false, LVP);
    gl.uniformMatrix4fv(R.u("uVP"), false, VP); gl.uniform3fv(R.u("uCam"), EYE); gl.uniform1f(R.u("uExpo"), Z.expo*(st.dim ? 1 - st.dim*.45 : 1));
    gl.uniform3fv(R.u("uSun"), Z.sun); gl.uniform3fv(R.u("uSunC"), Z.sunC); gl.uniform3fv(R.u("uSky"), Z.sky); gl.uniform3fv(R.u("uGnd"), Z.gnd); gl.uniform3fv(R.u("uRim"), Z.rim);
    gl.uniform3fv(R.u("uFogC"), Z.fogC); gl.uniform2fv(R.u("uFog"), Z.fog); gl.uniform3fv(R.u("uSunDir2"), Z.sunDir2);
    gl.uniform4f(R.u("uF1"), feu ? feu.pos[0] : 0, feu ? feu.pos[1] + .1 : -50, feu ? feu.pos[2] : 0, feu ? (2.6*(feu.grow || 1) + Math.sin(t*13)*.15)*(feu.k == null ? 1 : feu.k) : 0);
    gl.uniform4f(R.u("uF2"), st.ball ? st.ball[0] : 0, st.ball ? st.ball[1] : -50, st.ball ? st.ball[2] : 0, st.ball ? 2.8 : 0);
    const ks = Q.shadow ? .35 : .6, sh = [];
    if (st.tito) sh.push([st.tito.pos[0], st.tito.pos[2], .45 - (st.tito.pos[1] || 0)*.2, ks]);
    st.mons.forEach(m => { const kk = m.k == null ? 1 : m.k; if (kk > .05) sh.push([m.pos[0], m.pos[2], (m.kind === "lambin" ? .7 : m.kind === "feu" ? .45 : .55)*kk, m.kind === "feu" ? .28 : ks]); });
    while (sh.length < 8) sh.push([0, 0, 0, 0]);
    gl.uniform4fv(R.u("uSh[0]"), new Float32Array([].concat(...sh.slice(0, 8))));
    receivers(t); staticCasters(t, false); actors(st, t);
    /* effets lumineux et ambiance */
    FOG.forEach((f, i) => { if (i % 3 === 2 && Q.fx < 1) return; bill([f.x + Math.sin(t*f.sp + i)*.8, .35 + Math.sin(t*.3 + i)*.08 + terrainH(f.x, f.z)*.6, f.z], f.s*.8, 1, [.6, .54, .68], .16, false, f.seed); });
    if (feu){ const g = feu.grow || 1, kk = feu.k == null ? 1 : feu.k;
      bill([feu.pos[0], feu.pos[1] + .05, feu.pos[2]], 1.5*g*kk, 0, [1, .55, .2], .5, true); bill([feu.pos[0], feu.pos[1] + .05, feu.pos[2]], .5*g*kk, 0, [1, .8, .45], .3, true);
      if (Math.random() < dt/55*Q.fx) embers.push({ p: [feu.pos[0] + (Math.random() - .5)*.4, feu.pos[1] + .3, feu.pos[2] + (Math.random() - .5)*.3], v: [(Math.random() - .5)*.25, .5 + Math.random()*.5, 0], life: 1, col: [1, .7, .3], s: .045 }); }
    embers = embers.filter(e => { e.life -= dt/1300; e.p = v3.add(e.p, v3.sc(e.v, dt/1000)); if (e.life <= 0) return false; bill(e.p, e.s || .045, 0, e.col || [1, .7, .3], e.life, true); return true; });
    FLIES.forEach((f, i) => { const bl = Math.max(0, Math.sin(t*f.sp*2.3 + f.ph)); if (bl < .05) return; const p = [f.x + Math.sin(t*f.sp + f.ph)*.6, terrainH(f.x, f.z) + .45 + Math.sin(t*f.sp*1.7 + i)*.25, f.z + Math.cos(t*f.sp*.8 + f.ph)*.5]; bill(p, .12, 0, [.95, 1, .55], .8*bl, true); bill(p, .025, 0, [1, 1, .85], bl, true); });
    const LAN = [6.5, 1.4 + 9.2, 40]; bill(LAN, 2.6 + Math.sin(t*2)*.2, 0, [1, .85, .55], .55, true);
    { const ang = t*.7, d = [Math.cos(ang), 0, Math.sin(ang)], toC = v3.nrm(v3.sub(CAM.eye, LAN)), side = v3.nrm(v3.cross(d, toC)), len = 30, w = 2.4;
      quadPts([v3.add(LAN, v3.sc(side, .2)), v3.add(v3.add(LAN, v3.sc(d, len)), v3.sc(side, w)), v3.sub(v3.add(LAN, v3.sc(d, len)), v3.sc(side, w)), v3.sub(LAN, v3.sc(side, .2))], 2, [1, .86, .58], .32*(.4 + .6*Math.abs(Math.sin(ang))), true); }
    Wd.menhirs.forEach((mh, i) => { if (mh.rune) bill(m4.tp(mh.m, [0, .62, -.26]), .55, 0, [1, .72, .35], .14 + Math.sin(t*1.6 + i)*.06, true); });
    /* cible choisie : anneau doré au sol */
    st.mons.forEach(m => { if (!m.sel || (m.k != null && m.k < .3)) return; const c = [m.pos[0], .03, m.pos[2]], seg = 24, rr = m.kind === "lambin" ? .78 : .62, a0 = t*1.2;
      for (let i = 0; i < seg; i++){ if (i % 2) continue; const u0 = a0 + i/seg*Math.PI*2, u1 = a0 + (i + 1)/seg*Math.PI*2, p = (a, r) => [c[0] + Math.cos(a)*r, c[1], c[2] + Math.sin(a)*r];
        quadPts([p(u0, rr - .05), p(u1, rr - .05), p(u1, rr + .05), p(u0, rr + .05)], 0, [1, .85, .4], .9, true); } });
    if (st.ball){ bill(st.ball, .9, 0, [1, .55, .2], .9, true); bill(st.ball, .3, 0, [1, .95, .75], .9, true); trail.push({ p: st.ball.slice(), life: 1 }); }
    trail = trail.filter(e => { e.life -= dt/260; if (e.life <= 0) return false; bill(e.p, .22*e.life + .05, 0, [1, .5, .15], .6*e.life, true); return true; });
    if (sheetP){ const f = fx.find(x => x.k === "sheet"), R0 = v3.sc(camR(), .13), U0 = v3.sc(camU(), .17), c = Math.cos(f.rot), sn = Math.sin(f.rot), rot = (x, y) => v3.add(sheetP, v3.add(v3.sc(R0, x*c - y*sn), v3.sc(U0, x*sn + y*c)));
      quadPts([rot(-1, -1), rot(1, -1), rot(1, 1), rot(-1, 1)], 4, [.95, .91, .8], 1, false); }
    fx = fx.filter(f => {
      const k = f.k2; if (k > 1) return false;
      if (f.k === "slash"){ const p = k, seg = 12, rr = f.big ? 1.05 : .8;
        for (let i = 0; i < seg; i++){ const u0 = i/seg, u1 = (i + 1)/seg; if (u1 > p + .05 || u0 < p - .6) continue; const a0 = lerp(2.5, -.4, u0), a1 = lerp(2.5, -.4, u1), R0 = camR(), U0 = camU();
          const pt = (a, r) => v3.add(f.c, v3.add(v3.sc(R0, Math.cos(a)*r), v3.sc(U0, Math.sin(a)*r*.75)));
          quadPts([pt(a0, rr - .12), pt(a1, rr - .12), pt(a1, rr + .12), pt(a0, rr + .12)], 3, f.big ? [1, .88, .5] : [1, .95, .8], .9*(1 - (p - u0)*1.3), true); } }
      if (f.k === "burst") bill(f.c, f.s*(1 + k*.3), 0, f.col, .7*(1 - k), true);
      if (f.k === "light"){ bill(f.c, 1.6 + k*1.5, 0, [1, .85, .5], .8*(1 - k), true); bill(f.c, .6, 0, [1, 1, .9], 1 - k, true); }
      return true; });
    scraps = scraps.filter(s => { s.life -= dt/1300; s.v[1] -= dt/1000*2.2; s.p = v3.add(s.p, v3.sc(s.v, dt/1000)); s.r += dt/150; if (s.life <= 0) return false;
      const R0 = v3.sc(camR(), .09), U0 = v3.sc(camU(), .065), c = Math.cos(s.r), sn = Math.sin(s.r), rot = (x, y) => v3.add(s.p, v3.add(v3.sc(R0, x*c - y*sn), v3.sc(U0, x*sn + y*c)));
      quadPts([rot(-1, -1), rot(1, -1), rot(1, 1), rot(-1, 1)], 4, [.95, .91, .8], Math.min(1, s.life*2), false); return true; });
    flushQuads(t);
    post(R, Q, t);
    /* surimpression : chiffres de dégâts */
    ox.clearRect(0, 0, W, H); ox.imageSmoothingEnabled = false;
    const unit = Math.max(2, Math.round(W/150));
    nums = nums.filter(n => { if (n.t0 == null) n.t0 = t; const d = t - n.t0; if (d > 1.15) return false; const at = proj(n.p); if (!at) return true;
      const c = dmgPix(n.str, n.col), y = at[1] - 7*unit*easeOut(d/.35) - d*4*unit, a = d < .8 ? 1 : 1 - (d - .8)/.35, pop = d < .12 ? 1 + (1 - d/.12)*.4 : 1;
      const w2 = c.width*unit*pop, h2 = c.height*unit*pop; ox.globalAlpha = Math.max(0, a); ox.drawImage(c, Math.round(at[0] - w2/2), Math.round(y - h2), Math.round(w2), Math.round(h2)); ox.globalAlpha = 1; return true; });
  }
  function dispose(){ try { const ext = gl.getExtension("WEBGL_lose_context"); if (ext) ext.loseContext(); } catch (e) {} }
  return { ready, resize, setQuality, frame, FX, proj: projCss, dispose, get tito(){ return TITO; }, get lost(){ return lost; } };
}

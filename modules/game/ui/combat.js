/* Forpharos : écran de combat (3D + panneau du bas au pouce).
   Le moteur (core/battle.js) décide ; ici on met en scène : course, coup d'épée, boule de feu, chiffres, et on gère le menu. */
import { createBattle, tick, titoAct, monAct, autoChoice, canSkill, canItem, firstTarget, alive } from "../core/battle.js";
import { SKILL, RATION } from "../core/rules.js";
import { createArena, HOME, SLOTS, yawTo, lerp, easeOut, easeIO, clamp01 } from "../render/arena.js";
import { pixSVG, iconSVG } from "../render/pix.js";

const MON_H = { lambin: 1.15, paperasseux: 1.55, feu: .75 };
const FADE = .16;

export function openCombat(host, o){
  /* o : { titoLv, forgeLv, horde, vivres, day, quality, glbUrl, prefs, onEnd(result), onQuit() } */
  const ac = new AbortController(), on = (el, ev, fn, opt) => el.addEventListener(ev, fn, Object.assign({ signal: ac.signal }, opt || {}));
  const el = document.createElement("div"); el.className = "mg-combat";
  el.innerHTML = '<div class="mg-stage"><canvas class="mg-gl" role="img" aria-label="Combat en 3D sur la Lande du Phare"></canvas><canvas class="mg-ov" aria-hidden="true"></canvas>'
    + '<div class="mg-grade" aria-hidden="true"></div><div class="mg-vig" aria-hidden="true"></div><div class="mg-tags"></div>'
    + '<div class="mg-top"><button type="button" class="mg-ibtn mg-flee" aria-label="Quitter le combat">' + pixSVG("X") + '</button><span class="mg-day">' + pixSVG("HORDE DU JOUR " + (o.dayLabel || o.day), { shadow: "#1A120C" }) + "</span></div>"
    + '<div class="mg-say" aria-live="polite"></div><div class="mg-load">' + pixSVG("CHARGEMENT", { shadow: "#1A120C" }) + "</div></div>"
    + '<div class="mg-panel wood"><div class="mg-party">'
    + '<div class="mg-who">' + pixSVG("TITO", { shadow: "#2A1A10" }) + '<span class="mg-lv">' + pixSVG("NIV " + o.titoLv, { shadow: "#2A1A10" }) + "</span></div>"
    + '<div class="mg-row"><span class="mg-lab">' + pixSVG("PV", { shadow: "#2A1A10" }) + '</span><span class="mg-gauge hp"><i></i></span><span class="mg-num hpn"></span></div>'
    + '<div class="mg-row"><span class="mg-lab">' + pixSVG("PM", { shadow: "#2A1A10" }) + '</span><span class="mg-gauge mp"><i></i></span><span class="mg-num mpn"></span></div>'
    + '<div class="mg-row"><span class="mg-lab">' + pixSVG("ATB", { shadow: "#2A1A10" }) + '</span><span class="mg-gauge atb"><i></i></span></div>'
    + '<div class="mg-tog"><button type="button" class="mg-chip" data-t="x2" aria-pressed="false">' + pixSVG("×2") + '</button><button type="button" class="mg-chip" data-t="auto" aria-pressed="false">' + pixSVG("AUTO") + "</button></div></div>"
    + '<div class="mg-menu parch" role="group" aria-label="Actions de Tito">'
    + ["attack:ATTAQUE", "skill:COMPETENCE", "magic:MAGIE", "item:OBJET", "defend:DEFENSE"].map(s => { const [k, l] = s.split(":"); return '<button type="button" class="mg-act" data-a="' + k + '" disabled>' + pixSVG(l) + '<small class="mg-cost"></small></button>'; }).join("")
    + "</div></div>";
  host.appendChild(el);
  const $ = s => el.querySelector(s), stage = $(".mg-stage"), cv = $(".mg-gl"), ovc = $(".mg-ov"), tagsEl = $(".mg-tags"), say = $(".mg-say");
  let arena;
  try { arena = createArena(cv, ovc, { quality: o.quality, glbUrl: o.glbUrl }); }
  catch (e){ el.querySelector(".mg-stage").innerHTML = '<p class="mg-nogl">Ce téléphone n\'a pas pu démarrer la 3D (WebGL 2). Le combat ne peut pas s\'afficher ici.</p>'; }

  /* ---------- état de la mise en scène ---------- */
  const b = createBattle({ titoLv: o.titoLv, forgeLv: o.forgeLv, horde: o.horde, vivres: o.vivres });
  const slotsG = SLOTS.ground.slice(), slotsA = SLOTS.air.slice();
  const mons = b.mons.map((m, i) => { const p = (m.fly ? slotsA.shift() : slotsG.shift()) || [i - 1, 0, 5]; return { kind: m.kind, home: p.slice(), pos: p.slice(), yaw: yawTo(p, HOME)*.4, k: 1, flash: 0, seed: i*1.7, grow: 1, sel: false }; });
  let paused = false, target = firstTarget(b, 0), menuOpen = false, action = null, ended = false, endT = 0, speed = o.prefs.x2 ? 2 : 1, auto = !!o.prefs.auto, tNow = 0, started = false;
  const tito = { pos: HOME.slice(), yaw: 0, flash: 0, guard: false };
  const baseYaw = () => yawTo(HOME, mons[Math.max(0, target)] ? mons[Math.max(0, target)].home : [0, 0, 5]) + .3;
  tito.yaw = baseYaw();
  const anim = { cur: { clip: "Attente", t0: 0, loop: true }, prev: null, f0: -9 };
  function play(clip, loop, offset){ if (anim.cur.clip === clip && anim.cur.loop && loop) return; anim.prev = anim.cur; anim.cur = { clip, t0: tNow - (offset || 0), loop }; anim.f0 = tNow; }
  function titoPose(){
    const w = clamp01((tNow - anim.f0)/FADE), ev = a => ({ clip: a.clip, t: tNow - a.t0, loop: a.loop });
    return w < 1 && anim.prev ? { pos: tito.pos, yaw: tito.yaw, A: ev(anim.prev), B: ev(anim.cur), w, flash: tito.flash } : { pos: tito.pos, yaw: tito.yaw, A: ev(anim.cur), flash: tito.flash };
  }
  const idle = () => play(tito.guard ? "Defense" : "Attente", true);
  const monTop = i => { const m = mons[i]; return [m.pos[0], m.pos[1] + MON_H[m.kind]*(m.k || 1), m.pos[2]]; };
  const titoChest = () => [tito.pos[0], 1.0, tito.pos[2]];
  function speak(txt, ms){ say.innerHTML = '<span class="parch">' + txt + "</span>"; say.classList.add("on"); clearTimeout(speak.t); speak.t = setTimeout(() => say.classList.remove("on"), ms || 1400); }

  /* ---------- actions mises en scène : liste d'étapes (temps en secondes d'action) ---------- */
  function run(dur, steps, update){ action = { t: 0, dur, steps: steps.sort((a, c) => a[0] - c[0]), update }; }
  function titoStrike(res, kind){
    const m = mons[res.target], tp = m.home, hit = [tp[0] - (tp[0] - HOME[0])*.2, 0, tp[2] - 1.0], big = kind === "skill", t0 = big ? .38 : 0;
    const steps = [
      [t0, () => { play("Course", true); }],
      [t0 + .42, () => play("Attaque", false, .3)],
      [t0 + .64, () => { arena && arena.FX.slash([m.pos[0] - .05, m.pos[1] + (m.kind === "feu" ? 0 : .62), m.pos[2] - .35], big);
        if (big) arena && arena.FX.light([m.pos[0], m.pos[1] + .7, m.pos[2] - .2]);
        else arena && arena.FX.burst([m.pos[0], m.pos[1] + .6, m.pos[2] - .4]);
        m.flash = 1; m.kb = 1;
        arena && arena.FX.num(monTop(res.target), res.dmg + (res.crit ? "!" : ""), res.crit || big ? "#F6DD86" : "#FFF1C9");
        if (res.weak) setTimeout(() => speak("Point faible !", 900), 0);
        if (m.kind === "paperasseux") arena && arena.FX.scraps([m.pos[0], .9, m.pos[2] - .2]);
        if (res.kill){ m.dying = tNow; arena && arena.FX.puff([m.pos[0], m.pos[1] + .3, m.pos[2]], m.kind === "feu" ? [1, .6, .25] : [.75, .7, .85]); } }],
      [t0 + .95, () => { play("Attente", true); }],
      [t0 + 1.45, () => { tito.pos = HOME.slice(); }]
    ];
    if (big) steps.push([0, () => { play("Victoire", false, .25); arena && arena.FX.light(titoChest()); speak(SKILL.name, 1100); }]);
    run(t0 + 1.5, steps, t => {
      const u = t - t0;
      if (u < 0) return;
      if (u < .42){ const k = easeIO(u/.42); tito.pos = [lerp(HOME[0], hit[0], k), 0, lerp(HOME[2], hit[2], k)]; tito.yaw = yawTo(HOME, hit); }
      else if (u < .95){ tito.pos = hit; tito.yaw = yawTo(hit, m.pos); }
      else if (u < 1.45){ const k = easeIO((u - .95)/.5); tito.pos = [lerp(hit[0], HOME[0], k), Math.sin(k*Math.PI)*.45, lerp(hit[2], HOME[2], k)]; tito.yaw = yawTo(hit, HOME) + Math.PI; }
      else tito.yaw = baseYaw();
    });
  }
  function titoItem(res){
    run(1.0, [[0, () => { play("Victoire", false, .4); speak("Ration : +" + res.heal + " PV", 1100); }], [.25, () => { arena && arena.FX.heal(titoChest()); arena && arena.FX.num([tito.pos[0], 1.8, tito.pos[2]], "+" + res.heal, "#9BE07A"); }], [.85, () => idle()]]);
  }
  function titoDefend(){
    run(.7, [[0, () => { tito.guard = true; play("Defense", true); arena && arena.FX.burst([tito.pos[0], 1, tito.pos[2] + .3], [.6, .8, 1], .9); speak("Défense", 800); }]]);
  }
  function monStrike(res){
    const i = res.who, m = mons[i], name = b.mons[i].name;
    if (res.skip){ run(1.1, [[0, () => { speak(name + " " + res.txt + "…", 1200); m.wob = tNow; }]]); return; }
    const hitTito = at => [at, () => {
      tito.flash = res.guarded ? .5 : .9;
      arena && arena.FX.burst([tito.pos[0], 1.05, tito.pos[2] + .2], m.kind === "feu" ? [1, .55, .2] : [1, .9, .8], 1);
      arena && arena.FX.num([tito.pos[0], 1.9, tito.pos[2]], res.dmg, m.kind === "feu" ? "#F2A04A" : "#F28A7A");
      if (!res.guarded) play("CoupRecu", false); }];
    const back = at => [at, () => { if (b.over !== "lose") idle(); }];
    if (m.kind === "lambin"){
      const to = [lerp(m.home[0], HOME[0], .62), 0, lerp(m.home[2], HOME[2], .62)];
      run(1.2, [hitTito(.38), back(.95)], t => { const k = t < .38 ? easeIO(t/.38) : t < .55 ? 1 : 1 - easeIO((t - .55)/.4); m.pos = [lerp(m.home[0], to[0], clamp01(k)), Math.sin(clamp01(k)*Math.PI)*.25, lerp(m.home[2], to[2], clamp01(k))]; });
    } else if (m.kind === "paperasseux"){
      run(1.2, [[.1, () => arena && arena.FX.sheet([m.pos[0] + .3, 1.2, m.pos[2] - .2], [tito.pos[0], 1.1, tito.pos[2] + .2], .45)], [.55, () => arena && arena.FX.scraps([tito.pos[0], 1.1, tito.pos[2] + .2])], hitTito(.55), back(1.05)],
        t => { m.pos = [m.home[0], t < .2 ? Math.sin(t/.2*Math.PI)*.12 : 0, m.home[2]]; });
    } else {
      run(1.35, [[.45, () => arena && arena.FX.ball([m.pos[0], m.pos[1], m.pos[2]], [tito.pos[0], 1.05, tito.pos[2] + .2], .42)], hitTito(.88), back(1.2)],
        t => { m.grow = t < .45 ? 1 + t*1.1 : t < .6 ? 1.5 - (t - .45)*3.3 : 1; });
    }
  }

  /* ---------- menu ---------- */
  const acts = [...el.querySelectorAll(".mg-act")];
  function refreshMenu(){
    acts.forEach(a => {
      const k = a.dataset.a, cost = a.querySelector(".mg-cost");
      let ok = menuOpen;
      if (k === "skill"){ ok = ok && canSkill(b); cost.textContent = SKILL.cost + " PM"; }
      else if (k === "item"){ ok = ok && canItem(b); cost.textContent = "Ration " + (b.rations - b.rationsUsed) + "/" + b.rations; }
      else if (k === "magic"){ ok = false; cost.textContent = "Tour du Mage"; }
      else cost.textContent = "";
      a.disabled = !ok; a.classList.toggle("on", menuOpen);
    });
    el.classList.toggle("mg-myturn", menuOpen);
  }
  function choose(act){
    if (!menuOpen || action || b.over) return;
    if (act === "skill" && !canSkill(b)) return; if (act === "item" && !canItem(b)) return;
    target = firstTarget(b, target); menuOpen = false; refreshMenu();
    const res = titoAct(b, act, target);
    if (act === "attack" || act === "skill"){ tito.guard = false; titoStrike(res, act); }
    else if (act === "item"){ tito.guard = false; titoItem(res); }
    else titoDefend();
    o.onFeedback && o.onFeedback(act === "item" ? { vivres: RATION.cost } : null);
  }
  acts.forEach(a => on(a, "click", () => choose(a.dataset.a)));
  el.querySelectorAll(".mg-chip").forEach(c => { const k = c.dataset.t; c.setAttribute("aria-pressed", String(k === "x2" ? speed === 2 : auto));
    on(c, "click", () => { if (k === "x2"){ speed = speed === 2 ? 1 : 2; o.prefs.x2 = speed === 2; } else { auto = !auto; o.prefs.auto = auto; if (auto && menuOpen){ const c2 = autoChoice(b, target); choose(c2.act); } }
      c.setAttribute("aria-pressed", String(k === "x2" ? speed === 2 : auto)); o.onPrefs && o.onPrefs(o.prefs); }); });
  on($(".mg-flee"), "click", async () => { if (ended) return; const wasOpen = menuOpen; paused = true;
    const ok = await o.ask("QUITTER ?", "Le combat ne compte pas : la horde t'attendra jusqu'à minuit.", "Quitter", "Rester"); paused = false; last = performance.now();
    if (ok && !ac.signal.aborted) quit(); else menuOpen = wasOpen; });
  /* choisir la cible : toucher le monstre (étiquette ou dans la scène) */
  const tagEls = mons.map((m, i) => { const t = document.createElement("button"); t.type = "button"; t.className = "mg-tag"; t.setAttribute("aria-label", "Viser " + b.mons[i].name);
    t.innerHTML = pixSVG(b.mons[i].name, { shadow: "#1A120C" }) + '<span class="mg-hp"><i></i></span>'; tagsEl.appendChild(t); on(t, "click", () => { if (b.mons[i].alive){ target = i; } }); return t; });
  on(cv, "click", e => { const r = cv.getBoundingClientRect(); let best = -1, bd = 70;
    mons.forEach((m, i) => { if (!b.mons[i].alive || !arena) return; const p = arena.proj([m.pos[0], m.pos[1] + MON_H[m.kind]*.5, m.pos[2]]); if (!p) return; const d = Math.hypot(p[0] - (e.clientX - r.left), p[1] - (e.clientY - r.top)); if (d < bd){ bd = d; best = i; } });
    if (best >= 0) target = best; });

  /* ---------- mise en page ---------- */
  function layout(){
    const W = Math.min(host.clientWidth, 520), Hmax = host.clientHeight - 200;          /* le panneau du bas garde au moins 200 px */
    const H = Math.max(240, Math.min(Math.round(W*1.5), Hmax));
    stage.style.width = W + "px"; stage.style.height = H + "px";
    arena && arena.resize(W, H);
  }
  layout(); on(window, "resize", () => { clearTimeout(layout.t); layout.t = setTimeout(layout, 150); });

  /* ---------- boucle ---------- */
  const hpI = $(".mg-gauge.hp i"), mpI = $(".mg-gauge.mp i"), atbI = $(".mg-gauge.atb i"), hpN = $(".hpn"), mpN = $(".mpn");
  let raf = 0, last = performance.now(), endRes = null;
  function finish(){
    ended = true; endT = tNow;
    const win = b.over === "win";
    endRes = { win, n: b.mons.length, rationsUsed: b.rationsUsed };
    if (win){ play("Victoire", false); speak("Victoire !", 1800); } else { speak("Tito est à terre…", 1800); }
    setTimeout(() => { if (!ac.signal.aborted) o.onEnd(endRes); }, win ? 1900 : 1700);
  }
  function step(now){
    raf = requestAnimationFrame(step);
    const realDt = Math.min(50, now - last); last = now; if (document.hidden || paused) return;
    if (arena && !arena.tito){ return; }
    if (!started){ started = true; $(".mg-load").remove(); tNow = 0; }
    const dt = realDt/1000*speed*(o.testSpeed || 1); tNow += dt;
    /* action en cours */
    if (action){
      action.t += dt;
      while (action.steps.length && action.steps[0][0] <= action.t) action.steps.shift()[1]();
      action.update && action.update(action.t);
      if (action.t >= action.dur){ action = null; if (b.over && !ended) finish(); }
    } else if (!ended && !menuOpen && !b.over){
      const nx = tick(b, dt);
      if (nx){
        if (nx.who === "tito"){
          tito.guard = false; idle();
          if (auto){ const c = autoChoice(b, target); target = c.target; menuOpen = true; choose(c.act); }
          else { menuOpen = true; target = firstTarget(b, target); refreshMenu(); try { navigator.vibrate && navigator.vibrate(12); } catch (e) {} }
        } else monStrike(monAct(b, nx.who));
      }
    }
    /* monstres : éclair blanc, recul, disparition */
    mons.forEach((m, i) => {
      m.flash = Math.max(0, m.flash - dt*4);
      if (m.kb){ m.kb = Math.max(0, m.kb - dt*3); m.pos = [m.home[0], m.home[1], m.home[2] + Math.sin((1 - m.kb)*Math.PI)*.22]; if (!m.kb) m.pos = m.home.slice(); }
      if (m.dying != null) m.k = Math.max(0, 1 - (tNow - m.dying)/.55);
      if (m.wob != null && tNow - m.wob < .8) m.yaw = yawTo(m.home, HOME)*.4 + Math.sin((tNow - m.wob)*18)*.25*(1 - (tNow - m.wob)/.8); else if (m.wob != null){ m.wob = null; m.yaw = yawTo(m.home, HOME)*.4; }
      m.sel = (menuOpen || auto) && i === target && b.mons[i].alive && !ended;
    });
    tito.flash = Math.max(0, tito.flash - dt*3);
    if (!action && !ended) tito.yaw = baseYaw();
    arena && arena.frame(now, realDt, { tito: titoPose(), mons, dim: ended && !endRes.win ? Math.min(1, (tNow - endT)/1.2) : 0 });
    /* panneau */
    const t = b.tito;
    hpI.style.width = (t.hp/t.hpMax*100).toFixed(1) + "%"; mpI.style.width = (t.mp/t.mpMax*100).toFixed(1) + "%"; atbI.style.width = t.atb.toFixed(1) + "%";
    atbI.parentNode.classList.toggle("full", t.atb >= 100); hpI.parentNode.classList.toggle("low", t.hp < t.hpMax*.3);
    const hs = t.hp + "/" + t.hpMax, ms = t.mp + "/" + t.mpMax; if (hpN.dataset.v !== hs){ hpN.dataset.v = hs; hpN.innerHTML = pixSVG(hs, { shadow: "#2A1A10" }); } if (mpN.dataset.v !== ms){ mpN.dataset.v = ms; mpN.innerHTML = pixSVG(ms, { shadow: "#2A1A10" }); }
    /* étiquettes des monstres */
    mons.forEach((m, i) => { const tg = tagEls[i], bm = b.mons[i];
      if (!arena || (!bm.alive && m.k <= .05)){ tg.hidden = true; return; }
      const p = arena.proj(monTop(i)); if (!p){ tg.hidden = true; return; }
      tg.hidden = false; tg.style.transform = "translate(" + Math.round(p[0]) + "px," + Math.round(p[1] - 6) + "px) translate(-50%,-100%)";
      tg.querySelector("i").style.width = (bm.hp/bm.hpMax*100).toFixed(1) + "%"; tg.classList.toggle("sel", m.sel); });
  }
  if (arena) arena.ready.catch(() => { const l = $(".mg-load"); if (l) l.innerHTML = '<p class="mg-nogl">Le modèle de Tito n\'a pas pu se charger. Vérifie ta connexion.</p>'; });
  raf = requestAnimationFrame(step);
  function quit(){ dispose(); o.onQuit(); }
  function dispose(){ cancelAnimationFrame(raf); ac.abort(); clearTimeout(speak.t); arena && arena.dispose(); el.remove(); }
  return { dispose, setQuality: q => arena && (arena.setQuality(q), layout()) };
}

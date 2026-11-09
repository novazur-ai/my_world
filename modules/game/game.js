/* Forpharos : point d'entrée du jeu (MyWorld_1.1).
   My World charge ce module à la demande (import()) et l'installe dans le calque #gameRoot, hors de #view.
   mount(root, opts) → { unmount }. Aucune variable globale ; tout est nettoyé à la sortie (images, minuteries, écouteurs).
   Le jeu lit l'XP de My World sans jamais la modifier, et n'écrit que sous users/{uid}/game/…. */
import { RES, RES_NAME, STAT_NAME, BUILDINGS, costFor, tributeFor, titoXpNeed, titoStats, hordeFor, hordePower, villageDefense, forgeAtk, lootFor, DAY_CAP } from "./core/rules.js";
import { newState, parisDay, monthOf, dayNum, daysInMonth, nextDay, monthStartISO, harvest, xpAverage, canBuild, startBuild, tickBuilds, jobProgress,
  applyFight, foughtToday, advanceTo, addRes, hordeDay, RODAGE } from "./core/state.js";
import { openStore } from "./services/store.js";
import { createVillage, forgePhase, hallPhase } from "./render/village.js";
import { pixSVG, iconSVG } from "./render/pix.js";
import { openCombat } from "./ui/combat.js";
import { QUALITY } from "./render/arena.js";

const MONTHS = ["JANVIER", "FEVRIER", "MARS", "AVRIL", "MAI", "JUIN", "JUILLET", "AOUT", "SEPTEMBRE", "OCTOBRE", "NOVEMBRE", "DECEMBRE"];
const GLB = new URL("./assets/tito.glb", import.meta.url).href;
const CSS = new URL("./game.css", import.meta.url).href;
const fmt = n => String(Math.floor(n));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const resLine = (o, sign) => RES.filter(r => o && o[r]).map(r => '<span class="mg-r">' + iconSVG(r) + (sign || "") + fmt(o[r]) + "</span>").join("") || '<span class="mg-dim">rien</span>';

export function mount(root, opts){
  opts = opts || {};
  const ac = new AbortController(), on = (el, ev, fn, o2) => el.addEventListener(ev, fn, Object.assign({ signal: ac.signal }, o2 || {}));
  let raf = 0, tick = 0, store = null, st = null, slot = "state", today = null, online = false, combat = null, sel = null, busy = false, lastDone = [];
  const prefs = Object.assign({ quality: "equilibree", x2: false, auto: false, debug: false }, readPref());
  function readPref(){ try { return JSON.parse(localStorage.getItem("mw-game-prefs") || "{}"); } catch (e) { return {}; } }
  function savePref(){ try { localStorage.setItem("mw-game-prefs", JSON.stringify(prefs)); } catch (e) {} }

  /* ---------- feuille de style (une seule fois) et barre d'état sombre ---------- */
  if (!document.getElementById("mw-game-css")){ const l = document.createElement("link"); l.id = "mw-game-css"; l.rel = "stylesheet"; l.href = CSS; document.head.appendChild(l); }
  const meta = document.querySelector('meta[name="theme-color"]'), prevTheme = meta && meta.content; if (meta) meta.content = "#1A130E";

  root.innerHTML = '<div class="mw-game" role="application" aria-label="Forpharos, le jeu de My World">'
    + '<div class="mg-screen mg-vil">'
    + '<header class="mg-bar wood"><button type="button" class="mg-ibtn" data-g="exit" aria-label="Revenir à My World">' + pixSVG("X") + '</button>'
    + '<div class="mg-res" aria-label="Ressources"></div><button type="button" class="mg-ibtn" data-g="menu" aria-label="Menu du jeu">' + gearSVG() + "</button></header>"
    + '<div class="mg-vwrap"><canvas class="mg-vcv" role="img" aria-label="Le village de Forpharos"></canvas><div class="mg-ribbon" hidden>' + pixSVG("MODE TEST", { shadow: "#3A1410" }) + '</div><div class="mg-chant parch" hidden></div></div>'
    + '<div class="mg-info"><div class="mg-day parch"></div><button type="button" class="mg-fight" data-g="fight"><span class="mg-fl">' + pixSVG("COMBATTRE", { shadow: "#5E2019" }) + '</span><small></small></button></div>'
    + '<section class="mg-blds" aria-label="Bâtiments"></section>'
    + '<p class="mg-foot"></p>'
    + "</div>"
    + '<div class="mg-layer" hidden></div>'
    + '<div class="mg-turn">' + pixSVG("TOURNE TON TELEPHONE", { shadow: "#000" }) + "<p>Forpharos se joue en hauteur.</p></div>"
    + "</div>";
  const G = root.firstChild, $ = s => G.querySelector(s), layerEl = $(".mg-layer");
  const V = createVillage($(".mg-vcv"));

  /* les flèches du clavier ne doivent pas faire quitter le jeu (navigation de My World) */
  on(window, "keydown", e => { if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || "")) e.stopImmediatePropagation(); }, { capture: true });

  /* ---------- fenêtres (parchemin) ---------- */
  function modal(html, cls){
    return new Promise(res => {
      layerEl.hidden = false; layerEl.innerHTML = '<div class="mg-veil"></div><div class="mg-modal parch ' + (cls || "") + '" role="dialog" aria-modal="true">' + html + "</div>";
      const m = layerEl.querySelector(".mg-modal"), close = v => { layerEl.hidden = true; layerEl.innerHTML = ""; res(v); };
      m.querySelectorAll("[data-m]").forEach(b => b.addEventListener("click", () => close(b.dataset.m)));
      layerEl.querySelector(".mg-veil").addEventListener("click", () => { if (!m.querySelector("[data-stay]")) close(null); });
      const f = m.querySelector("button"); if (f) setTimeout(() => f.focus({ preventScroll: true }), 30);
      modal.cur = { m, close };
    });
  }
  const ask = (title, txt, yes, no) => modal("<h2>" + pixSVG(title) + "</h2><p>" + txt + '</p><div class="mg-btns"><button type="button" class="mg-b2" data-m="0">' + (no || "Annuler") + '</button><button type="button" class="mg-b1" data-m="1">' + yes + "</button></div>").then(v => v === "1");
  function toast(txt){ let t = G.querySelector(".mg-toast"); if (!t){ t = document.createElement("div"); t.className = "mg-toast parch"; t.setAttribute("role", "status"); G.appendChild(t); } t.innerHTML = txt; t.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2600); }

  /* ---------- affichage du village ---------- */
  function renderRes(){
    $(".mg-res").innerHTML = RES.map(r => '<span class="mg-rc" title="' + RES_NAME[r] + '">' + iconSVG(r) + pixSVG(fmt(st ? st.res[r] : 0), { shadow: "#2A1A10" }) + '<span class="sr">' + RES_NAME[r] + "</span></span>").join("");
  }
  function renderInfo(){
    if (!st) return;
    const d = dayNum(today), mo = MONTHS[+today.slice(5, 7) - 1], rod = st.month === RODAGE, boss = 25 - d;
    const need = titoXpNeed(st.tito.lv), pc = Math.round(st.tito.xp/need*100);
    $(".mg-day").innerHTML = '<div class="mg-l1">' + pixSVG("JOUR " + d + " · " + mo) + "</div>"
      + '<div class="mg-l2">' + (rod ? pixSVG("MOIS DE RODAGE", { shadow: "" }) : boss > 0 ? pixSVG("BOSS DANS " + boss + " J") : pixSVG("BOSS : PROCHAINE ETAPE")) + "</div>"
      + '<div class="mg-l3">' + pixSVG("TITO NIV " + st.tito.lv) + '<span class="mg-xpb" title="' + st.tito.xp + " / " + need + ' XP de combat"><i style="width:' + pc + '%"></i></span></div>'
      + (online ? "" : '<div class="mg-off">Hors ligne : le jour n\'avance pas sans connexion.</div>');
    const done = foughtToday(st, today), fb = $(".mg-fight");
    fb.disabled = done; fb.classList.toggle("done", done);
    fb.querySelector(".mg-fl").innerHTML = pixSVG(done ? (st.fight.win ? "HORDE REPOUSSEE" : "A DEMAIN") : "COMBATTRE", { shadow: "#5E2019" });
    fb.querySelector("small").textContent = done ? (st.fight.win ? "Revenez demain pour la prochaine horde" : "La horde reviendra cette nuit contre les murs") : hordeFor(hordeDay(st, today)).map(m => m.name).join(" · ");
  }
  function bldCard(key){
    const b = BUILDINGS[key], s = st.bld[key], now = Date.now(), c = canBuild(st, key), to = s.lv + 1;
    let act;
    if (s.job){ const p = jobProgress(s.job, now), ph = key === "forge" ? forgePhase(p) : hallPhase(p), name = b.phases[ph.i];
      act = '<div class="mg-prog"><span class="mg-pl">Phase ' + (ph.i + 1) + "/" + b.phases.length + " · " + esc(name) + '</span><span class="mg-pb"><i style="width:' + (p*100).toFixed(1) + '%"></i></span></div>'; }
    else if (to > b.max) act = '<div class="mg-max">' + pixSVG("NIVEAU MAX") + "</div>";
    else { const cost = costFor(key, to);
      act = '<div class="mg-cost">' + RES.filter(r => cost[r]).map(r => '<span class="mg-r' + ((st.res[r] || 0) < cost[r] ? " short" : "") + '">' + iconSVG(r) + fmt(cost[r]) + "</span>").join("") + "</div>"
        + '<button type="button" class="mg-b1 mg-build" data-b="' + key + '"' + (c.ok ? "" : " disabled") + ">" + (s.lv ? "Améliorer au niv " + to : "Construire") + "</button>"
        + (c.ok ? "" : '<small class="mg-why">' + esc(c.why) + "</small>"); }
    return '<article class="mg-card wood' + (sel === key ? " sel" : "") + '" data-k="' + key + '"><div class="mg-ch"><h3>' + pixSVG(b.name.toUpperCase(), { shadow: "#2A1A10" }) + "</h3>"
      + '<span class="mg-lvl">' + pixSVG(s.lv ? "NIV " + s.lv : "A BATIR", { shadow: "#2A1A10" }) + "</span></div>"
      + '<p class="mg-eff">' + esc(s.lv ? b.effect(s.lv) : b.desc) + "</p>" + act + "</article>";
  }
  function renderBlds(){ if (st) $(".mg-blds").innerHTML = bldCard("hall") + bldCard("forge"); }
  function renderChantier(){
    const j = Object.keys(st.bld).find(k => st.bld[k].job), el = $(".mg-chant");
    if (!j){ el.hidden = true; return; }
    const b = BUILDINGS[j], p = jobProgress(st.bld[j].job, Date.now()), ph = j === "forge" ? forgePhase(p) : hallPhase(p), left = Math.max(0, Math.ceil((1 - p)*st.bld[j].job.dur/1000));
    el.hidden = false; el.innerHTML = "<b>Chantier : " + esc(b.name) + "</b><span>" + esc(b.phases[ph.i]) + " · " + left + " s</span>";
  }
  function renderAll(){ renderRes(); renderInfo(); renderBlds(); renderChantier(); $(".mg-ribbon").hidden = slot !== "debug";
    $(".mg-foot").textContent = "Forpharos · " + (opts.version || "") + (slot === "debug" ? " · partie de test (séparée)" : ""); }

  /* ---------- boucle du village (60 i/s, arrêtée pendant un combat ou en arrière-plan) ---------- */
  let last = performance.now();
  function loop(now){
    raf = requestAnimationFrame(loop);
    const dt = Math.min(50, now - last); last = now;
    if (document.hidden || combat) return;
    if (!st){ V.draw(now, dt, { hallLv: 1, hallJob: null, forgeLv: 0, forgeJob: null, sel: null }); return; }   /* en attendant les données */
    const n = Date.now(), hj = st.bld.hall.job, fj = st.bld.forge.job;
    V.draw(now, dt, { hallLv: st.bld.hall.lv, hallJob: hj ? jobProgress(hj, n) : null, forgeLv: st.bld.forge.lv, forgeJob: fj ? jobProgress(fj, n) : null, sel });
  }
  function sizeVillage(){ const w = Math.min(G.clientWidth - 8, 560); V.resize(w); }

  /* ---------- chantiers qui avancent ---------- */
  tick = setInterval(() => {
    if (!st) return;
    const done = tickBuilds(st, Date.now());
    if (done.length){ save(); renderAll(); done.forEach(k => { toast("<b>" + esc(BUILDINGS[k].name) + "</b> " + (st.bld[k].lv > 1 ? "passe au niveau " + st.bld[k].lv : "est construite") + " !"); }); }
    else if (Object.values(st.bld).some(b => b.job)){ renderChantier(); G.querySelectorAll(".mg-card").forEach(c => { const k = c.dataset.k; if (st.bld[k].job){ const p = jobProgress(st.bld[k].job, Date.now()), ph = k === "forge" ? forgePhase(p) : hallPhase(p), i = c.querySelector(".mg-pb i"), l = c.querySelector(".mg-pl");
      if (i) i.style.width = (p*100).toFixed(1) + "%"; if (l) l.textContent = "Phase " + (ph.i + 1) + "/" + BUILDINGS[k].phases.length + " · " + BUILDINGS[k].phases[ph.i]; } }); }
  }, 500);

  /* ---------- données : chargement, jour du serveur, récolte ---------- */
  function save(now){ if (store && st) store.save(slot, st, now); }
  async function sync(first){
    if (busy) return; busy = true;
    try {
      const sv = await store.serverNow(); online = !!sv.ms;
      let realDay = sv.ms ? parisDay(sv.ms) : null;
      if (!st){ st = await store.load(slot); }
      if (!realDay) realDay = st ? st.day : parisDay(Date.now());
      today = realDay;
      if (slot === "debug" && st && st.debugOff){ let d = today; for (let i = 0; i < st.debugOff; i++) d = nextDay(d); today = d; }
      const news = [];
      if (!st){ st = newState(today); if (slot === "debug") st.debugOff = 0; news.push({ t: "start" }); }
      if (today > st.day && monthOf(today) !== st.month){
        const prev = st.month, off = st.debugOff || 0, fake = st.fakeLog;
        st = newState(today, { month: prev, titoLv: st.tito.lv, wins: st.stats.wins }); if (slot === "debug"){ st.debugOff = off; st.fakeLog = fake; }
        news.push({ t: "month", prev });
      }
      const adv = advanceTo(st, today);
      if (adv.days) news.push({ t: "days", adv });
      /* récolte de l'XP réelle (lecture seule) ; en mode test, XP de test en plus */
      let log = [];
      try { log = await store.readLog(monthStartISO(st.month)); } catch (e) { /* hors ligne sans cache : rien à récolter pour l'instant */ }
      if (slot === "debug") log = log.concat(st.fakeLog || []);
      const h = harvest(st, log);
      if (h.counted || h.skipped) news.push({ t: "harvest", h });
      const done = tickBuilds(st, Date.now()); if (done.length) news.push({ t: "built", done });
      save(); renderAll();
      if (news.length) await showNews(news, first);
    } catch (e) { console.warn("[Forpharos]", e); toast("Les données du jeu n'ont pas pu se charger. Réessaie dans un instant."); }
    finally { busy = false; }
  }
  async function showNews(news, first){
    let html = "";
    news.forEach(n => {
      if (n.t === "start") html += "<h3>Bienvenue à Forpharos</h3><p>Tito veille sur le phare. Chaque jour, la Horde du Plus-Tard attaque : ce que tu fais dans la vraie vie (l'XP de My World) devient de l'or, du bois, de la pierre et des vivres pour défendre le village.</p>";
      if (n.t === "month") html += "<h3>Nouveau mois, nouveau village</h3><p>La partie de " + esc(n.prev) + " est terminée. Forpharos repart de zéro ; tes trophées sont gardés.</p>";
      if (n.t === "days"){ const a = n.adv;
        a.nights.forEach(x => { html += "<h3>Nuit du " + (+x.day.slice(8, 10)) + "</h3>" + (x.ok ? "<p>La horde s'est brisée sur les défenses du village (" + x.def + " contre " + Math.round(x.pow) + "). Demi-butin : " + resLine(x.gain, "+") + "</p>" : "<p>La horde a forcé les défenses (" + x.def + " contre " + Math.round(x.pow) + ") et pillé 10 % des réserves : " + resLine(x.lost, "−") + "</p>"); });
        html += "<h3>Tribut" + (a.days > 1 ? " de " + a.days + " jours" : " du jour") + "</h3><p>" + resLine(a.tribute, "+") + "</p>"; }
      if (n.t === "harvest"){ const h = n.h;
        html += "<h3>Récolte de ta vraie vie</h3><p>" + h.counted + " XP comptés" + (h.skipped ? " (" + h.skipped + " non comptés : déjà fait aujourd'hui ou plafond de " + DAY_CAP + " par jour)" : "") + " : " + resLine(h.gain, "+") + "</p>"
          + (Object.keys(h.detail).length ? '<p class="mg-small">' + Object.entries(h.detail).map(([k, v]) => esc(STAT_NAME[k] || k) + " " + v).join(" · ") + "</p>" : ""); }
      if (n.t === "built") html += "<h3>Chantiers terminés</h3><p>" + n.done.map(k => esc(BUILDINGS[k].name) + " niveau " + st.bld[k].lv).join(", ") + ".</p>";
    });
    if (html) await modal('<h2>' + pixSVG(first ? "GAZETTE DU VILLAGE" : "DU NOUVEAU") + "</h2>" + html + '<div class="mg-btns"><button type="button" class="mg-b1" data-m="ok">En avant</button></div>', "mg-news");
  }

  /* ---------- actions ---------- */
  on(G, "click", async e => {
    const t = e.target.closest("[data-g],[data-b]"); if (!t) return;
    if (t.dataset.b){ const k = t.dataset.b, c = canBuild(st, k); if (!c.ok){ toast(esc(c.why)); return; }
      startBuild(st, k, Date.now()); sel = k; save(); renderAll(); toast("Chantier lancé : " + esc(BUILDINGS[k].name)); return; }
    const g = t.dataset.g;
    if (g === "exit") return opts.onExit && opts.onExit();
    if (g === "menu") return openMenu();
    if (g === "fight") return startFight();
  });
  on($(".mg-vcv"), "click", e => { const r = e.currentTarget.getBoundingClientRect(), k = V.hit(e.clientX - r.left, e.clientY - r.top);
    if (k === "phare"){ toast("Le phare de Forpharos : sa lumière, nourrie par tes efforts, repousse la Torpeur."); return; }
    sel = k; renderBlds(); if (k){ const c = G.querySelector('.mg-card[data-k="' + k + '"]'); c && c.scrollIntoView({ behavior: "smooth", block: "nearest" }); } });

  async function startFight(){
    if (!st || combat) return;
    if (foughtToday(st, today)){ toast("La horde du jour a déjà été affrontée. Reviens demain."); return; }
    const d = hordeDay(st, today), horde = hordeFor(d);
    G.classList.add("in-combat");
    const host = document.createElement("div"); host.className = "mg-screen mg-cbt"; G.insertBefore(host, layerEl);
    combat = openCombat(host, { testSpeed: opts.testSpeed, titoLv: st.tito.lv, forgeLv: st.bld.forge.lv, horde, vivres: st.res.vivres, day: d, dayLabel: dayNum(today), quality: prefs.quality, glbUrl: opts.glbUrl || GLB, prefs,
      onPrefs: () => savePref(),
      ask,
      onQuit: () => { closeCombat(host); },
      onEnd: async r => {
        closeCombat(host);
        if (r.rationsUsed) addRes(st, { vivres: r.rationsUsed*5 }, -1);
        const out = applyFight(st, today, r.win, r.n); save(true); renderAll();
        if (r.win) await modal("<h2>" + pixSVG("VICTOIRE !") + "</h2><p>La horde du jour " + dayNum(today) + " recule devant Tito.</p><h3>Butin</h3><p>" + resLine(out.loot, "+") + "</p><p>Tito gagne " + out.xp + " XP de combat." + (out.ups.length ? " <b>Niveau " + st.tito.lv + " !</b>" : "") + "</p>"
          + (r.rationsUsed ? '<p class="mg-small">Rations mangées : ' + r.rationsUsed + " (−" + r.rationsUsed*5 + " vivres)</p>" : "") + '<div class="mg-btns"><button type="button" class="mg-b1" data-m="ok">Au village</button></div>', "mg-win");
        else await modal("<h2>" + pixSVG("DEFAITE") + "</h2><p>Tito a dû se replier. La horde reviendra cette nuit contre les défenses du village (" + villageDefense(st.bld.hall.lv, st.tito.lv, st.bld.forge.lv) + " contre " + Math.round(hordePower(d)) + ").</p><p>Tito apprend de ses erreurs : +" + out.xp + " XP de combat." + (out.ups.length ? " <b>Niveau " + st.tito.lv + " !</b>" : "") + '</p><p class="mg-small">Monte la Forge et l\'Hôtel de ville pour la prochaine fois.</p><div class="mg-btns"><button type="button" class="mg-b1" data-m="ok">Au village</button></div>', "mg-lose");
      }
    });
  }
  function closeCombat(host){ if (combat){ combat.dispose(); combat = null; } host.remove(); G.classList.remove("in-combat"); sizeVillage(); }

  /* ---------- menu : qualité 3D, mode test, règles ---------- */
  async function openMenu(){
    const q = Object.keys(QUALITY).map(k => '<button type="button" class="mg-seg' + (prefs.quality === k ? " on" : "") + '" data-q="' + k + '">' + QUALITY[k].label + "</button>").join("");
    const dbg = slot === "debug" ? debugHTML() : "";
    const p = modal("<h2>" + pixSVG("MENU") + "</h2><h3>Qualité de la 3D (combats)</h3><div class=\"mg-segs\">" + q + "</div>"
      + '<p class="mg-small">Équilibrée par défaut. Économie si le téléphone chauffe ou saccade.</p>'
      + "<h3>Mode test</h3><p class=\"mg-small\">Une partie séparée pour essayer : jours simulés, XP de test (jamais écrite dans My World).</p>"
      + '<button type="button" class="mg-b2 mg-wide" data-x="debug">' + (slot === "debug" ? "Revenir à la vraie partie" : "Passer en mode test") + "</button>" + dbg
      + "<h3>Règles</h3><p class=\"mg-small\">L'XP gagnée dans My World devient des ressources (Sagesse → or, Dextérité → bois, Force → pierre, Constitution et Charisme → vivres, Intelligence → éclats). Une même ligne compte une fois par jour, " + DAY_CAP + " XP au plus. Une horde par jour ; sans combat, elle attaque les murs à minuit. Le boss arrive le 25 (prochaine étape).</p>"
      + '<div class="mg-btns"><button type="button" class="mg-b1" data-m="ok">Fermer</button></div>', "mg-menu");
    const m = modal.cur.m;
    m.querySelectorAll("[data-q]").forEach(b => b.addEventListener("click", () => { prefs.quality = b.dataset.q; savePref(); m.querySelectorAll("[data-q]").forEach(x => x.classList.toggle("on", x === b)); }));
    m.querySelector('[data-x="debug"]').addEventListener("click", async () => { modal.cur.close(); prefs.debug = slot !== "debug"; savePref(); await switchSlot(prefs.debug ? "debug" : "state"); });
    m.querySelectorAll("[data-d]").forEach(b => b.addEventListener("click", () => debugAct(b.dataset.d, b.dataset.s)));
    await p;
  }
  function debugHTML(){
    const d = hordeDay(st, today), avg = realAvg.v;
    return '<div class="mg-dbg"><p class="mg-small"><b>Jour simulé :</b> ' + today + (st.debugOff ? " (+" + st.debugOff + " j)" : "") + " · défense " + villageDefense(st.bld.hall.lv, st.tito.lv, st.bld.forge.lv) + " / horde " + Math.round(hordePower(d)) + "</p>"
      + '<div class="mg-dgrid"><button type="button" class="mg-b2" data-d="day">+1 jour</button><button type="button" class="mg-b2" data-d="build">Chantier fini</button><button type="button" class="mg-b2" data-d="refight">Rejouer la horde</button><button type="button" class="mg-b2" data-d="reset">Remise à zéro du mois</button><button type="button" class="mg-b2" disabled>Boss tout de suite (étape suivante)</button></div>'
      + '<p class="mg-small"><b>XP de test :</b></p><div class="mg-dgrid">' + Object.keys(STAT_NAME).map(k => '<button type="button" class="mg-b2" data-d="xp" data-s="' + k + '">+50 ' + STAT_NAME[k] + "</button>").join("") + "</div>"
      + '<p class="mg-small"><b>Ta vraie moyenne ce mois-ci :</b> ' + (avg ? avg.perDay + " XP comptés par jour (" + avg.played + " jours actifs sur " + avg.days + ", " + avg.total + " XP au total)" : "calcul…") + ". Référence d'équilibrage : 40 XP par jour, 70 % des jours.</p></div>";
  }
  const realAvg = { v: null };
  async function computeAvg(){ try { const real = parisDay((await store.serverNow()).ms || Date.now()), tmp = newState(real); harvest(tmp, await store.readLog(monthStartISO(tmp.month))); realAvg.v = xpAverage(tmp, real); } catch (e) {} }
  async function debugAct(k, stat){
    if (k === "day"){ st.debugOff = (st.debugOff || 0) + 1; save(); modal.cur.close(); await sync(false); return; }
    if (k === "build"){ Object.values(st.bld).forEach(b => { if (b.job) b.job.start -= b.job.dur; }); tickBuilds(st, Date.now()); save(); renderAll(); toast("Chantiers terminés."); return; }
    if (k === "refight"){ st.fight = null; save(); renderAll(); toast("La horde du jour peut être rejouée."); return; }
    if (k === "reset"){ const off = st.debugOff || 0; st = newState(today); st.debugOff = off; save(); renderAll(); modal.cur.close(); toast("Partie de test remise à zéro."); return; }
    if (k === "xp"){ (st.fakeLog = st.fakeLog || []).push({ id: "test-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6), label: "Test " + STAT_NAME[stat] + " " + (st.fakeLog.length + 1), stat, xp: 50, at: today + "T12:00:00.000Z" });
      const h = harvest(st, st.fakeLog); save(); renderAll(); toast("+" + h.counted + " XP comptés : " + resLine(h.gain, "+")); }
  }
  async function switchSlot(s){ store.flush(); slot = s; st = null; sel = null; await sync(true); if (s === "debug") computeAvg(); }

  /* ---------- démarrage ---------- */
  sizeVillage(); renderRes(); $(".mg-day").innerHTML = '<div class="mg-l1">' + pixSVG("CHARGEMENT") + "</div>";
  on(window, "resize", () => { clearTimeout(sizeVillage.t); sizeVillage.t = setTimeout(sizeVillage, 120); });
  on(document, "visibilitychange", () => { if (!document.hidden && store && !combat) sync(false); });
  raf = requestAnimationFrame(loop);
  (async () => {
    try { store = await openStore(opts.mock ? { mock: opts.mock } : null); }
    catch (e) { $(".mg-day").innerHTML = '<div class="mg-off">Connecte-toi à My World pour jouer.</div>'; toast("Connecte-toi à My World pour jouer."); return; }
    slot = prefs.debug ? "debug" : "state";
    await sync(true);
    if (slot === "debug") computeAvg();
  })();

  function unmount(){
    cancelAnimationFrame(raf); clearInterval(tick); clearTimeout(toast.t); ac.abort();
    if (combat){ combat.dispose(); combat = null; }
    if (store && st){ store.flush(); store.save(slot, st, true); }
    if (meta && prevTheme) meta.content = prevTheme;
    root.innerHTML = "";
  }
  return { unmount };
}
function gearSVG(){ return '<svg class="pxi" viewBox="0 0 9 9" shape-rendering="crispEdges" aria-hidden="true"><path fill="#241810" d="M3 0h3v1h1v1h1v1h1v3h-1v1h-1v1h-1v1h-3v-1h-1v-1h-1v-1h-1v-3h1v-1h1v-1h1z"/><path fill="#D9C08A" d="M3 1h3v1h1v1h1v3h-1v1h-1v1h-3v-1h-1v-1h-1v-3h1v-1h1z"/><path fill="#5E3D24" d="M3 3h3v3h-3z"/><path fill="#F4E7C6" d="M4 4h1v1h-1z"/></svg>'; }

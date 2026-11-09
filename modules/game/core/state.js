/* Forpharos : état d'une partie (un mois) et tout ce qui le fait évoluer.
   Fonctions pures autant que possible : elles reçoivent l'état et renvoient ce qui a changé (pour l'afficher). */
import { RES, START, STAT_RES, MAIN_SHARE, DAY_CAP, BUILDINGS, BUILD_MS, costFor, tributeFor, titoXpNeed,
  hordePower, villageDefense, lootFor, titoXpFor, PILLAGE } from "./rules.js";

export const VERSION = 1;
export const RODAGE = "2026-11";                    /* mois de rodage : pas de remise à zéro pendant ce mois */

/* ---------- dates (jour de Paris) ---------- */
const FMT = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });
export const parisDay = ms => FMT.format(new Date(ms));             /* "AAAA-MM-JJ" */
export const monthOf = day => day.slice(0, 7);
export const dayNum = day => +day.slice(8, 10);
export const daysInMonth = month => new Date(+month.slice(0, 4), +month.slice(5, 7), 0).getDate();
export function nextDay(day){ const d = new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10) + 1)); return d.toISOString().slice(0, 10); }
export function monthStartISO(month){ /* minuit à Paris le 1er du mois, en heure UTC (marge large : on refiltre ensuite par jour de Paris) */
  const d = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7) - 1, 1) - 3*3600e3); return d.toISOString(); }

/* jour de la horde : le jour du mois ; pendant le mois de rodage, on compte depuis l'ouverture du village (départ en cours de mois) */
export const hordeDay = (st, day) => st.month === RODAGE ? Math.max(1, dayNum(day) - dayNum(st.created) + 1) : dayNum(day);

export function newState(day, keep){
  const res = {}; RES.forEach(r => res[r] = START[r]);
  return {
    v: VERSION, rev: 0, month: monthOf(day), day, created: day,
    res, frac: { or: 0, bois: 0, pierre: 0, vivres: 0, eclats: 0 },
    bld: { hall: { lv: 1, job: null }, forge: { lv: 0, job: null } },
    tito: { lv: 1, xp: 0 },
    seen: {}, xpDays: {},
    fight: null,                      /* { day, win } : combat du jour déjà livré */
    reports: [],                      /* messages à montrer au prochain passage (nuits, tribut, récolte) */
    stats: { fights: 0, wins: 0 },
    keep: keep || null                /* rappel de la partie précédente (fin de mois) */
  };
}

/* ---------- ressources ---------- */
export function addRes(st, gains, sign){
  RES.forEach(r => { st.res[r] = Math.max(0, Math.round((st.res[r] + (sign || 1)*(gains[r] || 0))*100)/100); });
}
export const canPay = (st, cost) => RES.every(r => (st.res[r] || 0) >= (cost[r] || 0));

/* ---------- récolte de l'XP de My World ----------
   entries : [{ id, label, stat, xp, at }] lues dans users/{uid}/log (lecture seule).
   Une même ligne (même label) ne compte qu'une fois par jour ; 150 XP comptés au plus par jour ; une ressource récoltée n'est jamais reprise. */
export function harvest(st, entries){
  const gain = { or: 0, bois: 0, pierre: 0, vivres: 0, eclats: 0 }, detail = {};
  let counted = 0, skipped = 0;
  entries.slice().sort((a, b) => String(a.at).localeCompare(String(b.at))).forEach(e => {
    if (!e || !e.id || st.seen[e.id]) return;
    const ms = Date.parse(e.at); if (!isFinite(ms)) return;
    const day = parisDay(ms); if (monthOf(day) !== st.month) return;
    st.seen[e.id] = 1;
    const xp = Math.max(0, Math.round(+e.xp || 0)), main = STAT_RES[e.stat]; if (!xp || !main) return;
    const D = st.xpDays[day] || (st.xpDays[day] = { n: 0, raw: 0, labels: {} });
    D.raw += xp;
    const lab = String(e.label || "").trim().toLowerCase();
    if (lab && D.labels[lab]){ skipped += xp; return; }
    const room = Math.max(0, DAY_CAP - D.n), use = Math.min(room, xp);
    if (lab) D.labels[lab] = 1;
    if (!use){ skipped += xp; return; }
    D.n += use; counted += use; skipped += xp - use;
    RES.forEach(r => { const part = r === main ? MAIN_SHARE : (1 - MAIN_SHARE)/4; st.frac[r] += use*part; });
    detail[e.stat] = (detail[e.stat] || 0) + use;
  });
  RES.forEach(r => { const whole = Math.floor(st.frac[r] + 1e-9); if (whole > 0){ gain[r] += whole; st.frac[r] -= whole; } });
  addRes(st, gain);
  return { gain, counted, skipped, detail };
}
/* moyenne réelle d'XP comptés par jour depuis le début du mois (pour le mode test) */
export function xpAverage(st, today){
  const n = dayNum(today), days = Object.entries(st.xpDays).filter(([d]) => d <= today);
  const tot = days.reduce((s, [, D]) => s + D.n, 0), played = days.filter(([, D]) => D.n > 0).length;
  return { perDay: Math.round(tot/Math.max(1, n)), played, days: n, total: tot };
}

/* ---------- bâtiments ---------- */
export function canBuild(st, key){
  const b = BUILDINGS[key], s = st.bld[key], to = s.lv + 1;
  if (s.job) return { ok: false, why: "Chantier en cours" };
  if (Object.values(st.bld).some(x => x.job)) return { ok: false, why: "Un chantier à la fois" };
  if (to > b.max) return { ok: false, why: "Niveau maximum" };
  if (b.needHall && st.bld.hall.lv < b.needHall[to]) return { ok: false, why: "Hôtel de ville niv " + b.needHall[to] + " requis" };
  const cost = costFor(key, to);
  if (!canPay(st, cost)) return { ok: false, why: "Pas assez de ressources", cost };
  return { ok: true, cost, to };
}
export function startBuild(st, key, now){
  const c = canBuild(st, key); if (!c.ok) return c;
  addRes(st, c.cost, -1);
  st.bld[key].job = { to: c.to, start: now, dur: BUILD_MS };
  return c;
}
/* fait avancer les chantiers ; renvoie la liste des bâtiments terminés */
export function tickBuilds(st, now){
  const done = [];
  Object.keys(st.bld).forEach(k => { const s = st.bld[k]; if (s.job && now - s.job.start >= s.job.dur){ s.lv = s.job.to; s.job = null; done.push(k); } });
  return done;
}
export const jobProgress = (job, now) => job ? Math.max(0, Math.min(1, (now - job.start)/job.dur)) : 1;

/* ---------- Tito ---------- */
export function giveTitoXp(st, xp){
  const t = st.tito, ups = []; t.xp += xp;
  while (t.xp >= titoXpNeed(t.lv)){ t.xp -= titoXpNeed(t.lv); t.lv++; ups.push(t.lv); }
  return ups;
}

/* ---------- combat du jour ---------- */
export function applyFight(st, today, win, n){
  const d = hordeDay(st, today);
  st.fight = { day: today, win: !!win };
  st.stats.fights++; if (win) st.stats.wins++;
  if (win){ const loot = lootFor(d, n), xp = titoXpFor(d, n); addRes(st, loot); const ups = giveTitoXp(st, xp); return { loot, xp, ups }; }
  /* battu : la horde reviendra cette nuit contre les défenses du village (comme un jour sans combat) ; Tito apprend quand même un peu */
  st.fight.win = false; st.fight.night = true;
  const xp = Math.round(titoXpFor(d, n)*0.5), ups = giveTitoXp(st, xp);
  return { xp, ups };
}
export const foughtToday = (st, today) => !!(st.fight && st.fight.day === today);

/* ---------- passage des jours ----------
   Pour chaque nuit passée sans combat : horde résolue automatiquement (demi-butin si la défense tient, sinon pillage de 10 %).
   Chaque nouveau jour : tribut. Nouveau mois : nouveau village (sauf pendant le mois de rodage). Le jour n'avance qu'avec l'heure du serveur. */
export function advanceTo(st, today){
  const out = { nights: [], tribute: null, days: 0, newMonth: false };
  if (!today || today <= st.day) return out;
  if (monthOf(today) !== st.month){
    out.newMonth = true; out.prevMonth = st.month;
    return out;                                       /* l'appelant crée la nouvelle partie (et garde les trophées) */
  }
  const trib = { or: 0, bois: 0, pierre: 0, vivres: 0, eclats: 0 };
  let d = st.day;
  while (d < today){
    if (!foughtToday(st, d) || (st.fight && st.fight.day === d && st.fight.night)){
      const n = hordeDay(st, d), def = villageDefense(st.bld.hall.lv, st.tito.lv, st.bld.forge.lv), pow = hordePower(n);
      if (def >= pow){ const l = lootFor(n, 2), half = {}; Object.keys(l).forEach(r => half[r] = Math.floor(l[r]/2)); addRes(st, half); out.nights.push({ day: d, ok: true, gain: half, def, pow }); }
      else { const lost = {}; RES.forEach(r => lost[r] = Math.floor(st.res[r]*PILLAGE)); addRes(st, lost, -1); out.nights.push({ day: d, ok: false, lost, def, pow }); }
    }
    d = nextDay(d);
    const t = tributeFor(st.bld.hall.lv); RES.forEach(r => trib[r] += t[r]); out.days++;
  }
  addRes(st, trib); out.tribute = trib;
  st.day = today;
  return out;
}

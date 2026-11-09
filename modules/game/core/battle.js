/* Forpharos : moteur de combat au tour par tour avec jauge ATB, sans affichage.
   L'interface (ui/combat.js) l'interroge à chaque image et joue les animations ; il sert aussi aux simulations d'équilibrage.
   Mode « Attente » : le temps s'arrête quand c'est à Tito de choisir, ou pendant qu'une action est jouée. */
import { titoStats, SKILL, RATION, ELEM_MULT, damage } from "./rules.js";

export const ATB_RATE = 4;          /* une vitesse de 10 remplit la jauge en 2,5 s */

export function createBattle(o){
  const s = titoStats(o.titoLv, o.forgeLv), rnd = o.rnd || Math.random;
  const b = {
    rnd,
    tito: { hp: s.hp, hpMax: s.hp, mp: s.mp, mpMax: s.mp, atk: s.atk, def: s.def, spd: s.spd, atb: 55, guard: false },
    mons: o.horde.map(m => Object.assign({}, m, { atb: 10 + rnd()*40, alive: true })),
    rations: Math.min(RATION.perFight, Math.floor((o.vivres || 0)/RATION.cost)), rationsUsed: 0,
    over: null, turn: 0
  };
  return b;
}
export const alive = b => b.mons.filter(m => m.alive);
export function firstTarget(b, prefer){ const a = b.mons.map((m, i) => i).filter(i => b.mons[i].alive); return a.includes(prefer) ? prefer : (a[0] == null ? -1 : a[0]); }

/* fait couler le temps (secondes) ; renvoie qui doit agir, ou null */
export function tick(b, dt){
  if (b.over) return null;
  const t = b.tito;
  if (t.atb >= 100) return { who: "tito" };
  const ready = b.mons.findIndex(m => m.alive && m.atb >= 100); if (ready >= 0) return { who: ready };
  t.atb = Math.min(100, t.atb + t.spd*ATB_RATE*dt);
  b.mons.forEach(m => { if (m.alive) m.atb = Math.min(100, m.atb + m.spd*ATB_RATE*dt); });
  if (t.atb >= 100) return { who: "tito" };
  const r2 = b.mons.findIndex(m => m.alive && m.atb >= 100); return r2 >= 0 ? { who: r2 } : null;
}

function hitMon(b, i, mult, elem, canCrit){
  const m = b.mons[i], crit = canCrit && b.rnd() < 0.12, dmg = damage(b.tito.atk, m.def, mult*ELEM_MULT(elem, m.elem)*(crit ? 1.6 : 1), b.rnd);
  m.hp = Math.max(0, m.hp - dmg); const kill = m.hp <= 0; if (kill){ m.alive = false; m.atb = 0; }
  return { dmg, crit, kill, weak: ELEM_MULT(elem, m.elem) > 1 };
}
function endCheck(b){ if (!alive(b).length) b.over = "win"; else if (b.tito.hp <= 0) b.over = "lose"; }

/* action de Tito : "attack" | "skill" | "item" | "defend" */
export function canSkill(b){ return b.tito.mp >= SKILL.cost; }
export function canItem(b){ return b.rationsUsed < b.rations && b.tito.hp < b.tito.hpMax; }
export function titoAct(b, act, target){
  const t = b.tito; t.atb = 0; t.guard = false; b.turn++;
  let r = { act, target };
  if (act === "attack"){ r = Object.assign(r, hitMon(b, target, 1, "neutre", true)); t.mp = Math.min(t.mpMax, t.mp + 1); }
  else if (act === "skill"){ t.mp -= SKILL.cost; r = Object.assign(r, hitMon(b, target, SKILL.mult, SKILL.elem, false)); }
  else if (act === "item"){ const heal = Math.round(t.hpMax*RATION.heal); t.hp = Math.min(t.hpMax, t.hp + heal); b.rationsUsed++; r.heal = heal; }
  else if (act === "defend"){ t.guard = true; t.mp = Math.min(t.mpMax, t.mp + 4); t.atb = 35; }
  endCheck(b); return r;
}
/* action d'un monstre (toujours contre Tito pour l'instant) */
export function monAct(b, i){
  const m = b.mons[i], t = b.tito; m.atb = 0;
  if (m.lazy && b.rnd() < m.lazy){ const r = { who: i, skip: true, txt: m.lazyTxt }; return r; }   /* la Horde du Plus-Tard remet parfois son attaque à plus tard */
  const dmg = damage(m.atk, t.def, t.guard ? 0.5 : 1, b.rnd);
  t.hp = Math.max(0, t.hp - dmg);
  const r = { who: i, dmg, guarded: t.guard };
  endCheck(b); return r;
}
/* choix automatique (bouton Auto et simulations) */
export function autoChoice(b, prefer){
  const t = b.tito, tg = firstTarget(b, prefer), m = b.mons[tg];
  if (t.hp < t.hpMax*0.35 && canItem(b)) return { act: "item", target: tg };
  if (canSkill(b) && m && (m.elem === "ombre" || m.hp > t.atk*1.3)) return { act: "skill", target: tg };
  return { act: "attack", target: tg };
}
/* combat complet simulé (équilibrage) */
export function simulate(o){
  const b = createBattle(o); let guard = 0;
  while (!b.over && guard++ < 5000){ const n = tick(b, 0.05); if (!n) continue; if (n.who === "tito"){ const c = autoChoice(b); titoAct(b, c.act, c.target); } else monAct(b, n.who); }
  return { win: b.over === "win", hpLeft: b.tito.hp/b.tito.hpMax, rationsUsed: b.rationsUsed };
}

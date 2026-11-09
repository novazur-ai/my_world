/* Forpharos : règles du jeu (chiffres, tables, formules). Aucun accès au DOM ni à Firebase ici.
   Tout ce qui se règle (équilibrage) est regroupé dans ce fichier. */

export const RES = ["or", "bois", "pierre", "vivres", "eclats"];
export const RES_NAME = { or: "Or", bois: "Bois", pierre: "Pierre", vivres: "Vivres", eclats: "Éclats d'aube" };

/* XP de My World → ressources. Clés de caractéristiques de My World : sag, dex, force, con, cha, int. */
export const STAT_RES = { sag: "or", dex: "bois", force: "pierre", con: "vivres", cha: "vivres", int: "eclats" };
export const STAT_NAME = { sag: "Sagesse", dex: "Dextérité", force: "Force", con: "Constitution", cha: "Charisme", int: "Intelligence" };
export const MAIN_SHARE = 0.7;          /* 70 % vers la ressource de la caractéristique, 30 % répartis sur les 4 autres */
export const DAY_CAP = 150;             /* XP comptés au plus par jour */

/* ce que le village reçoit chaque jour, même sans XP (multiplié par le niveau de l'Hôtel de ville) */
export const TRIBUTE = { or: 12, bois: 8, pierre: 6, vivres: 10, eclats: 0 };
export const tributeFor = hallLv => { const k = 1 + 0.25*(Math.max(1, hallLv) - 1), o = {}; RES.forEach(r => o[r] = Math.round(TRIBUTE[r]*k)); return o; };

/* stock d'un village tout neuf */
export const START = { or: 60, bois: 45, pierre: 35, vivres: 40, eclats: 0 };

/* ---------- bâtiments (étape 1 : Hôtel de ville et Forge) ---------- */
export const BUILD_MS = 30000;           /* durée d'un chantier : 30 s d'animation */
export const BUILDINGS = {
  hall: {
    name: "Hôtel de ville", short: "Hôtel",
    desc: "Le cœur de Forpharos. Chaque niveau augmente le tribut du jour de 25 %.",
    base: { or: 70, bois: 50, pierre: 60, vivres: 0, eclats: 0 }, start: 1, max: 5,
    phases: ["Échafaudage", "Pierres de taille", "Colombages", "Toiture neuve", "Finitions"],
    effect: lv => "Tribut ×" + (1 + 0.25*(lv - 1)).toFixed(2).replace(".", ",")
  },
  forge: {
    name: "Forge", short: "Forge",
    desc: "Le forgeron affûte l'épée de Tito : plus de dégâts à chaque niveau.",
    base: { or: 45, bois: 40, pierre: 30, vivres: 0, eclats: 0 }, start: 0, max: 5, needHall: [0, 1, 2, 2, 3, 3],
    phases: ["Piquets et cordeau", "Fondations", "Murs et échafaudage", "Charpente", "Toiture et cheminée", "Forge prête"],
    effect: lv => lv ? "Attaque +" + forgeAtk(lv) : "Pas encore construite"
  }
};
export const forgeAtk = lv => lv <= 0 ? 0 : 4 + 3*(lv - 1);
/* coût pour passer au niveau `to` : ×1,6 par niveau */
export function costFor(key, to){
  const b = BUILDINGS[key], k = Math.pow(1.6, Math.max(0, to - 1 - (key === "hall" ? 1 : 0))), o = {};
  RES.forEach(r => o[r] = Math.round(b.base[r]*k));
  return o;
}

/* ---------- Tito ---------- */
export const titoXpNeed = lv => 30 + 25*lv;              /* XP de combat pour passer au niveau suivant */
export function titoStats(lv, forgeLv){
  return {
    hp: 70 + 14*(lv - 1),
    mp: 18 + 3*(lv - 1),
    atk: 11 + 2.5*(lv - 1) + forgeAtk(forgeLv),
    def: 4 + 1.2*(lv - 1),
    spd: 10 + 0.4*(lv - 1)
  };
}
export const SKILL = { name: "Éclat du Phare", cost: 6, mult: 1.6, elem: "lumiere" };
export const RATION = { cost: 5, heal: 0.3, perFight: 2 };   /* Objet : une ration coûte 5 Vivres et rend 30 % des PV */

/* ---------- monstres (Horde du Plus-Tard) ---------- */
export const MONSTERS = {
  lambin:      { name: "Lambin", elem: "ombre", hp: 34, atk: 8, def: 1, spd: 7, fly: false, from: 1, lazy: 0.3, lazyTxt: "remet à plus tard" },
  paperasseux: { name: "Paperasseux", elem: "ronce", hp: 48, atk: 7, def: 4, spd: 5, fly: false, from: 1, lazy: 0.2, lazyTxt: "se perd dans ses papiers" },
  feu:         { name: "Feu-de-Rancune", elem: "flamme", hp: 30, atk: 11, def: 2, spd: 9, fly: true, from: 4, lazy: 0.15, lazyTxt: "rumine sa rancune" }
};
/* puissance de la horde selon le jour du mois (semaine 1 : 60 %, 2 : 75 %, 3 : 85 %, J22-24 : 95 % de la puissance attendue) */
export const hordeFactor = d => d <= 7 ? 0.6 : d <= 14 ? 0.75 : d <= 21 ? 0.85 : 0.95;
/* Tito du joueur de référence (≈ 40 XP/jour, joue 70 % des jours) au jour d : sert d'étalon à la horde */
export const refTito = d => titoStats(1 + 0.33*(d - 1), Math.min(5, 1 + 0.14*(d - 1)));
export const HORDE_K = { hp: 1.3, atk: 1.3 };            /* réglage global de la difficulté */
export function hordeFor(day){
  const kinds = day < 4 ? ["lambin", "paperasseux"] : day < 9 ? ["lambin", "paperasseux", "feu"] : day % 2 ? ["lambin", "lambin", "feu"] : ["paperasseux", "lambin", "feu"];
  const r = refTito(day), r1 = refTito(1), f = hordeFactor(day)/0.6;
  const n = Math.sqrt(2/kinds.length), kh = r.atk/r1.atk*Math.sqrt(f)*n*HORDE_K.hp, ka = r.hp/r1.hp*Math.sqrt(f)*n*HORDE_K.atk;
  return kinds.map((k, i) => { const m = MONSTERS[k], hp = Math.round(m.hp*kh);
    return { kind: k, name: m.name, elem: m.elem, fly: m.fly, hp, hpMax: hp, atk: Math.round(m.atk*ka), def: Math.round(m.def*Math.sqrt(kh)), spd: m.spd, lazy: m.lazy, lazyTxt: m.lazyTxt, id: k + i }; });
}
export const hordePower = day => hordeFor(day).reduce((s, m) => s + m.hp*0.5 + m.atk*3, 0);
/* butin d'une victoire */
export function lootFor(day, n){
  const k = 1 + 0.05*(day - 1);
  return { or: Math.round((18 + 4*n)*k), bois: Math.round((10 + 3*n)*k), pierre: Math.round((8 + 3*n)*k), vivres: Math.round((8 + 2*n)*k), eclats: day >= 10 ? 1 : 0 };
}
export const titoXpFor = (day, n) => Math.round((14 + 3*day)*n/2);

/* ---------- nuit : horde sans combat ---------- */
export const PILLAGE = 0.10;
/* défense automatique du village (Hôtel de ville + Tito + Forge ; Remparts, garnison et Fanal viendront ensuite) */
export const villageDefense = (hallLv, titoLv, forgeLv) => 68 + 32*hallLv + 28*titoLv + 12*forgeLv;

/* ---------- dégâts ---------- */
export const ELEM_MULT = (atkElem, defElem) => {
  if (atkElem === "lumiere" && defElem === "ombre") return 1.5;
  const beats = { flamme: "ronce", ronce: "onde", onde: "flamme" };
  return beats[atkElem] === defElem ? 1.5 : beats[defElem] === atkElem ? 0.75 : 1;
};
export function damage(atk, def, mult, rnd){
  const r = 0.8 + 0.4*rnd();
  return Math.max(1, Math.round((atk*r - def*0.5)*(mult || 1)));
}

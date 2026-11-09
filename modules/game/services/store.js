/* Forpharos : accès aux données.
   - Réutilise l'instance Firebase de My World (même SDK 10.12.2) : getApp(), getFirestore(), getAuth(). app-firebase.js n'est pas modifié.
   - Lit l'XP dans users/{uid}/log en LECTURE SEULE : le jeu ne modifie jamais les données des tâches.
   - Écrit uniquement sous users/{uid}/game/… : clock (heure du serveur), state (partie du mois), debug (partie de test), meta (trophées).
   - Copie locale dans localStorage ; la version la plus récente (numéro de révision) l'emporte. */
const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
const LS = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || "null"); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } };

export async function openStore(opts){
  if (opts && opts.mock) return mockStore(opts.mock);
  const [A, F, Au] = await Promise.all([import(SDK + "firebase-app.js"), import(SDK + "firebase-firestore.js"), import(SDK + "firebase-auth.js")]);
  /* si le jeu est ouvert directement (#jeu) au démarrage, My World n'a peut-être pas encore initialisé Firebase ni la connexion : on attend */
  let app = null; for (let i = 0; i < 75 && !app; i++){ try { app = A.getApp(); } catch (e) { await new Promise(r => setTimeout(r, 200)); } }
  if (!app) throw new Error("Firebase absent");
  const fs = F.getFirestore(app), auth = Au.getAuth(app);
  const user = auth.currentUser || await new Promise(res => { const un = Au.onAuthStateChanged(auth, u => { if (u){ un(); res(u); } }); setTimeout(() => res(auth.currentUser), 15000); });
  if (!user) throw new Error("non connecté");
  const uid = user.uid, base = "users/" + uid, key = s => "mw-game-" + uid.slice(0, 8) + "-" + s;
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("délai")), ms))]);
  const timers = {};
  const store = {
    uid,
    /* heure du serveur (pas celle du téléphone) : on écrit un horodatage serveur puis on le relit depuis le serveur */
    async serverNow(){
      if (!navigator.onLine) return { ms: null, online: false };
      try {
        const ref = F.doc(fs, base + "/game/clock");
        await withTimeout(F.setDoc(ref, { t: F.serverTimestamp() }), 7000);
        const s = await withTimeout(F.getDocFromServer(ref), 7000), t = s.exists() && s.data().t;
        if (!t || !t.toMillis) return { ms: null, online: false };
        const ms = t.toMillis(); LS(key("offset"), { off: ms - Date.now(), at: ms }); return { ms, online: true };
      } catch (e) { return { ms: null, online: false, err: String(e && e.message || e) }; }
    },
    lastServer(){ return LS(key("offset")); },
    async readLog(fromISO){
      const q = F.query(F.collection(fs, base + "/log"), F.where("at", ">=", fromISO));
      const s = await F.getDocs(q);
      return s.docs.map(d => { const x = d.data(); return { id: d.id, label: x.label, stat: x.stat, xp: x.xp, at: x.at }; });
    },
    async load(slot){
      const local = LS(key(slot));
      let remote = null;
      try { const s = await withTimeout(F.getDoc(F.doc(fs, base + "/game/" + slot)), 8000); remote = s.exists() ? JSON.parse(s.data().json || "null") : null; } catch (e) { /* hors ligne : copie locale */ }
      if (local && (!remote || (local.rev || 0) > (remote.rev || 0))) return local;
      return remote;
    },
    /* enregistrement : tout de suite en local, puis dans Firestore (regroupé sur 1,2 s) */
    save(slot, state, now){
      state.rev = (state.rev || 0) + 1; state.savedAt = Date.now(); LS(key(slot), state);
      clearTimeout(timers[slot]);
      const write = () => F.setDoc(F.doc(fs, base + "/game/" + slot), { json: JSON.stringify(state), rev: state.rev, at: new Date().toISOString() }).catch(() => {});
      if (now) return write(); timers[slot] = setTimeout(write, 1200);
    },
    async remove(slot){ try { localStorage.removeItem(key(slot)); } catch (e) {} try { await F.deleteDoc(F.doc(fs, base + "/game/" + slot)); } catch (e) {} },
    flush(){ Object.keys(timers).forEach(k => clearTimeout(timers[k])); },
    pref(k, v){ return LS("mw-game-pref-" + k, v); }
  };
  return store;
}

/* magasin de test (page d'essai) : tout en mémoire, heure du serveur réglable */
function mockStore(m){
  const db = {}, logs = m.log || [];
  return {
    uid: "test", mock: true,
    async serverNow(){ return m.offline ? { ms: null, online: false } : { ms: m.now ? m.now() : Date.now(), online: true }; },
    lastServer(){ return null; },
    async readLog(fromISO){ return logs.filter(e => e.at >= fromISO); },
    async load(slot){ return db[slot] ? JSON.parse(db[slot]) : (m.state && m.state[slot]) || null; },
    save(slot, state){ state.rev = (state.rev || 0) + 1; db[slot] = JSON.stringify(state); },
    async remove(slot){ delete db[slot]; },
    flush(){},
    pref(k, v){ return LS("mw-game-pref-" + k, v); }
  };
}

"use strict";
// Surveillance en arrière-plan : amis, pseudos, présence, abonnés, demandes d'ami et profils suivis.
// Logique reprise de l'ancienne extension, sans aucune dépendance au navigateur.
const { EventEmitter } = require("events");
const { pool } = require("./roblox");

const MAX_HISTORY = 10000;
const CONCURRENCY = 3;
const BAN_LOOKUP_MAX = 8;
const GAMES_CAP = 24;
const COUNT_GAP = 10 * 60 * 1000;   // abonnés / abonnements : 2 requêtes par personne, inutile plus souvent
const REQ_GAP = 90 * 1000;          // demandes d'ami
const WATCH_GAP = 4 * 60 * 1000;    // liste d'amis d'un profil suivi : change rarement
const WATCH_PER_CYCLE = 3;          // au plus 3 profils vérifiés par passage (les autres au passage suivant)
const SERIES_CAP = 6000;
const SERIES_GAP = 30 * 60 * 1000; // un point au moins toutes les 30 min (la courbe se trace vite)

// ---------- Fonctions pures (testées) ----------
function diffMaps(oldMap, newMap) {
  const ids = Object.keys(newMap);
  return {
    added: ids.filter((id) => !(id in oldMap)),
    removed: Object.keys(oldMap).filter((id) => !(id in newMap)),
    // « renommé » seulement si on connaissait déjà un vrai nom (sinon on découvre juste un nom)
    renamed: ids.filter((id) => id in oldMap && oldMap[id] && newMap[id] && oldMap[id] !== newMap[id]),
    fill: ids.filter((id) => id in oldMap && !oldMap[id] && newMap[id])
  };
}

const catOf = (type) => (type === 2 ? "game" : type === 1 || type === 3 ? "on" : "off");

/**
 * Transition de présence d'un profil.
 * o = ancien état ({c:"on"|"off"|"game", off, place, pid, gs}), cur = présence actuelle ({type, place, pid}).
 * Renvoie le nouvel état et les événements. Il faut 2 vérifications « hors ligne » d'affilée (évite les faux positifs).
 */
function presenceTransition(o, cur, ts) {
  const cat = catOf(cur.type);
  const events = [];
  if (!o) return { next: cat === "game" ? { c: cat, off: 0, place: cur.place, pid: cur.pid, gs: ts } : { c: cat, off: 0 }, events }; // état de départ, sans événement
  let next;
  const leave = () => ({ type: "leftgame", place: o.place, pid: o.pid, dur: o.gs ? Math.round((ts - o.gs) / 1000) : undefined });
  if (cat === "off") {
    if (o.c === "off") next = { c: "off", off: 0 };
    else {
      const off = (o.off || 0) + 1;
      if (off >= 2) {
        next = { c: "off", off: 0 };
        if (o.c === "game") events.push(leave());
        events.push({ type: "offline" });
      } else next = { c: o.c, off, place: o.place, pid: o.pid, gs: o.gs };
    }
  } else {
    next = { c: cat, off: 0 };
    if (cat === "game") {
      const same = o.c === "game" && (!(o.pid || o.place) || (o.pid || o.place) === (cur.pid || cur.place));
      next.place = cur.place; next.pid = cur.pid; next.gs = same ? o.gs : ts;
      if (o.c === "game" && !same) events.push(leave());
      if (!same) events.push({ type: "ingame", place: cur.place, pid: cur.pid || undefined });
    } else {
      if (o.c === "game") events.push(leave());
      if (o.c === "off") events.push({ type: "online" });
    }
  }
  return { next, events };
}

function addGameTime(rec, place, dt, pid) {
  const key = pid || place;
  if (!key) return;
  const g = rec.g || (rec.g = {});
  const e = g[key] || (g[key] = { n: place, s: 0 });
  e.s += dt;
  if (place) e.n = place;
  const keys = Object.keys(g);
  if (keys.length > GAMES_CAP) {
    keys.sort((a, b) => g[a].s - g[b].s);
    for (const k of keys.slice(0, keys.length - GAMES_CAP)) delete g[k];
  }
}

const isLimited = (c, host) => (typeof c.isLimited === "function" ? c.isLimited(host) : !!c.limited);
const waitText = (sec) => { sec = Math.max(1, Math.round(sec)); return sec < 90 ? sec + " s" : Math.round(sec / 60) + " min"; };

// ---------- Moniteur ----------
class Monitor extends EventEmitter {
  constructor({ storage, accounts, notifier, logger, getSettings }) {
    super();
    this.storage = storage;
    this.accounts = accounts;
    this.notifier = notifier;
    this.log = logger;
    this.getSettings = getSettings;
    this.timer = null;
    this.running = false;
    this.live = {};               // présence en direct (mémoire seulement)
    this.lastRun = 0;
    this.error = null;
    this.state = storage.get("state", () => ({ accounts: {} }));
    this.watched = storage.get("watched", () => ({ profiles: {} }));
    this.history = storage.get("history", () => ({ entries: [] }));
    this.stats = storage.get("stats", () => ({ series: {}, counts: {}, pstats: { t: 0, d: {} } }));
    if (!this.stats.pstats) this.stats.pstats = { t: 0, d: {} };
    this.lastChecked = {};
    this.accounts.on("changed", () => { this.live = {}; this.error = null; this.emit("update"); this.kick(1500); });
  }

  // --- Planification ---
  start() { this.stop(); this.schedule(3000); }
  stop() { if (this.timer) { clearTimeout(this.timer); this.timer = null; } }
  kick(ms = 500) { this.stop(); this.schedule(ms); }
  schedule(ms) {
    const s = this.getSettings().monitoring;
    const wait = ms != null ? ms : Math.max(15, Number(s.intervalSec) || 60) * 1000;
    this.timer = setTimeout(async () => {
      try { await this.checkAll(); } catch (e) { this.log.error(e); }
      this.schedule();
    }, wait);
    if (this.timer.unref) this.timer.unref();
  }
  get paused() { return !this.getSettings().monitoring.enabled; }

  // --- État du compte actif ---
  accState(id) { return this.state.accounts[id] || (this.state.accounts[id] = { friends: null, presence: {}, requests: null, reqGone: {} }); }

  /** Mémorise un jeu joué / lancé (le plus récent d'abord, sans doublon, 20 max). */
  noteGame(accId, { pid, name, ts = Date.now() }) {
    pid = String(pid || "");
    if (!/^\d{1,19}$/.test(pid) || !accId) return;
    const st = this.accState(accId);
    const list = st.recentGames || (st.recentGames = []);
    let g = list.find((x) => x.pid === pid);
    if (!g) { g = { pid, name: "", last: ts }; list.push(g); }
    g.last = Math.max(g.last, ts);
    if (name) g.name = String(name).slice(0, 80);
    list.sort((a, b) => b.last - a.last);
    if (list.length > 20) list.length = 20;
    this.storage.dirty("state");
    if (!g.name) this.resolveGameName(accId, g);
  }

  async resolveGameName(accId, g) {
    try {
      const client = this.accounts.client(accId);
      if (!client || isLimited(client, "games.roblox.com") || g.looked) return;
      g.looked = true; // un seul essai par jeu
      const n = (await client.placeNames([g.pid]))[g.pid];
      if (n) { g.name = n; this.storage.dirty("state"); this.emit("update"); }
    } catch (_) {}
  }

  push(entries, accId) {
    if (!entries.length) return;
    for (const e of entries) if (accId && e.acc == null) e.acc = accId;
    this.history.entries.push(...entries);
    if (this.history.entries.length > MAX_HISTORY) this.history.entries.splice(0, this.history.entries.length - MAX_HISTORY);
    this.storage.dirty("history");
    this.emit("history", entries);
  }

  async checkAll({ force = false } = {}) {
    if (this.running) return { busy: true };
    if (this.paused && !force) return { paused: true };
    const acc = this.accounts.active();
    if (!acc) { this.error = "Aucun compte actif."; this.emit("update"); return { error: this.error }; }
    if (!acc.status || acc.status === "deconnecte" || acc.status === "expire") {
      this.error = acc.status === "expire" ? "Session expirée : reconnecte le compte." : "Compte déconnecté.";
      this.emit("update"); return { error: this.error };
    }
    const client = this.accounts.client(acc.id);
    this.running = true;
    const S = this.getSettings().monitoring;
    try {
      this.error = null;
      const st = this.accState(acc.id);
      const meName = acc.displayName && acc.displayName !== acc.name ? `${acc.displayName} (@${acc.name})` : acc.name;
      let friends = st.friends;
      let slow = null; // un 429 sur un service ne doit pas empêcher les autres étapes (présence, abonnés…)
      const step = async (fn) => { try { return await fn(); } catch (e) { if (e.status === 429 || e.backoff) { slow = slow || e; return undefined; } throw e; } };
      if (S.friends || S.presence || S.requests) { const r = await step(() => this.checkMe(acc, client, st, meName, S)); if (r) friends = r; }
      if (friends && (S.favorites || []).length) await step(() => this.migrateFavorites(client, friends, S));
      if (S.follows && !isLimited(client, "friends.roblox.com")) await step(() => this.checkCounts("me:" + acc.id, acc.id, meName, friends ? Object.keys(friends).length : null, client, acc.id));
      if (S.requests) await step(() => this.checkRequests(acc, client, st, meName, friends || {}));
      if (S.presence || this.hasWatchedStatus()) await step(() => this.checkPresence(acc, client, st, meName, friends || {}, S));
      await step(() => this.checkWatched(acc, client, S));
      if (slow) this.error = "Roblox demande de ralentir : Batblox reprend automatiquement dans " + waitText((client.waitSec && client.waitSec()) || slow.retryAfter || 60) + ".";
      this.lastRun = Date.now();
      st.lastCheck = this.lastRun;
      this.storage.dirty("state");
    } catch (e) {
      if (e.status === 401) { this.accounts.check(acc.id).catch(() => {}); this.error = "Session expirée : reconnecte le compte."; }
      else if (e.status === 429) this.error = "Roblox demande de ralentir : Batblox reprend automatiquement dans " + waitText(e.retryAfter || 60) + ".";
      else this.error = "Vérification impossible (" + (e.status || String(e.message || "réseau").replace(/^net::/, "").slice(0, 60)) + ") — voir Maintenance → Test de connexion.";
      this.log.warn("Vérification : " + (e.message || e));
    } finally {
      this.running = false;
      this.emit("update");
    }
    return { ok: !this.error };
  }

  async checkMe(acc, client, st, meName, S) {
    const current = await client.friends(acc.id);
    const first = !st.friends;
    if (!first && S.friends) {
      const d = diffMaps(st.friends, current);
      if (d.added.length || d.removed.length || d.renamed.length) {
        const entries = await this.buildEntries("me", acc.id, meName, st.friends, current, d, client, S);
        this.push(entries, acc.id);
        this.notifier.notify(entries);
      }
    }
    st.friends = current;
    return current;
  }

  async buildEntries(target, targetId, targetName, oldMap, newMap, d, client, S) {
    const ts = Date.now();
    const base = { ts, target, targetId: String(targetId), targetName };
    const states = {};
    if (d.removed.length) {
      await pool(d.removed.slice(0, BAN_LOOKUP_MAX), 4, async (id) => {
        try { const u = await client.userById(id); if (u.isBanned) states[id] = "banned"; }
        catch (e) { if (e.status === 404) states[id] = "deleted"; }
      });
    }
    const entries = [
      ...d.added.map((id) => Object.assign({}, base, { type: "added", friendId: id, friendName: newMap[id] })),
      ...d.removed.map((id) => { const e = Object.assign({}, base, { type: "removed", friendId: id, friendName: oldMap[id] }); if (states[id]) e.reason = states[id]; return e; })
    ];
    if (S.names) for (const id of d.renamed) entries.push(Object.assign({}, base, { type: "renamed", friendId: id, friendName: newMap[id], oldName: oldMap[id] }));
    const miss = entries.filter((e) => !e.friendName).map((e) => e.friendId);
    if (miss.length) { const n = await client.lookupNames(miss); for (const e of entries) if (!e.friendName && n[e.friendId]) e.friendName = n[e.friendId]; }
    return entries;
  }

  async checkCounts(key, userId, targetName, friendsCount, client, accId, wantCounts) {
    const S = this.getSettings().monitoring;
    if (wantCounts === undefined) wantCounts = S.follows;
    const now = Date.now();
    const ck = "c:" + key;
    const due = !!wantCounts && now - (this.lastChecked[ck] || 0) >= COUNT_GAP;
    let fo = null, fg = null;
    if (due) {
      this.lastChecked[ck] = now;
      try { const c = await client.counts(userId); fo = c.fo; fg = c.fg; } catch (e) { /* on garde quand même le point « amis » ci-dessous */ }
    }
    const prev = this.stats.counts[key] || {};
    const cur = { fo: fo != null ? fo : prev.fo, fg: fg != null ? fg : prev.fg };
    const mk = (type, from, to) => ({ ts: now, target: key.startsWith("me:") ? "me" : key, targetId: String(userId), targetName, type, friendId: "0", friendName: "", from, to });
    const entries = [];
    if (due && fo != null && prev.fo != null && fo !== prev.fo) entries.push(mk("followers", prev.fo, fo));
    if (due && fg != null && prev.fg != null && fg !== prev.fg) entries.push(mk("followings", prev.fg, fg));
    // Point de la courbe : toujours enregistré (même si les abonnés sont désactivés), dès la première vérification
    const known = friendsCount != null || cur.fo != null || cur.fg != null;
    const arr = this.stats.series[key] || (this.stats.series[key] = []);
    const last = arr[arr.length - 1];
    if (known && (!last || last.f !== friendsCount || last.fo !== cur.fo || last.fg !== cur.fg || now - last.t > SERIES_GAP)) {
      arr.push({ t: now, f: friendsCount, fo: cur.fo, fg: cur.fg });
      if (arr.length > SERIES_CAP) arr.splice(0, arr.length - SERIES_CAP);
      this.storage.dirty("stats", 30000);
    }
    this.stats.counts[key] = cur;
    if (entries.length) { this.push(entries, accId); this.notifier.notify(entries); }
  }

  async checkRequests(acc, client, st, meName, friends) {
    const now = Date.now();
    if (now - (this.lastChecked["req:" + acc.id] || 0) < REQ_GAP) return;
    this.lastChecked["req:" + acc.id] = now;
    let cur;
    try { cur = await client.requests(); } catch (e) { if (e.status === 429 || e.status === 401) throw e; return; }
    const old = st.requests;
    st.requests = cur;
    if (!old) return;
    const entries = [];
    const base = { ts: now, target: "me", targetId: acc.id, targetName: meName };
    for (const id of Object.keys(cur)) if (!(id in old)) entries.push(Object.assign({}, base, { type: "req_in", friendId: id, friendName: cur[id] }));
    for (const id of Object.keys(old)) {
      if (id in cur) continue;
      entries.push(Object.assign({}, base, { type: id in friends ? "req_accepted" : "req_gone", friendId: id, friendName: old[id] }));
    }
    if (entries.length) { this.push(entries, acc.id); this.notifier.notify(entries.filter((e) => e.type === "req_in")); }
  }

  hasWatchedStatus() { return Object.values(this.watched.profiles).some((w) => w.status && !w.paused); }

  /** Personnes suivies explicitement (profils suivis avec statut + amis 🔔) : leurs statistiques sont toujours collectées. */
  explicitTracked(S) {
    const set = new Set();
    for (const [id, w] of Object.entries(this.watched.profiles)) if (w.status && !w.paused) set.add(id);
    return set;
  }

  trackedPresenceIds(acc, friends, S) {
    let ids = S.presence ? Object.keys(friends) : [];
    if (S.presence && S.presenceMode !== "all") { const fav = new Set((S.favorites || []).map(String)); ids = ids.filter((id) => fav.has(id)); }
    for (const [id, w] of Object.entries(this.watched.profiles)) if (w.status && !w.paused && !ids.includes(id)) ids.push(id);
    return ids;
  }

  nameOf(id, friends) {
    if (friends[id]) return friends[id];
    const w = this.watched.profiles[id];
    return w ? w.name : id;
  }

  async checkPresence(acc, client, st, meName, friends, S) {
    const ids = this.trackedPresenceIds(acc, friends, S);
    const wantMe = S.showMyStatus;
    if (!ids.length && !wantMe) return;
    const all = ids.slice();
    if (wantMe && !all.includes(acc.id)) all.push(acc.id);
    const pres = await client.presence(all);
    Object.assign(this.live, pres);
    const mine = wantMe && pres[acc.id];
    if (mine && mine.type === 2 && mine.pid) this.noteGame(acc.id, { pid: mine.pid, name: mine.place });
    const ts = Date.now();
    const old = st.presence || {};
    const next = {};
    const entries = [];
    for (const id of ids) {
      const cur = pres[id];
      if (!cur) { if (old[id]) next[id] = old[id]; continue; }
      const r = presenceTransition(old[id], cur, ts);
      next[id] = r.next;
      for (const ev of r.events) {
        entries.push(Object.assign({ ts, target: "me", targetId: acc.id, targetName: meName, friendId: id, friendName: this.nameOf(id, friends), place: ev.place || undefined }, ev));
      }
      // Suivi de l'absence (dernier passage en ligne, début du suivi, dernière observation)
      const n = next[id];
      n.t = ts; n.f = (old[id] && old[id].f) || ts;
      if (cur.type !== 0) n.on = ts; else if (old[id] && old[id].on) n.on = old[id].on;
    }
    st.presence = next;
    if (entries.length) {
      this.push(entries, acc.id);
      const gameOnly = new Set((S.gameOnly || []).map(String));
      this.notifier.notify(entries.filter((e) => !(gameOnly.has(String(e.friendId)) && (e.type === "online" || e.type === "offline"))));
    }
    // Statistiques de présence : temps observé / en ligne par heure de la semaine (heure locale, lundi = 0)
    const explicit = this.explicitTracked(S);
    const statIds = S.presenceStats ? ids : ids.filter((id) => explicit.has(id));
    if (statIds.length) {
      const ps = this.stats.pstats;
      const gap = Math.max(5 * 60 * 1000, (Number(S.intervalSec) || 60) * 3000);
      const dt = ps.t && ts - ps.t <= gap ? Math.round((ts - ps.t) / 1000) : 0;
      if (dt > 0) {
        const d = new Date(ts);
        const bucket = ((d.getDay() + 6) % 7) * 24 + d.getHours();
        for (const id of statIds) {
          const cur = pres[id];
          if (!cur) continue;
          const rec = ps.d[id] || (ps.d[id] = { o: new Array(168).fill(0), s: new Array(168).fill(0) });
          rec.s[bucket] += dt;
          if (cur.type !== 0) rec.o[bucket] += dt;
          if (cur.type === 2 && cur.place) addGameTime(rec, cur.place, dt, cur.pid);
        }
      }
      ps.t = ts;
      this.storage.dirty("stats", 60000);
    }
  }

  async checkWatched(acc, authClient, S) {
    // Les profils suivis n'ont besoin que de données publiques : on les envoie par le client SANS session,
    // ce qui laisse respirer le compte (quota « amis » séparé, pause séparée).
    const client = (this.accounts.publicClient && this.accounts.publicClient(acc.id)) || authClient;
    const now = Date.now();
    const due = Object.entries(this.watched.profiles)
      .filter(([, w]) => !w.paused && (w.friends !== false || w.conn !== false))
      .filter(([id]) => now - (this.lastChecked["w:" + id] || 0) >= WATCH_GAP)
      .sort((a, b) => (this.lastChecked["w:" + a[0]] || 0) - (this.lastChecked["w:" + b[0]] || 0))
      .slice(0, WATCH_PER_CYCLE);
    if (!due.length) return;
    await pool(due, 1, async ([id, w]) => {
      const prevAt = this.lastChecked["w:" + id] || 0;
      this.lastChecked["w:" + id] = now;
      let err = null;
      if (/^Joueur \d+$/.test(w.name || "")) { // nom pas encore résolu (ajout pendant une pause de Roblox)
        try { const u = await client.userById(id); if (u && u.name) w.name = u.displayName && u.displayName !== u.name ? `${u.displayName} (@${u.name})` : u.name; } catch (_) {}
      }
      // 1) Liste d'amis (indépendante des abonnés : une liste privée ne bloque plus les courbes)
      if (w.friends !== false) {
        if (isLimited(client, "friends.roblox.com")) { this.lastChecked["w:" + id] = prevAt; return; } // pause en cours : au prochain passage
        try {
          const current = await client.friends(id);
          const first = !w.snapshot;
          if (!first) {
            const d = diffMaps(w.snapshot, current);
            if (d.added.length || d.removed.length || d.renamed.length) {
              const entries = await this.buildEntries(id, id, w.name, w.snapshot, current, d, client, S);
              this.push(entries, acc.id);
              this.notifier.notify(entries);
            }
          }
          w.snapshot = current;
        } catch (e) { err = e; }
      }
      w.error = err ? (err.status === 404 ? "Profil introuvable" : err.status === 429 ? "Trop de requêtes" : err.status === 403 ? "Liste d'amis privée" : "Erreur " + (err.status || "réseau")) : null;
      if (err && err.status === 429) { this.lastChecked["w:" + id] = prevAt; return; }
      // 2) Point de courbe + abonnés / abonnements (option « conn » du profil)
      try {
        const count = w.snapshot ? Object.keys(w.snapshot).length : null;
        await this.checkCounts(id, id, w.name, count, client, acc.id, w.conn !== false);
      } catch (_) {}
    });
    this.storage.dirty("watched");
  }

  /** Ancien « 🔔 ami suivi » : devient un profil suivi complet (une seule façon de suivre quelqu'un). */
  async migrateFavorites(client, friends, S) {
    const favs = (S.favorites || []).map(String);
    if (!favs.length) return;
    for (const id of favs) {
      if (this.watched.profiles[id]) continue;
      let label = friends[id] || id;
      try { const u = await client.userById(id); if (u && u.name) label = u.displayName && u.displayName !== u.name ? `${u.displayName} (@${u.name})` : u.name; } catch (_) {}
      this.watched.profiles[id] = { name: label, friends: true, status: true, conn: true, paused: false, addedAt: Date.now() };
    }
    this.storage.dirty("watched");
    S.favorites = [];
    this.emit("favorites-migrated");
    this.emit("update");
  }

  // --- Profils suivis ---
  async addWatched(query, opts = {}) {
    const client = this.accounts.activeClient();
    if (!client) throw new Error("Ajoute d'abord un compte.");
    const q = String(query || "").trim().replace(/^.*roblox\.com\/users\/(\d+).*$/i, "$1");
    if (!q) throw new Error("Saisis un pseudo ou un identifiant.");
    let id, name, displayName;
    const slowMsg = (e) => new Error("Roblox demande de ralentir : réessaie dans " + waitText(e.retryAfter || (client.waitSec && client.waitSec()) || 60) + ".");
    if (/^\d+$/.test(q)) {
      id = q;
      try { const u = await client.userById(q); id = String(u.id); name = u.name; displayName = u.displayName; }
      catch (e) {
        if (e.status === 404 || e.status === 400) throw new Error("Aucun joueur avec cet identifiant.");
        if (!(e.status === 429 || e.backoff)) throw e;
        name = "Joueur " + q; // Roblox ralentit : on ajoute quand même, le nom sera résolu au prochain passage
      }
    } else {
      try { const u = await client.findByUsername(q); if (!u) throw new Error("Aucun joueur nommé « " + q + " »."); id = u.id; name = u.name; displayName = u.displayName; }
      catch (e) { if (e.status === 429 || e.backoff) throw slowMsg(e); throw e; }
    }
    const label = displayName && displayName !== name ? `${displayName} (@${name})` : name;
    const prev = this.watched.profiles[id] || {};
    this.watched.profiles[id] = Object.assign({ name: label, friends: true, status: false, conn: true, paused: false, addedAt: Date.now() }, prev, opts, { name: label });
    this.storage.dirty("watched");
    this.emit("update");
    this.kick(2000);
    return Object.assign({ id }, this.watched.profiles[id]);
  }
  updateWatched(id, patch) {
    const w = this.watched.profiles[id];
    if (!w) throw new Error("Profil introuvable.");
    for (const k of ["friends", "status", "conn", "paused"]) if (patch[k] !== undefined) w[k] = !!patch[k];
    this.storage.dirty("watched"); this.emit("update");
    if (patch.paused === false) this.kick(800);
    return w;
  }
  removeWatched(id) { delete this.watched.profiles[id]; this.storage.dirty("watched"); this.emit("update"); }

  // --- Lecture pour l'interface ---
  friendsView() {
    const acc = this.accounts.active();
    if (!acc) return [];
    const st = this.accState(acc.id);
    const S = this.getSettings().monitoring;
    const fav = new Set((S.favorites || []).map(String));
    return Object.entries(st.friends || {}).map(([id, name]) => {
      const p = (st.presence || {})[id];
      const l = this.live[id];
      let status = "inconnu";
      if (l) status = l.type === 2 ? "jeu" : l.type === 3 ? "studio" : l.type === 1 ? "en_ligne" : "hors_ligne";
      else if (p) status = p.c === "game" ? "jeu" : p.c === "on" ? "en_ligne" : "hors_ligne";
      return { id, name, tracked: !!this.watched.profiles[id], status, place: l ? l.place : (p && p.place) || "", pid: l ? String(l.pid || "") : String((p && p.pid) || ""), lastOn: p && p.on || null, canJoin: !!(l && l.type === 2) };
    });
  }

  snapshot() {
    const acc = this.accounts.active();
    const st = acc ? this.accState(acc.id) : null;
    const cnt = acc ? this.stats.counts["me:" + acc.id] || {} : {};
    const mine = acc ? this.live[acc.id] : null;
    const entries = this.history.entries;
    const recent = [];
    for (let i = entries.length - 1; i >= 0 && recent.length < 8; i--) { const e = entries[i]; if (!e.acc || !acc || e.acc === acc.id) recent.push(e); }
    return {
      running: this.running, paused: this.paused, lastRun: this.lastRun, error: this.error,
      friends: st && st.friends ? Object.keys(st.friends).length : null,
      followers: cnt.fo != null ? cnt.fo : null, following: cnt.fg != null ? cnt.fg : null,
      requests: st && st.requests ? Object.keys(st.requests).length : null,
      watched: Object.keys(this.watched.profiles).length,
      me: mine ? { status: mine.type === 2 ? "jeu" : mine.type === 3 ? "studio" : mine.type === 1 ? "en_ligne" : "hors_ligne", place: mine.place, pid: mine.pid, pl: mine.pl } : null,
      recent,
      recentGames: st && st.recentGames ? st.recentGames.slice(0, 12).map((g) => ({ pid: g.pid, name: g.name, last: g.last })) : []
    };
  }

  idleFriends() {
    const acc = this.accounts.active();
    const S = this.getSettings().monitoring;
    if (!acc || S.presenceMode === "all") return [];
    const st = this.accState(acc.id);
    const limit = (Number(S.idleDays) || 30) * 86400000;
    const now = Date.now();
    const out = [];
    for (const [id, w] of Object.entries(this.watched.profiles)) {
      if (!w.status || w.paused) continue;
      const p = (st.presence || {})[id];
      if (!p || !p.f) continue;
      const ref = p.on || p.f;
      if (now - ref >= limit && now - p.f >= limit) out.push({ id, name: w.name || (st.friends || {})[id] || id, days: Math.floor((now - ref) / 86400000) });
    }
    return out;
  }

  clearAll() {
    this.history.entries = []; this.storage.dirty("history");
  }
}

module.exports = { Monitor, diffMaps, presenceTransition, addGameTime, catOf, MAX_HISTORY };

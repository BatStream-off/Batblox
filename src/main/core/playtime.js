"use strict";
// Temps de jeu du compte actif, calculé à partir de son propre statut Roblox (déjà lu à chaque vérification du monitoring).
// Rien n'est demandé en plus à Roblox. Précision : l'intervalle de vérification (60 s par défaut).
// Stockage « playtime » : { acc: { <idCompte>: { days: { "AAAA-MM-JJ": { s: secondes, g: { <jeu>: { n: nom, s: secondes } } } }, limitDay } } }
const { EventEmitter } = require("events");

const KEEP_DAYS = 120;
const GAMES_PER_DAY = 30;

/** Jour local au format AAAA-MM-JJ. */
function dayKey(ts) {
  const d = new Date(ts);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

/** Ajoute `sec` secondes au jour et au jeu indiqués (fonction pure sur l'objet `days`). */
function addTime(days, key, game, sec) {
  if (!(sec > 0)) return;
  const d = days[key] || (days[key] = { s: 0, g: {} });
  d.s += sec;
  const id = game && (game.pid || game.name);
  if (!id) return;
  const e = d.g[id] || (d.g[id] = { n: game.name || "", s: 0 });
  e.s += sec;
  if (game.name) e.n = game.name;
  const ids = Object.keys(d.g);
  if (ids.length > GAMES_PER_DAY) { ids.sort((a, b) => d.g[a].s - d.g[b].s); for (const k of ids.slice(0, ids.length - GAMES_PER_DAY)) delete d.g[k]; }
}

/**
 * Répartit une durée [from, to] sur les jours qu'elle traverse (une partie qui passe minuit compte pour les deux jours).
 * Renvoie [[jour, secondes], …].
 */
function splitByDay(from, to) {
  const out = [];
  let a = from;
  while (a < to) {
    const d = new Date(a); d.setHours(24, 0, 0, 0);
    const b = Math.min(to, d.getTime());
    out.push([dayKey(a), Math.round((b - a) / 1000)]);
    a = b;
  }
  return out.filter(([, s]) => s > 0);
}

function pruneDays(days, now, keep = KEEP_DAYS) {
  const limit = dayKey(now - keep * 86400000);
  for (const k of Object.keys(days)) if (k < limit) delete days[k];
}

class PlayTime extends EventEmitter {
  /** getSettings() : réglages ; storage : Storage ; maxGapMs() : écart maximal compté entre deux vérifications. */
  constructor({ storage, getSettings, logger, maxGapMs }) {
    super();
    this.storage = storage;
    this.getSettings = getSettings;
    this.log = logger || { info() {}, warn() {}, error() {} };
    this.maxGapMs = maxGapMs || (() => Math.max(180, 2.5 * (Number(getSettings().monitoring.intervalSec) || 60)) * 1000);
    this.data = storage.get("playtime", () => ({ acc: {} }));
    if (!this.data.acc) this.data.acc = {};
    this.cur = null; // { acc, pid, name, last } : partie en cours (mémoire seulement)
  }

  rec(accId) { return this.data.acc[accId] || (this.data.acc[accId] = { days: {} }); }
  get playing() { return !!this.cur; }

  /**
   * Appelé à chaque lecture du statut du compte actif.
   * presence : { type, place, pid } (type 2 = en jeu) ou null si inconnu. ts : horodatage de la lecture.
   */
  update(accId, presence, ts = Date.now()) {
    const inGame = !!(presence && presence.type === 2);
    const cur = this.cur;
    if (cur && cur.acc === accId) {
      const gap = ts - cur.last;
      // Écart trop grand (PC en veille, réseau coupé) : on ne compte que l'écart maximal, jamais des heures fantômes.
      const from = gap > this.maxGapMs() ? ts - this.maxGapMs() : cur.last;
      const days = this.rec(accId).days;
      for (const [k, s] of splitByDay(from, ts)) addTime(days, k, cur, s);
      this.storage.dirty("playtime");
    } else if (cur && cur.acc !== accId) this.stop(); // changement de compte

    if (inGame) {
      const was = this.cur;
      this.cur = { acc: accId, pid: presence.pid ? String(presence.pid) : "", name: presence.place || "", last: ts };
      if (!was) this.emit("start", this.cur);
      this.checkLimit(accId, ts);
    } else if (this.cur) this.stop();
  }

  stop() {
    if (!this.cur) return;
    const was = this.cur;
    this.cur = null;
    this.emit("stop", was);
  }

  checkLimit(accId, ts) {
    const lim = Number(this.getSettings().playtime.dailyLimitMin) || 0;
    if (lim <= 0) return;
    const r = this.rec(accId), k = dayKey(ts), d = r.days[k];
    if (!d || d.s < lim * 60 || r.limitDay === k) return;
    r.limitDay = k;
    this.storage.dirty("playtime");
    this.emit("limit", { minutes: lim, played: d.s });
  }

  today(accId, now = Date.now()) { const d = this.rec(accId).days[dayKey(now)]; return d ? d.s : 0; }

  /** Résumé pour l'interface : aujourd'hui, les 14 derniers jours, les jeux les plus joués sur 30 jours. */
  summary(accId, now = Date.now()) {
    const days = this.rec(accId).days;
    pruneDays(days, now);
    const series = [];
    for (let i = 13; i >= 0; i--) { const k = dayKey(now - i * 86400000); series.push({ day: k, s: days[k] ? days[k].s : 0 }); }
    const top = {};
    for (let i = 0; i < 30; i++) {
      const d = days[dayKey(now - i * 86400000)]; if (!d) continue;
      for (const [id, g] of Object.entries(d.g)) { const t = top[id] || (top[id] = { id, name: g.n || "", s: 0 }); t.s += g.s; if (g.n) t.name = g.n; }
    }
    const t = days[dayKey(now)] || { s: 0, g: {} };
    const sum = (n) => series.slice(-n).reduce((a, x) => a + x.s, 0);
    return {
      today: t.s,
      todayGames: Object.entries(t.g).map(([id, g]) => ({ id, name: g.n || "", s: g.s })).sort((a, b) => b.s - a.s),
      week: sum(7), prevWeek: series.slice(0, 7).reduce((a, x) => a + x.s, 0),
      series,
      top: Object.values(top).sort((a, b) => b.s - a.s).slice(0, 8),
      playing: this.cur && this.cur.acc === accId ? { name: this.cur.name, pid: this.cur.pid } : null,
      limitMin: Number(this.getSettings().playtime.dailyLimitMin) || 0
    };
  }

  clear(accId) { if (accId) delete this.data.acc[accId]; else this.data.acc = {}; this.storage.dirty("playtime"); }
}

module.exports = { PlayTime, dayKey, addTime, splitByDay, pruneDays };

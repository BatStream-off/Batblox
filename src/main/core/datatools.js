"use strict";
// Export / import des données, import de la sauvegarde de l'ancienne extension, export CSV.
const { HISTORY_TYPES, DEFAULT_SETTINGS, merge, isObj } = require("./defaults");

const APP_ID = "batblox";
const EXT_APP_ID = "roblox-friends-notifier";
const COUNT_TYPES = new Set(["followers", "followings"]);
const TYPES = new Set(HISTORY_TYPES);

function cleanHistory(arr, fallbackAcc) {
  return (Array.isArray(arr) ? arr : [])
    .filter((h) => h && typeof h.ts === "number" && TYPES.has(h.type) && h.target != null && (h.friendId != null || COUNT_TYPES.has(h.type)) && (typeof h.friendName === "string" || h.friendName == null))
    .map((h) => {
      const o = { ts: h.ts, target: String(h.target), targetId: h.targetId != null ? String(h.targetId) : String(h.target), targetName: String(h.targetName || ""), type: h.type, friendId: h.friendId != null ? String(h.friendId) : "0", friendName: h.friendName || "" };
      if (h.acc != null) o.acc = String(h.acc);
      else if (o.target === "me") o.acc = /^\d+$/.test(o.targetId) ? o.targetId : fallbackAcc;
      for (const k of ["oldName", "reason", "place"]) if (h[k]) o[k] = String(h[k]);
      if (h.pid && /^\d+$/.test(String(h.pid))) o.pid = String(h.pid);
      for (const k of ["dur", "since", "from", "to"]) if (typeof h[k] === "number") o[k] = h[k];
      return o;
    });
}

function cleanWatched(obj) {
  const out = {};
  if (!isObj(obj)) return out;
  for (const [id, w] of Object.entries(obj)) {
    if (/^\d+$/.test(id) && w && typeof w.name === "string") {
      out[id] = { name: w.name, friends: w.friends === false ? false : true, status: !!w.status, conn: w.conn !== false, paused: !!w.paused, snapshot: isObj(w.snapshot) ? w.snapshot : (isObj(w.friends) ? w.friends : null), addedAt: w.addedAt || Date.now() };
    }
  }
  return out;
}

// Les adresses de webhook et les sujets ntfy donnent accès à des canaux : ils ne sont jamais exportés.
function safeSettings(settings) {
  const s = JSON.parse(JSON.stringify(settings));
  s.notifications.discord.url = "";
  s.notifications.ntfy.topic = "";
  return s;
}

class DataTools {
  constructor({ storage, monitor, accounts, getSettings, setSettings, logger }) {
    Object.assign(this, { storage, monitor, accounts, getSettings, setSettings, log: logger });
  }

  exportAll() {
    const m = this.monitor;
    return {
      app: APP_ID, version: 1, exportedAt: new Date().toISOString(),
      note: "Cette sauvegarde ne contient aucune information de connexion Roblox.",
      data: { history: m.history.entries, watched: m.watched.profiles, stats: m.stats, settings: safeSettings(this.getSettings()) }
    };
  }

  /** mode : "merge" (fusionner) ou "replace" (tout remplacer). Accepte une sauvegarde Batblox ou celle de l'ancienne extension. */
  importData(json, mode) {
    if (!isObj(json) || !isObj(json.data)) throw new Error("Ce fichier n'est pas une sauvegarde valide.");
    const accId = this.accounts.activeId();
    let history, watched, stats, settings;
    if (json.app === APP_ID) {
      history = cleanHistory(json.data.history, accId);
      watched = cleanWatched(json.data.watched);
      stats = isObj(json.data.stats) ? json.data.stats : null;
      settings = isObj(json.data.settings) ? json.data.settings : null;
    } else if (json.app === EXT_APP_ID) {
      const d = json.data;
      history = cleanHistory(d.history, accId);
      watched = cleanWatched(d.watched);
      const remap = (o) => { const r = {}; if (isObj(o)) for (const [k, v] of Object.entries(o)) r[k === "me" ? "me:" + (d.userId != null ? String(d.userId) : accId || "0") : k] = v; return r; };
      stats = { series: remap(d.series), counts: remap(d.counts), pstats: isObj(d.pstats) && isObj(d.pstats.d) ? d.pstats : { t: 0, d: {} } };
      settings = null; // les réglages de l'extension ne sont pas repris : Batblox a les siens
    } else throw new Error("Ce fichier n'est pas une sauvegarde Batblox ni une sauvegarde de l'ancienne extension.");

    const m = this.monitor;
    if (mode === "replace") {
      m.history.entries = history.slice(-10000);
      m.watched.profiles = watched;
      if (stats) { m.stats.series = stats.series || {}; m.stats.counts = stats.counts || {}; m.stats.pstats = stats.pstats || { t: 0, d: {} }; }
    } else {
      const seen = new Set();
      const key = (h) => `${h.ts}|${h.target}|${h.friendId}|${h.type}`;
      m.history.entries = [...m.history.entries, ...history].filter((h) => (seen.has(key(h)) ? false : seen.add(key(h)))).sort((a, b) => a.ts - b.ts).slice(-10000);
      m.watched.profiles = Object.assign({}, watched, m.watched.profiles);
      if (stats) {
        for (const [k, v] of Object.entries(stats.series || {})) if (!m.stats.series[k]) m.stats.series[k] = v;
        for (const [k, v] of Object.entries(stats.counts || {})) if (!m.stats.counts[k]) m.stats.counts[k] = v;
        if (stats.pstats && isObj(stats.pstats.d)) {
          for (const [k, v] of Object.entries(stats.pstats.d)) if (!m.stats.pstats.d[k]) m.stats.pstats.d[k] = v;
        }
      }
    }
    if (settings && json.app === APP_ID) {
      const cur = this.getSettings();
      const next = merge(DEFAULT_SETTINGS, settings);
      next.notifications.discord.url = cur.notifications.discord.url;
      next.notifications.ntfy.topic = cur.notifications.ntfy.topic;
      this.setSettings(next);
    }
    for (const n of ["history", "watched", "stats"]) this.storage.dirty(n);
    m.emit("update");
    return { history: m.history.entries.length, watched: Object.keys(m.watched.profiles).length, source: json.app === EXT_APP_ID ? "extension" : "batblox" };
  }

  historyCsv() {
    const esc = (v) => { const s = v == null ? "" : String(v); return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const rows = [["Date", "Cible", "Type", "Joueur", "Ancien pseudo", "Détail"].join(";")];
    const label = { added: "Ajout", removed: "Retrait", renamed: "Pseudo", online: "Connexion", offline: "Déconnexion", ingame: "Jeu lancé", leftgame: "Jeu quitté", req_in: "Demande reçue", req_accepted: "Demande acceptée", req_gone: "Demande disparue", followers: "Abonnés", followings: "Abonnements" };
    for (const e of this.monitor.history.entries) {
      const detail = e.type === "followers" || e.type === "followings" ? `${e.from} → ${e.to}` : (e.place || e.reason || (e.dur != null ? e.dur + " s" : ""));
      rows.push([new Date(e.ts).toISOString().replace("T", " ").slice(0, 19), e.targetName, label[e.type] || e.type, e.friendName, e.oldName || "", detail].map(esc).join(";"));
    }
    return "\ufeff" + rows.join("\r\n");
  }

  clearHistory() { this.monitor.clearAll(); this.monitor.emit("update"); }

  clearPresenceStats() { this.monitor.stats.pstats = { t: 0, d: {} }; this.storage.dirty("stats"); this.monitor.emit("update"); }

  resetAll() {
    const m = this.monitor;
    m.history.entries = []; m.watched.profiles = {}; m.stats.series = {}; m.stats.counts = {}; m.stats.pstats = { t: 0, d: {} };
    m.state.accounts = {};
    this.setSettings(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)));
    for (const n of ["history", "watched", "stats", "state"]) this.storage.dirty(n);
    m.emit("update");
  }
}

module.exports = { DataTools, cleanHistory, cleanWatched, safeSettings, APP_ID, EXT_APP_ID };

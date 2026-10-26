"use strict";
// Notes et groupes d'amis (données locales, jamais envoyées nulle part).
// Stockage « people » : { notes: { <idAmi>: "texte" }, groups: [{ id, name, color, conn, mute }], members: { <idAmi>: [<idGroupe>…] } }
//  - conn : les connexions / déconnexions des membres sont notifiées même quand « seulement mes groupes » est activé ;
//  - mute : aucune notification pour les membres de ce groupe (l'historique continue).
const crypto = require("crypto");

const NOTE_MAX = 500;
const GROUP_MAX = 12;
const NAME_MAX = 24;
const COLORS = ["bleu", "vert", "orange", "rose", "violet", "cyan", "jaune", "gris"];
const DEFAULT_GROUPS = [
  { name: "Proches", color: "rose", conn: true, mute: false },
  { name: "École", color: "bleu", conn: false, mute: false }
];

const clean = (s, max) => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b-\u001f]/g, "").trim().slice(0, max);
const newId = () => crypto.randomBytes(4).toString("hex");

function cleanGroups(list) {
  const out = [], seenId = new Set(), seenName = new Set();
  for (const g of Array.isArray(list) ? list : []) {
    if (!g) continue;
    const name = clean(g.name, NAME_MAX);
    if (!name || seenName.has(name.toLowerCase())) continue;
    let id = /^[a-f0-9]{8}$/.test(String(g.id)) ? String(g.id) : newId();
    while (seenId.has(id)) id = newId();
    seenId.add(id); seenName.add(name.toLowerCase());
    out.push({ id, name, color: COLORS.includes(g.color) ? g.color : COLORS[out.length % COLORS.length], conn: g.conn !== false, mute: !!g.mute });
    if (out.length >= GROUP_MAX) break;
  }
  return out;
}

/**
 * Faut-il notifier cet événement ? (fonction pure, testée)
 * Groupe en sourdine → non. « Connexions seulement pour mes groupes » → les connexions / déconnexions ne passent
 * que pour les membres d'un groupe dont « conn » est actif. Tout le reste passe.
 */
/**
 * Alertes « prévenir à la prochaine connexion » touchées par ces événements (fonction pure, testée).
 * alerts : { <idAmi>: { since, wasOn } } — wasOn = l'ami était déjà en ligne quand l'alerte a été posée :
 * on attend alors une vraie reconnexion (« online »), et un simple lancement de jeu ne compte pas.
 */
function alertHits(alerts, entries) {
  const out = [], seen = new Set();
  for (const e of entries || []) {
    const id = e && e.friendId != null ? String(e.friendId) : null;
    if (!id || seen.has(id) || !alerts || !alerts[id]) continue;
    if (e.type === "online" || (e.type === "ingame" && !alerts[id].wasOn)) { seen.add(id); out.push(e); }
  }
  return out;
}

function allowEntry(e, data, groupConnOnly) {
  if (!e || e.friendId == null) return true;
  const ids = (data.members && data.members[String(e.friendId)]) || [];
  const gs = (data.groups || []).filter((g) => ids.includes(g.id));
  if (gs.some((g) => g.mute)) return false;
  if (groupConnOnly && (e.type === "online" || e.type === "offline")) return gs.some((g) => g.conn);
  return true;
}

class People {
  constructor({ storage, lang }) {
    this.storage = storage;
    this.lang = lang || (() => "fr");
    this.data = storage.get("people", () => ({ notes: {}, groups: cleanGroups(this.defaults()), members: {} }));
    if (!this.data.notes) this.data.notes = {};
    if (!this.data.members) this.data.members = {};
    if (!this.data.alerts) this.data.alerts = {};
    this.data.groups = cleanGroups(this.data.groups);
  }
  save() { this.storage.dirty("people"); }
  defaults() { return this.lang() === "en" ? [{ name: "Close friends", color: "rose", conn: true, mute: false }, { name: "School", color: "bleu", conn: false, mute: false }] : DEFAULT_GROUPS; }
  get() { return JSON.parse(JSON.stringify(this.data)); }

  setNote(id, text) {
    id = String(id); if (!/^\d{1,19}$/.test(id)) throw new Error("Ami inconnu.");
    const t = clean(text, NOTE_MAX);
    if (t) this.data.notes[id] = t; else delete this.data.notes[id];
    this.save();
    return t;
  }

  setMembers(id, groupIds) {
    id = String(id); if (!/^\d{1,19}$/.test(id)) throw new Error("Ami inconnu.");
    const valid = new Set(this.data.groups.map((g) => g.id));
    const ids = [...new Set((Array.isArray(groupIds) ? groupIds : []).map(String).filter((g) => valid.has(g)))];
    if (ids.length) this.data.members[id] = ids; else delete this.data.members[id];
    this.save();
    return ids;
  }

  /** Remplace la liste des groupes ; les membres des groupes supprimés sont détachés. */
  setGroups(list) {
    this.data.groups = cleanGroups(list);
    const valid = new Set(this.data.groups.map((g) => g.id));
    for (const [id, gs] of Object.entries(this.data.members)) {
      const keep = gs.filter((g) => valid.has(g));
      if (keep.length) this.data.members[id] = keep; else delete this.data.members[id];
    }
    this.save();
    return this.data.groups;
  }

  allow(e, groupConnOnly) { return allowEntry(e, this.data, groupConnOnly); }

  /** Prévenir à la prochaine connexion (alerte unique). wasOn : l'ami est-il déjà en ligne maintenant ? */
  setAlert(id, on, wasOn) {
    id = String(id); if (!/^\d{1,19}$/.test(id)) throw new Error("Ami inconnu.");
    if (on) { if (Object.keys(this.data.alerts).length >= 50 && !this.data.alerts[id]) throw new Error("50 alertes au maximum."); this.data.alerts[id] = { since: Date.now(), wasOn: !!wasOn }; }
    else delete this.data.alerts[id];
    this.save();
    return !!on;
  }
  alertIds() { return Object.keys(this.data.alerts); }
  /** Renvoie les événements qui déclenchent une alerte et retire ces alertes (elles ne servent qu'une fois). */
  takeAlerts(entries) {
    const hits = alertHits(this.data.alerts, entries);
    for (const e of hits) delete this.data.alerts[String(e.friendId)];
    if (hits.length) this.save();
    return hits;
  }
  clear() { this.data = { notes: {}, groups: cleanGroups(this.defaults()), members: {}, alerts: {} }; this.storage.set("people", this.data); }
}

module.exports = { People, allowEntry, alertHits, cleanGroups, COLORS, NOTE_MAX };

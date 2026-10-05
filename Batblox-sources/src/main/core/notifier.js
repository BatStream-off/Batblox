"use strict";
// Notifications : Windows, Discord (webhook) et ntfy. Jamais aucun secret Roblox dans les messages.
const { DISCORD_RE, NTFY_TOPIC_RE } = require("./defaults");

const GROUP_LIMIT = 5;
const COLORS = { added: 0x2ecc71, removed: 0xe74c3c, renamed: 0xf1c40f, online: 0x2ecc71, offline: 0x95a5a6, ingame: 0x3498db, req_in: 0x9b59b6, followers: 0x1abc9c, followings: 0x1abc9c };

function describe(e) {
  const who = e.friendName || ("Joueur " + e.friendId);
  const owner = e.target && e.target !== "me" ? ` (chez ${e.targetName})` : "";
  switch (e.type) {
    case "added": return { icon: "➕", title: "Nouvel ami", text: e.target === "me" ? `${who} est maintenant dans ta liste d'amis.` : `${who} est un nouvel ami de ${e.targetName}.` };
    case "removed": {
      const why = e.reason === "banned" ? " Son compte est banni." : e.reason === "deleted" ? " Son compte a été supprimé." : "";
      return { icon: "➖", title: "Ami retiré", text: (e.target === "me" ? `${who} n'est plus dans ta liste d'amis.` : `${who} n'est plus ami avec ${e.targetName}.`) + why };
    }
    case "renamed": return { icon: "✏️", title: "Changement de pseudo", text: `${e.oldName || "Un joueur"} s'appelle maintenant ${who}.${owner}` };
    case "online": return { icon: "🟢", title: "Connexion", text: `${who} vient de se connecter.` };
    case "offline": return { icon: "⚪", title: "Déconnexion", text: `${who} s'est déconnecté.` };
    case "ingame": return { icon: "🎮", title: "Jeu lancé", text: `${who} joue à ${e.place || "une expérience"}.` };
    case "leftgame": return { icon: "🚪", title: "Jeu quitté", text: `${who} a quitté ${e.place || "le jeu"}.` };
    case "req_in": return { icon: "📨", title: "Demande d'ami", text: `${who} t'a envoyé une demande d'ami.` };
    case "req_accepted": return { icon: "🤝", title: "Demande acceptée", text: `${who} est maintenant ton ami.` };
    case "req_gone": return { icon: "📪", title: "Demande disparue", text: `La demande de ${who} n'existe plus.` };
    case "followers": return { icon: "👥", title: "Abonnés", text: `Abonnés : ${e.from} → ${e.to}${owner}` };
    case "followings": return { icon: "👤", title: "Abonnements", text: `Abonnements : ${e.from} → ${e.to}${owner}` };
    default: return { icon: "🦇", title: "Batblox", text: who };
  }
}

function inQuiet(quiet, now = new Date()) {
  if (!quiet || !quiet.enabled) return false;
  const toMin = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || "")); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const a = toMin(quiet.from), b = toMin(quiet.to);
  if (a == null || b == null || a === b) return false;
  const n = now.getHours() * 60 + now.getMinutes();
  return a < b ? n >= a && n < b : n >= a || n < b; // plage qui passe minuit
}

class Notifier {
  /** desktop(title, body, {sound}) : affiche une notification Windows. */
  constructor({ getSettings, desktop, logger, fetchImpl }) {
    this.getSettings = getSettings;
    this.desktop = desktop;
    this.log = logger;
    this.fetch = fetchImpl || ((...a) => fetch(...a));
  }

  wanted(entries) {
    const N = this.getSettings().notifications;
    if (!N.enabled) return [];
    return entries.filter((e) => N.events[e.type]);
  }

  notify(entries, now = new Date()) {
    const N = this.getSettings().notifications;
    const list = this.wanted(entries);
    if (!list.length || inQuiet(N.quiet, now)) return 0; // « Ne pas déranger » : seul l'envoi est coupé, l'historique est déjà enregistré
    const units = list.length > GROUP_LIMIT
      ? [{ icon: "🦇", title: `${list.length} nouveaux événements`, text: list.slice(0, 4).map((e) => describe(e).text).join("\n") + "\n…", type: "group" }]
      : list.map((e) => Object.assign({ type: e.type }, describe(e)));
    for (const u of units) this.deliver(u, N);
    return units.length;
  }

  deliver(u, N) {
    try { this.desktop(`${u.icon} ${u.title}`, u.text, { sound: N.sound }); } catch (e) { this.log.warn("Notification Windows : " + e.message); }
    if (N.discord.enabled && DISCORD_RE.test(N.discord.url)) this.sendDiscord(N.discord.url, u).catch((e) => this.log.warn("Discord : " + e.message));
    if (N.ntfy.enabled && NTFY_TOPIC_RE.test(N.ntfy.topic)) this.sendNtfy(N.ntfy, u).catch((e) => this.log.warn("ntfy : " + e.message));
  }

  async sendDiscord(url, u) {
    if (!DISCORD_RE.test(url)) throw new Error("adresse du webhook invalide");
    const res = await this.fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "Batblox", embeds: [{ title: `${u.icon} ${u.title}`, description: u.text, color: COLORS[u.type] || 0xffd60a, footer: { text: "Batblox" } }] })
    });
    if (!res.ok) throw new Error("réponse " + res.status);
  }

  async sendNtfy(cfg, u) {
    const server = String(cfg.server || "https://ntfy.sh").replace(/\/+$/, "");
    if (!/^https:\/\//i.test(server)) throw new Error("le serveur ntfy doit utiliser https");
    if (!NTFY_TOPIC_RE.test(cfg.topic)) throw new Error("sujet invalide");
    const res = await this.fetch(server, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic: cfg.topic, title: u.title, message: u.text, tags: ["bat"] }) });
    if (!res.ok) throw new Error("réponse " + res.status);
  }

  async test(kind) {
    const N = this.getSettings().notifications;
    const u = { icon: "🦇", title: "Test Batblox", text: "Si tu lis ce message, la notification fonctionne.", type: "test" };
    if (kind === "discord") { await this.sendDiscord(N.discord.url, u); return true; }
    if (kind === "ntfy") { await this.sendNtfy(N.ntfy, u); return true; }
    this.desktop(`${u.icon} ${u.title}`, u.text, { sound: N.sound });
    return true;
  }
}

module.exports = { Notifier, describe, inQuiet };

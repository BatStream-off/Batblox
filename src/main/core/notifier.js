"use strict";
// Notifications : Windows, Discord (webhook) et ntfy. Jamais aucun secret Roblox dans les messages.
const { DISCORD_RE, NTFY_TOPIC_RE } = require("./defaults");

const GROUP_LIMIT = 5;
const COLORS = { digest: 0xffd60a, added: 0x2ecc71, removed: 0xe74c3c, renamed: 0xf1c40f, online: 0x2ecc71, offline: 0x95a5a6, ingame: 0x3498db, req_in: 0x9b59b6, followers: 0x1abc9c, followings: 0x1abc9c };

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

// Jeux surveillés : un élément est soit un identifiant de jeu (chiffres), soit un nom ou un morceau de nom (sans tenir compte des accents ni des majuscules).
const fold = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
function matchesGame(e, list) {
  if (!e || e.type !== "ingame" || !Array.isArray(list) || !list.length) return false;
  const place = fold(e.place);
  return list.some((x) => { const v = String(x || "").trim(); if (!v) return false; return /^\d+$/.test(v) ? String(e.pid || "") === v : !!place && place.includes(fold(v)); });
}

const HELD_MAX = 50;

class Notifier {
  /**
   * desktop(title, body, {sound, join}) : affiche une notification Windows (join = identifiant d'un ami à rejoindre au clic).
   * isPlaying() : vrai pendant que le compte actif est en jeu (pour « Silence pendant que je joue »).
   */
  constructor({ getSettings, desktop, logger, fetchImpl, isPlaying, allow, tr }) {
    this.getSettings = getSettings;
    this.desktop = desktop;
    this.log = logger;
    this.fetch = fetchImpl || ((...a) => fetch(...a));
    this.isPlaying = isPlaying || (() => false);
    this.allow = allow || (() => true);
    this.tr = tr || ((s) => s); // langue de l'interface (Discord / ntfy) // règle des groupes d'amis (sourdine, connexions seulement pour certains groupes)
    this.held = []; // notifications Windows retenues pendant la partie
  }

  wanted(entries) {
    const N = this.getSettings().notifications;
    if (!N.enabled) return [];
    return entries.filter((e) => N.events[e.type]);
  }

  notify(entries, now = new Date()) {
    const N = this.getSettings().notifications;
    if (!N.enabled) return 0;
    entries = entries.filter((e) => this.allow(e));
    // Jeux surveillés : alerte dédiée (cliquable pour rejoindre), même si « Jeu lancé » est désactivé dans les événements.
    const alerts = entries.filter((e) => matchesGame(e, N.gameAlerts));
    const list = this.wanted(entries).filter((e) => !alerts.includes(e));
    if ((!list.length && !alerts.length) || inQuiet(N.quiet, now)) return 0; // « Ne pas déranger » : seul l'envoi est coupé, l'historique est déjà enregistré
    const units = list.length > GROUP_LIMIT
      ? [{ icon: "🦇", title: `${list.length} nouveaux événements`, text: list.slice(0, 4).map((e) => describe(e).text).join("\n") + "\n…", type: "group" }]
      : list.map((e) => Object.assign({ type: e.type }, describe(e)));
    for (const e of alerts) {
      const who = e.friendName || ("Joueur " + e.friendId);
      units.unshift({ icon: "🎯", title: "Jeu surveillé : " + (e.place || "jeu"), text: `${who} vient de lancer ${e.place || "un jeu surveillé"}. Clique pour le rejoindre.`, type: "ingame", join: e.friendId });
    }
    for (const u of units) this.deliver(u, N);
    return units.length;
  }

  deliver(u, N) {
    if (N.quietInGame && this.isPlaying()) { this.held.push(u); if (this.held.length > HELD_MAX) this.held.shift(); }
    else { try { this.desktop(`${u.icon} ${u.title}`, u.text, { sound: N.sound, join: u.join }); } catch (e) { this.log.warn("Notification Windows : " + e.message); } }
    this.sendRemote(u, N).catch(() => {});
  }

  /** Fin de partie : une seule notification Windows qui récapitule ce qui a été retenu. Renvoie le nombre d'alertes résumées. */
  flushHeld() {
    const list = this.held.splice(0);
    if (!list.length) return 0;
    const N = this.getSettings().notifications;
    const text = list.length === 1 ? list[0].text : list.slice(0, 4).map((u) => "• " + u.text).join("\n") + (list.length > 4 ? `\n… et ${list.length - 4} autre(s) dans l'historique.` : "");
    try { this.desktop(list.length === 1 ? `${list[0].icon} ${list[0].title}` : `🦇 Pendant ta partie : ${list.length} alertes`, text, { sound: N.sound, join: list.length === 1 ? list[0].join : undefined }); }
    catch (e) { this.log.warn("Notification Windows : " + e.message); }
    return list.length;
  }

  /** Envoie sur Discord et ntfy (ceux qui sont activés et configurés). Renvoie le nombre de canaux utilisés. */
  async sendRemote(u, N = this.getSettings().notifications) {
    const jobs = [];
    u = Object.assign({}, u, { title: this.tr(u.title), text: this.tr(u.text) });
    if (N.discord.enabled && DISCORD_RE.test(N.discord.url)) jobs.push(this.sendDiscord(N.discord.url, u).catch((e) => { this.log.warn("Discord : " + e.message); throw e; }));
    if (N.ntfy.enabled && NTFY_TOPIC_RE.test(N.ntfy.topic)) jobs.push(this.sendNtfy(N.ntfy, u).catch((e) => { this.log.warn("ntfy : " + e.message); throw e; }));
    const r = await Promise.allSettled(jobs);
    const failed = r.filter((x) => x.status === "rejected");
    if (jobs.length && failed.length === jobs.length) throw new Error("Envoi impossible : " + failed[0].reason.message);
    return jobs.length - failed.length;
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

module.exports = { Notifier, describe, inQuiet, matchesGame };

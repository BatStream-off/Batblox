"use strict";
// Tâches planifiées de Batblox (vérifiées chaque minute, rien ne tourne entre deux) :
//  - résumé quotidien envoyé sur Discord / ntfy à l'heure choisie ;
//  - sauvegarde automatique hebdomadaire des données dans un dossier choisi, avec rotation des anciennes copies.
// État persistant : stockage « planning » ({ digestDay, backupAt, backupFile, backupError }).
const path = require("path");
const { dayKey } = require("./playtime");

const BACKUP_RE = /^batblox-sauvegarde-auto-\d{4}-\d{2}-\d{2}(?:-\d+)?\.json$/;
const WEEK = 7 * 86400000;

const toMin = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || "")); return m && +m[1] < 24 && +m[2] < 60 ? Number(m[1]) * 60 + Number(m[2]) : null; };

/** Le résumé du jour est-il dû ? (heure atteinte et pas encore envoyé aujourd'hui) */
function digestDue(time, lastDay, now = new Date()) {
  const t = toMin(time);
  if (t == null) return false;
  return now.getHours() * 60 + now.getMinutes() >= t && lastDay !== dayKey(now.getTime());
}

/** La sauvegarde hebdomadaire est-elle due ? */
function backupDue(lastAt, now = Date.now()) { return !lastAt || now - lastAt >= WEEK; }

/** Noms de sauvegardes automatiques à supprimer pour n'en garder que `keep` (les plus récentes). Les autres fichiers ne sont jamais touchés. */
function toPrune(names, keep) {
  const mine = names.filter((n) => BACKUP_RE.test(n)).sort();
  return mine.slice(0, Math.max(0, mine.length - Math.max(1, keep)));
}

const fmtDur = (sec) => { sec = Math.round(sec || 0); const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60); return h ? h + " h " + String(m).padStart(2, "0") + " min" : m + " min"; };

const DIGEST_LABELS = [
  ["added", "nouvel(s) ami(s)"], ["removed", "ami(s) retiré(s)"], ["renamed", "changement(s) de pseudo"], ["req_in", "demande(s) d'ami reçue(s)"],
  ["ingame", "jeu(x) lancé(s) par tes amis"], ["online", "connexion(s)"]
];

/** Construit le texte du résumé quotidien (fonction pure). entries : historique ; play : { today, todayGames } ou null. */
function buildDigest(entries, play, now = Date.now(), accId) {
  const k = dayKey(now);
  const today = entries.filter((e) => dayKey(e.ts) === k && (!accId || !e.acc || e.acc === accId));
  const count = {};
  for (const e of today) count[e.type] = (count[e.type] || 0) + 1;
  const lines = [];
  for (const [t, l] of DIGEST_LABELS) if (count[t]) lines.push(`• ${count[t]} ${l}`);
  const names = (t) => [...new Set(today.filter((e) => e.type === t).map((e) => e.friendName).filter(Boolean))].slice(0, 5);
  if (count.added) lines.push("  Nouveaux : " + names("added").join(", "));
  if (count.removed) lines.push("  Retirés : " + names("removed").join(", "));
  if (play && play.today > 0) {
    lines.push(`• Ton temps de jeu : ${fmtDur(play.today)}`);
    const g = (play.todayGames || []).slice(0, 3).map((x) => `${x.name || "Jeu " + x.id} (${fmtDur(x.s)})`);
    if (g.length) lines.push("  " + g.join(", "));
  }
  if (!lines.length) lines.push("Journée calme : aucun changement détecté.");
  return { icon: "🦇", title: "Résumé du jour", text: lines.join("\n"), type: "digest" };
}

class Scheduler {
  constructor({ storage, getSettings, notifier, monitor, playtime, data, accounts, fs, logger, onBackup }) {
    Object.assign(this, { storage, getSettings, notifier, monitor, playtime, data, accounts, fs, log: logger || { info() {}, warn() {}, error() {} }, onBackup: onBackup || (() => {}) });
    this.state = storage.get("planning", () => ({}));
    this.timer = null;
  }

  start() { this.stop(); this.timer = setInterval(() => this.tick().catch((e) => this.log.warn("Planification : " + e.message)), 60000); if (this.timer.unref) this.timer.unref(); setTimeout(() => this.tick().catch(() => {}), 20000).unref?.(); }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  async tick(now = new Date()) {
    const S = this.getSettings();
    if (S.notifications.digest.enabled && digestDue(S.notifications.digest.time, this.state.digestDay, now)) {
      this.state.digestDay = dayKey(now.getTime()); this.storage.dirty("planning");
      await this.sendDigest(now.getTime()).catch((e) => this.log.warn("Résumé quotidien : " + e.message));
    }
    if (S.backup.enabled && S.backup.dir && backupDue(this.state.backupAt, now.getTime())) {
      try { this.backupNow(now); } catch (e) { this.log.warn("Sauvegarde automatique : " + e.message); }
    }
  }

  digestUnit(now = Date.now()) {
    const accId = this.accounts.activeId();
    const play = accId && this.playtime ? this.playtime.summary(accId, now) : null;
    return buildDigest(this.monitor.history.entries, play, now, accId);
  }

  /** Envoie le résumé sur Discord et/ou ntfy. Renvoie le nombre de canaux utilisés. */
  async sendDigest(now = Date.now()) { return this.notifier.sendRemote(this.digestUnit(now)); }

  /** Écrit une sauvegarde dans le dossier choisi et supprime les plus anciennes. Renvoie le chemin du fichier. */
  backupNow(now = new Date()) {
    const B = this.getSettings().backup;
    const fs = this.fs;
    const dir = String(B.dir || "");
    try {
      if (!dir || !path.isAbsolute(dir)) throw new Error("Choisis d'abord un dossier de sauvegarde.");
      if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error("Le dossier de sauvegarde est introuvable : " + dir);
      const base = "batblox-sauvegarde-auto-" + dayKey(now.getTime());
      let file = path.join(dir, base + ".json"), i = 2;
      while (fs.existsSync(file)) file = path.join(dir, base + "-" + i++ + ".json");
      const tmp = file + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(this.data.exportAll(), null, 2), "utf8");
      fs.renameSync(tmp, file);
      for (const n of toPrune(fs.readdirSync(dir), Number(B.keep) || 8)) { try { fs.unlinkSync(path.join(dir, n)); } catch (_) {} }
      Object.assign(this.state, { backupAt: now.getTime(), backupOkAt: now.getTime(), backupFile: file, backupError: "" });
      this.storage.dirty("planning");
      this.onBackup(this.status());
      return file;
    } catch (e) {
      Object.assign(this.state, { backupError: e.message, backupErrorAt: now.getTime() });
      // Un dossier absent (clé USB débranchée…) ne doit pas réessayer chaque minute : nouvel essai dans une heure.
      if (this.state.backupAt) this.state.backupAt = Math.max(this.state.backupAt, now.getTime() - WEEK + 3600000);
      else this.state.backupAt = now.getTime() - WEEK + 3600000;
      this.storage.dirty("planning");
      this.onBackup(this.status());
      throw e;
    }
  }

  status() {
    const s = this.state;
    return { lastAt: s.backupOkAt || 0, file: s.backupFile || "", error: s.backupError || "", nextAt: s.backupAt ? s.backupAt + WEEK : 0, digestDay: s.digestDay || "" };
  }
}

module.exports = { Scheduler, digestDue, backupDue, toPrune, buildDigest, BACKUP_RE };

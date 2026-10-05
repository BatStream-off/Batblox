"use strict";
// Lanceur Roblox : détection de l'installation, des instances, lancement avec le compte actif et « Rejoindre ».
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn: nodeSpawn } = require("child_process");

const EXE = "RobloxPlayerBeta.exe";
// Lanceurs alternatifs (installés par défaut dans %LOCALAPPDATA%\<Nom>). Ils s'enregistrent comme gestionnaire de roblox-player: et
// reçoivent le lien de lancement en argument, exactement comme le client officiel.
const ALT = [
  { id: "bloxstrap", name: "Bloxstrap", dir: "Bloxstrap", exe: "Bloxstrap.exe" },
  { id: "fishstrap", name: "Fishstrap", dir: "Fishstrap", exe: "Fishstrap.exe" },
  { id: "voidstrap", name: "Voidstrap", dir: "Voidstrap", exe: "Voidstrap.exe" }
];
// Lien officiel qui ouvre l'application Roblox : le client vérifie alors sa version et se met à jour si besoin.
const APP_URI = "roblox-player:1+launchmode:app";
const VERSION_RE = /^version-[0-9a-f]{8,32}$/i;
const UPDATE_WINDOW_MS = 5 * 60 * 1000; // durée pendant laquelle une mise à jour lancée est suivie
const LATEST_TTL_MS = 10 * 60 * 1000;   // la dernière version publique est mémorisée 10 min
const SETTLE_MS = 20 * 1000;            // dossier de la nouvelle version vu depuis 20 s sans Roblox ouvert = installation terminée
const CLIENT_IDS = ["auto", "roblox", ...ALT.map((a) => a.id), "custom"];

function parsePlaceId(input) {
  const s = String(input == null ? "" : input).trim();
  const m = /roblox\.com\/(?:[a-z-]+\/)?games\/(\d+)/i.exec(s) || /^(\d{1,19})$/.exec(s);
  return m ? m[1] : null;
}

// URI de lancement officielle du client Roblox (même format que le site) avec un ticket à usage unique.
function buildLaunchUri({ ticket, placeId, jobId, userId, trackerId, now = Date.now(), uuid = crypto.randomUUID() }) {
  const base = "https://assetgame.roblox.com/game/PlaceLauncher.ashx";
  const q = userId
    ? `request=RequestFollowUser&browserTrackerId=${trackerId}&userId=${userId}&joinAttemptId=${uuid}&joinAttemptOrigin=JoinUser`
    : jobId
    ? `request=RequestGameJob&browserTrackerId=${trackerId}&placeId=${placeId}&gameId=${jobId}&isPlayTogetherGame=false`
    : `request=RequestGame&browserTrackerId=${trackerId}&placeId=${placeId}&isPlayTogetherGame=false&joinAttemptId=${uuid}&joinAttemptOrigin=PlayButton`;
  return `roblox-player:1+launchmode:play+gameinfo:${ticket}+launchtime:${now}+placelauncherurl:${encodeURIComponent(base + "?" + q)}+browsertrackerid:${trackerId}+robloxLocale:fr_fr+gameLocale:fr_fr+channel:+LaunchExp:InApp`;
}

function parseTasklist(out) {
  const res = [];
  for (const line of String(out || "").split(/\r?\n/)) {
    const m = /^"([^"]+)","(\d+)","[^"]*","[^"]*","([^"]*)"/.exec(line.trim());
    if (m && m[1].toLowerCase() === EXE.toLowerCase()) res.push({ pid: Number(m[2]), memKb: Number(String(m[3]).replace(/[^\d]/g, "")) || 0 });
  }
  return res;
}

class RobloxLauncher {
  constructor({ env = process.env, platform = process.platform, execFile, openExternal, spawn = nodeSpawn, accounts, monitor, logger, getSettings }) {
    this.env = env; this.platform = platform; this.spawn = spawn;
    this.getSettings = getSettings || (() => ({ launcher: {} }));
    this.execFile = execFile; this.openExternal = openExternal;
    this.accounts = accounts; this.monitor = monitor; this.log = logger;
    this._updating = null; this._lat = null; // mise à jour de Roblox en cours / dernière version publique mémorisée
  }

  roots() {
    const out = [];
    if (this.env.LOCALAPPDATA) out.push(path.join(this.env.LOCALAPPDATA, "Roblox", "Versions"));
    if (this.env["ProgramFiles(x86)"]) out.push(path.join(this.env["ProgramFiles(x86)"], "Roblox", "Versions"));
    return out;
  }

  /** Installation la plus récente trouvée (dossier version-xxxx contenant RobloxPlayerBeta.exe). */
  install() {
    let best = null;
    for (const root of this.roots()) {
      let names = [];
      try { names = fs.readdirSync(root); } catch (_) { continue; }
      for (const n of names) {
        const dir = path.join(root, n);
        try {
          if (!fs.existsSync(path.join(dir, EXE))) continue;
          const t = fs.statSync(dir).mtimeMs;
          if (!best || t > best.mtime) best = { version: n, dir, exe: path.join(dir, EXE), mtime: t, root };
        } catch (_) {}
      }
    }
    return best;
  }

  /** Lanceurs utilisables : Roblox officiel + alternatives détectées (le choix « personnalisé » est géré à part). */
  clients() {
    const local = this.env.LOCALAPPDATA;
    const official = this.install();
    const list = [{ id: "roblox", name: "Roblox officiel", found: !!official, exe: official ? official.exe : null, cwd: official ? official.dir : null }];
    for (const a of ALT) {
      const exe = local ? path.join(local, a.dir, a.exe) : null;
      let found = false;
      try { found = !!exe && fs.existsSync(exe); } catch (_) {}
      list.push({ id: a.id, name: a.name, found, exe: found ? exe : null, cwd: found ? path.dirname(exe) : null });
    }
    return list;
  }

  /** Lanceur choisi dans les réglages, ou null (= « automatique » : Windows ouvre le lanceur associé à roblox-player:). */
  chosen() {
    const L = this.getSettings().launcher || {};
    const id = CLIENT_IDS.includes(L.client) ? L.client : "auto";
    if (id === "auto") return null;
    if (id === "custom") {
      const exe = String(L.customExe || "");
      let ok = false;
      try { ok = /\.exe$/i.test(exe) && fs.existsSync(exe); } catch (_) {}
      return { id, name: "Lanceur personnalisé", found: ok, exe: ok ? exe : null, cwd: ok ? path.dirname(exe) : null };
    }
    return this.clients().find((c) => c.id === id) || null;
  }

  _run(cmd, args) {
    return new Promise((resolve) => {
      try { this.execFile(cmd, args, { windowsHide: true, timeout: 15000 }, (err, stdout) => resolve({ err, out: stdout || "" })); }
      catch (e) { resolve({ err: e, out: "" }); }
    });
  }

  async processes() {
    if (this.platform !== "win32") return [];
    const { out } = await this._run("tasklist", ["/FI", `IMAGENAME eq ${EXE}`, "/FO", "CSV", "/NH"]);
    return parseTasklist(out);
  }

  async closeInstance(pid, force = false) {
    if (this.platform !== "win32" || !Number.isInteger(pid)) return false;
    const procs = await this.processes();
    if (!procs.some((p) => p.pid === pid)) return false; // on ne ferme que de vraies instances Roblox
    const { err } = await this._run("taskkill", ["/PID", String(pid), "/T"].concat(force ? ["/F"] : []));
    return !err;
  }

  async closeAll(force = false) {
    const list = await this.processes();
    let n = 0;
    for (const p of list) if (await this.closeInstance(p.pid, force)) n++;
    return n;
  }

  async status() {
    const inst = this.install();
    const procs = await this.processes();
    const c = this.chosen();
    return { installed: !!inst, version: inst ? inst.version : null, instances: procs, windows: this.platform === "win32",
      clients: this.clients().map(({ id, name, found }) => ({ id, name, found })), client: (this.getSettings().launcher || {}).client || "auto", customExe: (this.getSettings().launcher || {}).customExe || "", chosenOk: c ? c.found : true };
  }

  /** Attend qu'un NOUVEAU processus Roblox apparaisse (Windows uniquement). */
  async _appeared(before, ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      await new Promise((r) => setTimeout(r, 1000));
      const now = await this.processes();
      if (now.some((p) => !before.has(p.pid))) return true;
    }
    return false;
  }

  async _start({ placeId, jobId, userId }) {
    const referer = userId ? `https://www.roblox.com/users/${userId}/profile` : `https://www.roblox.com/games/${placeId}`;
    const acc = this.accounts.active();
    if (!acc) throw new Error("Aucun compte actif : ajoute un compte pour lancer Roblox.");
    if (acc.status !== "ok") throw new Error("La session de ce compte n'est plus valide : reconnecte-le dans « Comptes ».");
    const found = this.install();
    if (!found) this.log.warn("Installation de Roblox non détectée dans les dossiers habituels.");
    let ticket;
    try { ticket = await this.accounts.client(acc.id).authTicket(referer); }
    catch (e) {
      this.log.warn("Ticket de connexion refusé : " + (e && e.message));
      if (e.status === 401 || e.status === 403) throw new Error("Roblox a refusé la session de ce compte : reconnecte-le dans « Comptes ».");
      if (e.status === 429) throw new Error("Roblox limite les demandes pour le moment : réessaie dans une minute.");
      throw new Error("Roblox n'a pas fourni de ticket de connexion (" + (e.status || (e && e.message) || "réseau") + ").");
    }
    const trackerId = String(Math.floor(Math.random() * 1e10) + 1e11);
    const uri = buildLaunchUri({ ticket, placeId, jobId, userId, trackerId });
    const check = this.platform === "win32";
    const before = new Set(check ? (await this.processes()).map((p) => p.pid) : []);

    // 0) Lanceur choisi par l'utilisateur (Roblox officiel, Bloxstrap, Fishstrap, Voidstrap, personnalisé)
    const pick = this.chosen();
    if (pick) {
      if (!pick.found) throw new Error(`${pick.name} est introuvable sur ce PC. Choisis un autre lanceur dans Roblox → « Lanceur utilisé ».`);
      this.log.info(`Lanceur utilisé : ${pick.name}`);
      try {
        const child = this.spawn(pick.exe, [uri], { detached: true, stdio: "ignore", windowsHide: false, cwd: pick.cwd });
        if (child && child.unref) child.unref();
        if (child && child.on) child.on("error", (e) => this.log.warn(`${pick.name} : démarrage impossible : ${e.message}`));
      } catch (e) { throw new Error(`${pick.name} n'a pas pu démarrer : ${e.message}`); }
      if (!check || (await this._appeared(before, 30000))) return acc; // 30 s : Bloxstrap & co. vérifient les mises à jour avant d'ouvrir Roblox
      this.log.warn(`${pick.name} : aucune fenêtre Roblox après 30 s.`);
      throw new Error(`${pick.name} a été démarré mais Roblox ne s'est pas ouvert. Ouvre ${pick.name} à la main pour voir son message, ou repasse sur « Automatique ».`);
    }

    // 1) Méthode officielle : le lien roblox-player: (Windows ouvre le lanceur de Roblox)
    let opened = true;
    try { await this.openExternal(uri); }
    catch (e) { opened = false; this.log.warn("Lien roblox-player: refusé par Windows : " + (e && e.message)); }
    if (!check) return acc;
    if (opened && (await this._appeared(before, 12000))) return acc;

    // 2) Repli : démarrer directement RobloxPlayerBeta.exe avec les mêmes paramètres
    if (found) {
      this.log.warn("Roblox ne s'est pas ouvert via le lien : démarrage direct de " + EXE);
      try {
        const child = this.spawn(found.exe, [uri], { detached: true, stdio: "ignore", windowsHide: false, cwd: found.dir });
        if (child && child.unref) child.unref();
        if (child && child.on) child.on("error", (e) => this.log.warn("Démarrage direct impossible : " + e.message));
      } catch (e) { this.log.warn("Démarrage direct impossible : " + e.message); }
      if (await this._appeared(before, 15000)) return acc;
    }
    this.log.warn("Roblox ne s'est pas ouvert (ticket obtenu, lien envoyé).");
    throw new Error(found
      ? "Le ticket de connexion a été obtenu mais Roblox ne s'ouvre pas. Ouvre Roblox une fois à la main (roblox.com → Jouer) pour le réparer, ou utilise Maintenance → Réparer, puis réessaie."
      : "Roblox ne semble pas installé (aucun programme n'ouvre les liens roblox-player). Installe-le depuis roblox.com.");
  }

  async launch({ placeId, jobId } = {}) {
    const pid = parsePlaceId(placeId);
    if (!pid) throw new Error("Identifiant de jeu invalide. Colle l'identifiant ou le lien du jeu.");
    if (jobId && !/^[0-9a-fA-F-]{8,64}$/.test(String(jobId))) throw new Error("Identifiant de serveur invalide.");
    const acc = await this._start({ placeId: pid, jobId });
    this.log.info(`Lancement de Roblox (jeu ${pid}) avec ${acc.name}`);
    return { ok: true, placeId: pid };
  }

  // ------------------------------------------------------------ Mise à jour de Roblox
  /** Dossiers de versions installés (Roblox officiel + lanceurs alternatifs), restreints au lanceur choisi s'il y en a un. */
  installedVersions() {
    const local = this.env.LOCALAPPDATA;
    const roots = this.roots().map((root) => ({ root, client: "roblox" }));
    if (local) for (const a of ALT) roots.push({ root: path.join(local, a.dir, "Versions"), client: a.id });
    const pick = this.chosen();
    const only = pick && pick.id !== "custom" ? pick.id : null;
    const out = [];
    for (const r of roots) {
      if (only && r.client !== only) continue;
      let names = [];
      try { names = fs.readdirSync(r.root); } catch (_) { continue; }
      for (const n of names) {
        if (!VERSION_RE.test(n)) continue;
        const dir = path.join(r.root, n);
        try { if (fs.existsSync(path.join(dir, EXE))) out.push({ guid: n, dir, client: r.client, mtime: fs.statSync(dir).mtimeMs }); } catch (_) {}
      }
    }
    return out.sort((a, b) => b.mtime - a.mtime);
  }

  async _latest(force) {
    const now = Date.now();
    if (!force && this._lat && now - this._lat.at < LATEST_TTL_MS) return this._lat;
    const client = (this.accounts.publicClient && this.accounts.publicClient()) || (this.accounts.activeClient && this.accounts.activeClient());
    if (!client || !client.clientVersion) throw new Error("Aucune connexion disponible pour vérifier la version.");
    const v = await client.clientVersion("WindowsPlayer");
    this._lat = { guid: v.guid, version: v.version, at: now };
    return this._lat;
  }

  /** Version installée, dernière version publique et état d'une éventuelle mise à jour en cours. */
  async updateCheck(force = false) {
    if (this.platform !== "win32") return { supported: false };
    let latest = null, error = null;
    try { latest = await this._latest(force); }
    catch (e) { error = e && e.status === 429 ? "Roblox limite les demandes pour le moment : réessaie dans une minute." : "Impossible de vérifier la dernière version de Roblox pour le moment."; this.log.warn("Version Roblox : " + (e && e.message)); }
    const inst = this.installedVersions();
    const procs = await this.processes();
    const now = Date.now();
    const u = this._updating && now < this._updating.until ? this._updating : null;
    let upToDate = latest && inst.length ? inst.some((v) => v.guid === latest.guid) : null;
    let finishing = false;
    if (u && upToDate) {
      // Le dossier de la nouvelle version apparaît avant la fin de l'installation : on attend que Roblox s'ouvre (ou 20 s de calme).
      u.seenAt = u.seenAt || now;
      if (!procs.length && now - u.seenAt < SETTLE_MS) { upToDate = false; finishing = true; }
    }
    if (u && upToDate) this._updating = null;
    return { supported: true, installed: inst[0] ? { guid: inst[0].guid, client: inst[0].client } : null,
      latest: latest ? { guid: latest.guid, version: latest.version } : null, upToDate, updating: !!(u && !upToDate) || finishing, finishing, running: procs.length, error };
  }

  /** Déclenche la mise à jour par la voie officielle (le lien roblox-player: ouvre Roblox, qui se met à jour avant de démarrer). */
  async update({ closeFirst = false } = {}) {
    if (this.platform !== "win32") throw new Error("La mise à jour de Roblox fonctionne uniquement sous Windows.");
    if (this._updating && Date.now() < this._updating.until) throw new Error("Une mise à jour est déjà en cours.");
    const st = await this.updateCheck(true);
    if (!st.latest) throw new Error(st.error || "Impossible de connaître la dernière version de Roblox.");
    if (st.upToDate) return { ok: true, already: true, version: st.latest.guid };
    if (st.running) {
      if (!closeFirst) throw new Error("Roblox est ouvert : ferme-le avant de le mettre à jour.");
      await this.closeAll(false);
      let left = st.running;
      for (let i = 0; i < 8 && left; i++) { await new Promise((r) => setTimeout(r, 1000)); left = (await this.processes()).length; }
      if (left) throw new Error("Roblox ne s'est pas fermé : ferme-le à la main (ou force sa fermeture) puis réessaie.");
    }
    const pick = this.chosen();
    if (pick && !pick.found) throw new Error(`${pick.name} est introuvable sur ce PC. Choisis un autre lanceur dans Roblox → « Lanceur utilisé ».`);
    const found = this.install();
    if (!pick && !found) throw new Error("Roblox ne semble pas installé : installe-le depuis roblox.com.");
    const now = Date.now();
    this._updating = { since: now, until: now + UPDATE_WINDOW_MS, target: st.latest.guid };
    const run = (exe, cwd, name) => {
      const child = this.spawn(exe, [APP_URI], { detached: true, stdio: "ignore", windowsHide: false, cwd });
      if (child && child.unref) child.unref();
      if (child && child.on) child.on("error", (e) => this.log.warn(`${name} : démarrage impossible : ${e.message}`));
    };
    try {
      if (pick) { this.log.info(`Mise à jour de Roblox via ${pick.name}`); run(pick.exe, pick.cwd, pick.name); }
      else {
        this.log.info("Mise à jour de Roblox via le lien officiel");
        let opened = true;
        try { await this.openExternal(APP_URI); } catch (e) { opened = false; this.log.warn("Lien roblox-player: refusé par Windows : " + (e && e.message)); }
        if (!opened) run(found.exe, found.dir, EXE);
      }
    } catch (e) { this._updating = null; throw new Error("La mise à jour n'a pas pu démarrer : " + (e && e.message)); }
    return { ok: true, started: true, target: st.latest.guid };
  }

  /** Rejoint le serveur exact d'un ami ou d'un profil suivi, si Roblox le permet. */
  async join(userId) {
    if (!/^\d+$/.test(String(userId))) throw new Error("Identifiant invalide.");
    const client = this.accounts.activeClient();
    if (!client) throw new Error("Aucun compte actif.");
    let p = this.monitor && this.monitor.live[String(userId)];
    if (!p || p.type !== 2) {
      try { p = (await client.presence([String(userId)]))[String(userId)]; }
      catch (e) { throw new Error("Vérification impossible, réessaie dans un instant."); }
    }
    if (!p || p.type !== 2) throw new Error("Cette personne n'est pas en jeu, ou Roblox ne partage pas son activité avec toi.");
    const acc = this.accounts.active();
    // Serveur exact si Roblox le donne ; sinon on demande à Roblox de nous placer chez l'ami (comme le bouton « Rejoindre » du site).
    const r = p.pl && p.gid ? await this._start({ placeId: p.pl, jobId: p.gid }) : await this._start({ userId: String(userId) });
    this.log.info(`Rejoindre ${userId} avec ${r.name}`);
    return { ok: true };
  }
}

module.exports = { APP_URI, CLIENT_IDS, RobloxLauncher, parsePlaceId, buildLaunchUri, parseTasklist, EXE };

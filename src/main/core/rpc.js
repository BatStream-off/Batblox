"use strict";
// Discord Rich Presence : affiche le jeu Roblox en cours. Demande un identifiant d'application Discord (créé par l'utilisateur).
// Robuste : se reconnecte tout seul si Discord est lancé après Batblox ou redémarré, explique la vraie cause d'un échec,
// et ne bloque jamais l'application si Discord ne répond plus.
const RETRY_MS = 10000, CALL_MS = 2000;
const later = (ms) => new Promise((r) => setTimeout(r, ms));
/** Exécute fn sans jamais bloquer plus de `ms` (discord-rpc attend indéfiniment une réponse d'un Discord disparu). */
const bounded = (fn, ms = CALL_MS) => Promise.race([(async () => { try { return await fn(); } catch (_) { return undefined; } })(), later(ms)]);

/** Transforme l'échec de connexion en message clair + indique s'il vaut la peine de réessayer. */
function explain(e, close) {
  const msg = String((e && e.message) || e || "");
  if (close && (close.code === 4000 || /client.?id/i.test(String(close.message || "")))) return { retry: false, text: "Discord refuse cet identifiant. Copie l'« Application ID » de ton application sur discord.com/developers (pas la clé publique ni le secret)." };
  if (/could not connect|ENOENT|ECONNREFUSED|EPIPE|ENOTFOUND/i.test(msg)) return { retry: true, text: "Discord est introuvable : ouvre l'application Discord (pas le site web). Batblox se connectera tout seul. Si Discord est lancé en administrateur, lance Batblox de la même façon." };
  if (/TIMEOUT/i.test(msg)) return { retry: true, text: "Discord ne répond pas. Redémarre Discord ; Batblox réessaie automatiquement." };
  if (close || /connection closed/i.test(msg)) return { retry: true, text: "Discord a fermé la connexion. Batblox réessaie automatiquement." };
  return { retry: true, text: "Connexion à Discord impossible (" + msg.replace(/\s+/g, " ").slice(0, 80) + "). Batblox réessaie automatiquement." };
}

class RichPresence {
  constructor({ getSettings, launcher, monitor, accounts, logger, load, retryMs }) {
    this.getSettings = getSettings; this.launcher = launcher; this.monitor = monitor; this.accounts = accounts; this.log = logger || { info() {}, warn() {} };
    this.load = load || (() => require("discord-rpc"));
    this.retryMs = retryMs || RETRY_MS;
    this.client = null; this.ready = false; this.timer = null; this.retryTimer = null; this.startedAt = null; this.lastKey = "";
    this.error = null; this.clientId = ""; this.wanted = false; this.connecting = false; this.playing = false; this.gen = 0;
  }

  state() { return { active: !!this.client, ready: this.ready, error: this.error, connecting: this.connecting, playing: this.ready && this.playing }; }

  async sync() {
    const S = this.getSettings().discordRpc, id = String(S.clientId || "").trim();
    if (!S.enabled) { await this.disable(); this.error = null; return this.state(); }
    if (!id) { await this.disable(); this.error = "Colle l'identifiant de ton application Discord (« Application ID »), puis clique sur Enregistrer."; return this.state(); }
    if (!/^\d{15,25}$/.test(id)) { await this.disable(); this.error = "Identifiant invalide : il ne contient que des chiffres (environ 18). Copie l'« Application ID » sur discord.com/developers."; return this.state(); }
    await this.enable(id);
    return this.state();
  }

  /** Force une nouvelle tentative immédiate (bouton « Réessayer »). */
  async retry() { await this.disable(); return this.sync(); }

  async enable(clientId) {
    if (this.clientId === clientId && this.wanted && (this.client || this.retryTimer)) return; // déjà connecté ou en attente d'une nouvelle tentative
    await this.disable();
    this.clientId = clientId; this.wanted = true; this.error = null;
    await this._connect();
  }

  async _connect() {
    if (this.connecting || !this.wanted) return;
    let lib;
    try { lib = this.load(); } catch (e) { this.error = "Le module Discord n'est pas installé dans cette version."; this.log.warn("Rich Presence : module discord-rpc introuvable"); return; }
    const gen = ++this.gen, id = this.clientId;
    this.connecting = true;
    let c = null, closeInfo = null;
    try {
      c = new lib.Client({ transport: "ipc" });
      try { c.transport.on("close", (d) => { closeInfo = d; }); } catch (_) {}
      this.client = c;
      c.on("ready", () => { if (gen !== this.gen) return; this.ready = true; this.error = null; this.tick().catch(() => {}); });
      c.on("disconnected", () => {
        if (gen !== this.gen) return;
        if (!this.connecting) this.error = "Connexion à Discord perdue. Batblox réessaie automatiquement.";
        this._drop(c); this._retrySoon();
      });
      await c.login({ clientId: id });
      if (gen !== this.gen) return; // désactivé ou modifié pendant la connexion
      this.error = null; this._startTimer();
    } catch (e) {
      if (gen !== this.gen) return;
      const x = explain(e, closeInfo);
      this.error = x.text;
      this.log.warn("Rich Presence : " + String((e && e.message) || e).slice(0, 120) + (closeInfo && closeInfo.code ? " (code " + closeInfo.code + ")" : ""));
      this._drop(c);
      if (x.retry) this._retrySoon();
    } finally { if (gen === this.gen) this.connecting = false; }
  }

  /** Oublie un client mort (sans bloquer) pour pouvoir en recréer un propre. */
  _drop(c) {
    if (c && this.client === c) { this.client = null; this.ready = false; this.playing = false; this.lastKey = ""; this.startedAt = null; }
    if (this.timer && !this.client) { clearInterval(this.timer); this.timer = null; }
    if (c) bounded(() => c.destroy());
  }

  _retrySoon() {
    if (!this.wanted || this.retryTimer) return;
    this.retryTimer = setTimeout(() => { this.retryTimer = null; this._connect().catch(() => {}); }, this.retryMs);
    if (this.retryTimer.unref) this.retryTimer.unref();
  }

  _startTimer() { if (!this.timer) { this.timer = setInterval(() => this.tick().catch(() => {}), 15000); if (this.timer.unref) this.timer.unref(); } }

  async disable() {
    this.gen++; this.wanted = false; this.connecting = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    const c = this.client, was = this.ready;
    this.client = null; this.ready = false; this.playing = false; this.startedAt = null; this.lastKey = "";
    if (c) { if (was) await bounded(() => c.clearActivity(), 1500); await bounded(() => c.destroy(), 1500); }
  }

  async tick() {
    if (!this.client || !this.ready) return;
    const c = this.client;
    const procs = await this.launcher.processes();
    if (this.client !== c || !this.ready) return;
    if (!procs.length) { this.playing = false; if (this.lastKey) { this.lastKey = ""; this.startedAt = null; await bounded(() => c.clearActivity(), 5000); } return; }
    const me = this.monitor.snapshot().me;
    const game = me && me.status === "jeu" && me.place ? me.place : null;
    const key = game || "menu";
    if (key !== this.lastKey) { this.lastKey = key; this.startedAt = new Date(); }
    this.playing = true;
    await bounded(() => c.setActivity({ details: game ? `Joue à ${game}` : "Sur Roblox", state: "avec Batblox", startTimestamp: this.startedAt, instance: false }), 5000);
  }
}
module.exports = { RichPresence, explain };

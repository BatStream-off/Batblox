"use strict";
// AccountManager : source unique de vérité pour le compte Roblox actif.
// Le cookie de session n'est jamais écrit en clair : il est chiffré par Windows (Vault) et seul le texte chiffré est stocké.
const { EventEmitter } = require("events");
const crypto = require("crypto");
const { RobloxClient } = require("./roblox");

class AccountManager extends EventEmitter {
  /**
   * @param {object} deps
   *  storage, vault, logger
   *  sessions : { setCookie(id,v), getCookie(id), clear(id), fetchFor(id) }
   */
  constructor({ storage, vault, sessions, logger }) {
    super();
    this.storage = storage;
    this.vault = vault;
    this.sessions = sessions;
    this.log = logger;
    this.clients = new Map();
    this.data = storage.get("accounts", () => ({ activeId: null, defaultId: null, accounts: [] }));
    if (!Array.isArray(this.data.accounts)) this.data.accounts = [];
  }

  // Recharge les sessions dans la mémoire des fenêtres au démarrage, puis choisit le compte actif.
  async init() {
    for (const a of this.data.accounts) {
      const cookie = this.vault.open(a.cookieEnc);
      if (cookie) await this.sessions.setCookie(a.id, cookie);
      else if (a.cookieEnc) a.status = "expire";
    }
    const ids = this.data.accounts.map((a) => a.id);
    if (!ids.includes(this.data.activeId)) this.data.activeId = ids.includes(this.data.defaultId) ? this.data.defaultId : (ids[0] || null);
    this._save();
  }

  _save() { this.storage.set("accounts", this.data); }

  pub(a) {
    if (!a) return null;
    const { cookieEnc, ...rest } = a; // jamais le secret, même chiffré, vers l'interface
    return Object.assign(rest, { active: a.id === this.data.activeId, isDefault: a.id === this.data.defaultId });
  }
  list() { return this.data.accounts.map((a) => this.pub(a)); }
  get(id) { return this.data.accounts.find((a) => a.id === id) || null; }
  active() { return this.pub(this.get(this.data.activeId)); }
  activeId() { return this.data.activeId; }

  client(id) {
    if (!this.clients.has(id)) this.clients.set(id, new RobloxClient(this.sessions.fetchFor(id), this.sessions.rawFor ? this.sessions.rawFor(id) : null, this.sessions.pageFor ? this.sessions.pageFor(id) : null));
    return this.clients.get(id);
  }
  activeClient() { return this.data.activeId ? this.client(this.data.activeId) : null; }

  /**
   * Deuxième client : requêtes SANS session, pour les données publiques (profils suivis).
   * Il a sa propre file d'attente et sa propre pause en cas de 429, indépendantes de celles du compte.
   * Si la fabrique de sessions n'en propose pas (tests), on retombe sur le client du compte.
   */
  publicClient(fallbackId) {
    if (typeof this.sessions.publicFetch !== "function") return fallbackId ? this.client(fallbackId) : this.activeClient();
    if (!this._public) this._public = new RobloxClient(this.sessions.publicFetch());
    return this._public;
  }

  /** Ajoute (ou met à jour) un compte à partir du cookie obtenu par la fenêtre de connexion. */
  async addFromCookie(label, cookie, hint) {
    if (!cookie) throw new Error("Connexion non terminée.");
    const tmpId = "tmp-" + crypto.randomBytes(4).toString("hex");
    await this.sessions.setCookie(tmpId, cookie);
    let me;
    try { me = await new RobloxClient(this.sessions.fetchFor(tmpId)).authenticated(); }
    catch (e) { await this.sessions.clear(tmpId); throw new Error("Impossible de vérifier la connexion Roblox."); }
    await this.sessions.clear(tmpId);
    const id = String(me.id);
    const existing = this.get(id);
    const rec = existing || { id, addedAt: Date.now() };
    rec.label = (label || "").trim() || (existing && existing.label) || me.displayName || me.name;
    rec.name = me.name;
    rec.displayName = me.displayName || me.name;
    rec.cookieEnc = this.vault.seal(cookie); // lève une erreur si Windows ne peut pas chiffrer
    rec.status = "ok";
    rec.checkedAt = Date.now();
    await this.sessions.setCookie(id, cookie);
    this.clients.delete(id);
    if (!existing) this.data.accounts.push(rec);
    if (!this.data.activeId) this.data.activeId = id;
    if (!this.data.defaultId) this.data.defaultId = id;
    try { const av = await this.client(id).avatars([id]); if (av[id]) rec.avatarUrl = av[id]; } catch (_) {}
    this._save();
    this.log.info(`Compte ajouté : ${rec.name}`);
    this.emit("list");
    if (this.data.activeId === id) this.emit("changed", this.active());
    return this.pub(rec);
  }

  setActive(id) {
    const a = this.get(id);
    if (!a) throw new Error("Compte introuvable.");
    if (this.data.activeId === id) return this.pub(a);
    this.data.activeId = id;
    this._save();
    this.emit("changed", this.active());
    this.emit("list");
    return this.active();
  }

  setDefault(id) { if (!this.get(id)) throw new Error("Compte introuvable."); this.data.defaultId = id; this._save(); this.emit("list"); }

  rename(id, label) {
    const a = this.get(id);
    if (!a) throw new Error("Compte introuvable.");
    const l = String(label || "").trim();
    if (!l) throw new Error("Le nom du profil ne peut pas être vide.");
    a.label = l.slice(0, 40);
    this._save(); this.emit("list");
    if (id === this.data.activeId) this.emit("changed", this.active());
  }

  async remove(id) {
    const i = this.data.accounts.findIndex((a) => a.id === id);
    if (i < 0) return;
    this.data.accounts.splice(i, 1);
    this.clients.delete(id);
    await this.sessions.clear(id);
    if (this.data.defaultId === id) this.data.defaultId = this.data.accounts[0] ? this.data.accounts[0].id : null;
    const wasActive = this.data.activeId === id;
    if (wasActive) this.data.activeId = this.data.defaultId;
    this._save();
    this.emit("list");
    if (wasActive) this.emit("changed", this.active());
  }

  async logout(id) {
    const a = this.get(id);
    if (!a) return;
    await this.sessions.clear(id);
    this.clients.delete(id);
    a.cookieEnc = null; a.status = "deconnecte";
    this._save(); this.emit("list");
    if (id === this.data.activeId) this.emit("changed", this.active());
  }

  /** Vérifie que la session est encore valide. */
  async check(id) {
    const a = this.get(id);
    if (!a) throw new Error("Compte introuvable.");
    if (!a.cookieEnc) { a.status = "deconnecte"; this._save(); this.emit("list"); return this.pub(a); }
    try {
      const me = await this.client(id).authenticated();
      a.status = "ok"; a.name = me.name; a.displayName = me.displayName || me.name;
    } catch (e) {
      a.status = e.status === 401 ? "expire" : (e.status === 429 ? a.status : "erreur");
    }
    a.checkedAt = Date.now();
    this._save(); this.emit("list");
    return this.pub(a);
  }

  /** Roblox peut renouveler le cookie : on le ré-enregistre (chiffré) s'il a changé. */
  async persistCookies() {
    let changed = false;
    for (const a of this.data.accounts) {
      if (!a.cookieEnc) continue;
      const cur = await this.sessions.getCookie(a.id);
      if (cur && cur !== this.vault.open(a.cookieEnc)) { a.cookieEnc = this.vault.seal(cur); changed = true; }
    }
    if (changed) this._save();
  }
}

module.exports = { AccountManager };

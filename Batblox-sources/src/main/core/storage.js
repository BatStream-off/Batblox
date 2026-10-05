"use strict";
// Stockage JSON versionné, écriture atomique (fichier temporaire puis renommage) et différée.
const fs = require("fs");
const path = require("path");
const { SCHEMA_VERSION } = require("./defaults");

class Storage {
  constructor(dir, { delay = 1500, migrate } = {}) {
    this.dir = dir;
    this.delay = delay;
    this.migrate = migrate || (() => null);
    this.cache = new Map();
    this.timers = new Map();
    fs.mkdirSync(dir, { recursive: true });
  }

  file(name) { return path.join(this.dir, name + ".json"); }

  get(name, fallback) {
    if (this.cache.has(name)) return this.cache.get(name);
    let v;
    try {
      const raw = JSON.parse(fs.readFileSync(this.file(name), "utf8"));
      v = this._upgrade(name, raw);
    } catch (e) {
      // Fichier absent ou corrompu : on garde une copie du fichier abîmé pour ne rien perdre
      if (e.code !== "ENOENT") { try { fs.renameSync(this.file(name), this.file(name) + ".corrompu-" + Date.now()); } catch (_) {} }
      v = typeof fallback === "function" ? fallback() : fallback;
    }
    if (v === undefined) v = null;
    this.cache.set(name, v);
    return v;
  }

  _upgrade(name, raw) {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const from = raw.schemaVersion || 0;
      if (from < SCHEMA_VERSION) {
        const up = this.migrate(name, raw, from, SCHEMA_VERSION);
        if (up) raw = up;
        raw.schemaVersion = SCHEMA_VERSION;
      }
    }
    return raw;
  }

  set(name, value) {
    if (value && typeof value === "object" && !Array.isArray(value) && value.schemaVersion == null) value.schemaVersion = SCHEMA_VERSION;
    this.cache.set(name, value);
    this.dirty(name);
    return value;
  }

  // Signale qu'un objet déjà en cache a été modifié en place.
  dirty(name, delay) {
    if (this.timers.has(name)) return;
    this.timers.set(name, setTimeout(() => { this.timers.delete(name); this.flushOne(name); }, delay || this.delay));
    if (this.timers.get(name).unref) this.timers.get(name).unref();
  }

  flushOne(name) {
    if (!this.cache.has(name)) return;
    const f = this.file(name);
    const tmp = f + ".tmp";
    try {
      fs.writeFileSync(tmp, JSON.stringify(this.cache.get(name)));
      fs.renameSync(tmp, f);
    } catch (e) { /* disque plein ou verrouillé : on réessaiera à la prochaine écriture */ }
  }

  flush() {
    for (const [name, t] of this.timers) { clearTimeout(t); this.timers.delete(name); }
    for (const name of this.cache.keys()) this.flushOne(name);
  }

  remove(name) {
    this.cache.delete(name);
    const t = this.timers.get(name);
    if (t) { clearTimeout(t); this.timers.delete(name); }
    try { fs.unlinkSync(this.file(name)); } catch (_) {}
  }
}

module.exports = { Storage };

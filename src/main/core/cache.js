"use strict";
// Cache de Batblox : réponses de Roblox gardées en mémoire et, pour celles qui changent peu, sur le disque.
//  - fraîche (âge < ttl) : servie tout de suite, sans réseau ;
//  - périmée mais encore utilisable (âge < stale) : servie tout de suite ET rafraîchie en arrière-plan (« stale-while-revalidate »),
//    l'interface est prévenue quand la nouvelle valeur arrive (onRefresh) ;
//  - absente ou trop ancienne : on attend le réseau.
// Deux demandes identiques en même temps ne partent qu'une fois (requêtes dédoublonnées).
// Le disque ne reçoit que des données publiques et sans secret (avatars, icônes, listes de jeux) : jamais de session, de Robux ni de message.

const FILE = "cache";          // stockage « cache.json » (écriture différée et atomique par Storage)
const MAX_ENTRIES = 6000;      // au-delà, on retire les entrées les plus anciennes
const MAX_DISK = 4000;

class Cache {
  /** persist(key) → true si l'entrée peut aller sur le disque. now() remplaçable pour les tests. */
  constructor({ storage, persist, now, logger } = {}) {
    this.storage = storage || null;
    this.persist = persist || (() => false);
    this.now = now || (() => Date.now());
    this.log = logger || { warn() {} };
    this.mem = new Map();       // clé → { v, ts, ttl, stale }
    this.inflight = new Map();  // clé → Promise
    this.stats = { hits: 0, stale: 0, misses: 0, dedup: 0, saved: 0 };
    if (this.storage) {
      const disk = this.storage.get(FILE, () => ({ e: {} })) || { e: {} };
      const t = this.now();
      for (const [k, e] of Object.entries(disk.e || {})) if (e && t - e.ts < e.stale) this.mem.set(k, e);
    }
  }

  _save() {
    if (!this.storage) return;
    const e = {};
    let n = 0;
    const list = [...this.mem.entries()].filter(([k]) => this.persist(k)).sort((a, b) => b[1].ts - a[1].ts);
    for (const [k, v] of list) { if (n++ >= MAX_DISK) break; e[k] = v; }
    this.storage.set(FILE, { e });
  }
  /** Écrit tout de suite ce qui attend (à la fermeture de Batblox). */
  flush() { if (this._t) { clearTimeout(this._t); this._t = null; this._save(); } }
  _dirty() { if (this.storage && !this._t) { this._t = setTimeout(() => { this._t = null; this._save(); }, 2000); if (this._t.unref) this._t.unref(); } }

  /** Entrée brute : { value, age, fresh } ou null. */
  peek(key) {
    const e = this.mem.get(key);
    if (!e) return null;
    const age = this.now() - e.ts;
    if (age >= e.stale) { this.mem.delete(key); return null; }
    return { value: e.v, age, fresh: age < e.ttl };
  }

  set(key, value, ttl, stale) {
    this.mem.set(key, { v: value, ts: this.now(), ttl, stale: Math.max(ttl, stale || ttl) });
    if (this.mem.size > MAX_ENTRIES) {
      const old = [...this.mem.entries()].sort((a, b) => a[1].ts - b[1].ts).slice(0, this.mem.size - MAX_ENTRIES);
      for (const [k] of old) this.mem.delete(k);
    }
    if (this.persist(key)) this._dirty();
    return value;
  }

  /** Lance fn() une seule fois pour une même clé (les appels simultanés partagent la même promesse). */
  once(key, fn) {
    const p = this.inflight.get(key);
    if (p) { this.stats.dedup++; return p; }
    const q = Promise.resolve().then(fn).finally(() => this.inflight.delete(key));
    this.inflight.set(key, q);
    return q;
  }

  /**
   * Valeur en cache ou calculée. opts : { ttl, stale, force, onRefresh(value), cacheIf(value) }.
   * cacheIf permet de ne pas garder une réponse vide ou d'erreur.
   */
  async wrap(key, fn, { ttl = 60000, stale = ttl, force = false, onRefresh, cacheIf } = {}) {
    const hit = force ? null : this.peek(key);
    const load = () => this.once(key, async () => {
      const v = await fn();
      if (!cacheIf || cacheIf(v)) this.set(key, v, ttl, stale);
      return v;
    });
    if (hit && hit.fresh) { this.stats.hits++; this.stats.saved++; return hit.value; }
    if (hit) {
      this.stats.stale++; this.stats.saved++;
      load().then((v) => { if (onRefresh) onRefresh(v); }).catch((e) => this.log.warn("Cache (" + key.split(":")[0] + ") : " + (e && e.message)));
      return hit.value;
    }
    this.stats.misses++;
    return load();
  }

  /**
   * Pour une liste d'identifiants (avatars, icônes…) : sert ce qui est en cache, ne demande au réseau que le reste, en un seul lot.
   * fetchMany(ids) → { id: valeur } ; les identifiants sans réponse sont mémorisés comme « null » pendant missTtl (évite de redemander en boucle).
   */
  async many(prefix, ids, fetchMany, { ttl, stale, missTtl = 10 * 60000 } = {}) {
    const out = {}, need = [];
    for (const id of ids) {
      const h = this.peek(prefix + id);
      if (h) { this.stats.hits++; if (h.value != null) out[id] = h.value; if (!h.fresh) need.push(id); } else need.push(id);
    }
    const missing = need.filter((id) => !(id in out));
    const refresh = need.filter((id) => id in out); // périmées : servies maintenant, rafraîchies sans attendre
    const fetchAndStore = async (list) => {
      if (!list.length) return {};
      const key = prefix + "§" + list.slice().sort().join(",");
      const got = (await this.once(key, () => fetchMany(list))) || {};
      for (const id of list) {
        if (got[id] != null) this.set(prefix + id, got[id], ttl, stale);
        else if (!this.peek(prefix + id)) this.set(prefix + id, null, missTtl, missTtl);
      }
      return got;
    };
    if (refresh.length) fetchAndStore(refresh).catch(() => {});
    if (missing.length) {
      this.stats.misses += missing.length;
      const got = await fetchAndStore(missing);
      for (const id of missing) if (got[id] != null) out[id] = got[id];
    }
    return out;
  }

  /** Oublie une entrée, ou toutes celles d'un préfixe (« avatar: »). */
  drop(prefix) {
    let n = 0;
    for (const k of [...this.mem.keys()]) if (k === prefix || k.startsWith(prefix)) { this.mem.delete(k); n++; }
    if (n) this._dirty();
    return n;
  }
  clear() { const n = this.mem.size; this.mem.clear(); this.inflight.clear(); if (this.storage) this.storage.set(FILE, { e: {} }); return n; }

  info() {
    const groups = {};
    let disk = 0, bytes = 0;
    for (const [k, e] of this.mem) {
      const g = k.split(":")[0]; groups[g] = (groups[g] || 0) + 1;
      if (this.persist(k)) { disk++; try { bytes += k.length + JSON.stringify(e.v).length + 30; } catch (_) {} }
    }
    const asked = this.stats.hits + this.stats.stale + this.stats.misses;
    return { entries: this.mem.size, disk, bytes, groups, hitRate: asked ? Math.round(((this.stats.hits + this.stats.stale) / asked) * 100) : null, stats: Object.assign({}, this.stats) };
  }
}

module.exports = { Cache };

"use strict";
// Personnalisation du client Roblox : son de mort, police, curseurs.
// Chaque fichier d'origine est sauvegardé avant remplacement ; tout est restaurable.
// Les mises à jour de Roblox remplacent ces fichiers : Batblox peut les réappliquer.
const fs = require("fs");
const path = require("path");

const KINDS = {
  sound: { label: "Son de mort", exts: [".ogg"], targets: () => ["content/sounds/ouch.ogg"] },
  font: { label: "Police", exts: [".ttf", ".otf"], targets: (dir) => listFonts(dir) },
  cursor: { label: "Curseurs", exts: [".png"], targets: () => ["content/textures/Cursors/KeyboardMouse/ArrowCursor.png", "content/textures/Cursors/KeyboardMouse/ArrowFarCursor.png"] }
};
const CURSOR_NAMES = ["ArrowCursor.png", "ArrowFarCursor.png", "IBeamCursor.png"];

function listFonts(dir) {
  try { return fs.readdirSync(path.join(dir, "content", "fonts")).filter((f) => /\.(ttf|otf)$/i.test(f)).map((f) => "content/fonts/" + f); } catch (_) { return []; }
}

class Customization {
  constructor({ storage, launcher, logger, dataDir }) {
    this.storage = storage; this.launcher = launcher; this.log = logger;
    this.backupDir = path.join(dataDir, "sauvegardes-roblox");
    this.reg = storage.get("custom", () => ({ applied: {} }));
    if (!this.reg.applied) this.reg.applied = {};
  }

  _save() { this.storage.set("custom", this.reg); }
  _version() { return this.launcher.install(); }
  _bak(version, rel) { return path.join(this.backupDir, version, rel); }

  /** Remplace chaque cible par `src`, après avoir sauvegardé l'original une seule fois. */
  _replace(inst, rels, srcFor) {
    const done = [];
    for (const rel of rels) {
      const target = path.join(inst.dir, rel);
      if (!fs.existsSync(target)) continue;
      const bak = this._bak(inst.version, rel);
      if (!fs.existsSync(bak)) { fs.mkdirSync(path.dirname(bak), { recursive: true }); fs.copyFileSync(target, bak); }
      const src = srcFor(rel);
      if (!src) continue;
      fs.copyFileSync(src, target);
      done.push(rel);
    }
    return done;
  }

  apply(kind, sources) {
    const k = KINDS[kind];
    if (!k) throw new Error("Type de personnalisation inconnu.");
    const inst = this._version();
    if (!inst) throw new Error("Roblox n'est pas installé.");
    const files = [].concat(sources || []).filter(Boolean);
    if (!files.length) throw new Error("Choisis d'abord un fichier.");
    for (const f of files) {
      if (!k.exts.includes(path.extname(f).toLowerCase())) throw new Error(`Format non accepté pour « ${k.label} » : ${k.exts.join(", ")}.`);
      if (!fs.existsSync(f)) throw new Error("Fichier introuvable.");
      if (fs.statSync(f).size > 30 * 1048576) throw new Error("Fichier trop volumineux (30 Mo maximum).");
    }
    const rels = k.targets(inst.dir);
    let src;
    if (kind === "cursor" && files.length > 1) {
      const byName = {}; for (const f of files) byName[path.basename(f).toLowerCase()] = f;
      rels.push(...CURSOR_NAMES.filter((n) => byName[n.toLowerCase()]).map((n) => "content/textures/Cursors/KeyboardMouse/" + n));
      const uniq = [...new Set(rels)];
      rels.length = 0; rels.push(...uniq);
      src = (rel) => byName[path.basename(rel).toLowerCase()] || null;
    } else {
      src = () => files[0];
    }
    const done = this._replace(inst, rels, src);
    if (!done.length) throw new Error("Aucun fichier à remplacer n'a été trouvé dans cette version de Roblox.");
    this.reg.applied[kind] = { version: inst.version, files: done, sources: files, at: Date.now(), active: true };
    this._save();
    this.log.info(`Personnalisation « ${k.label} » appliquée (${done.length} fichier(s))`);
    return this.status();
  }

  restore(kind) {
    const a = this.reg.applied[kind];
    if (!a) return this.status();
    const inst = this._version();
    if (inst && inst.version === a.version) {
      for (const rel of a.files) {
        const bak = this._bak(a.version, rel);
        try { if (fs.existsSync(bak)) fs.copyFileSync(bak, path.join(inst.dir, rel)); } catch (e) { this.log.warn("Restauration impossible : " + rel); }
      }
    }
    a.active = false; // la source reste connue : on peut la réappliquer
    this._save();
    this.log.info(`Personnalisation « ${KINDS[kind].label} » désactivée`);
    return this.status();
  }

  restoreAll() { for (const k of Object.keys(this.reg.applied)) if (this.reg.applied[k].active) this.restore(k); return this.status(); }

  forget(kind) { this.restore(kind); delete this.reg.applied[kind]; this._save(); return this.status(); }

  /** Après une mise à jour de Roblox, les fichiers d'origine sont revenus : on réapplique ce qui était actif. */
  reapplyIfNeeded() {
    const inst = this._version();
    if (!inst) return [];
    const redone = [];
    for (const [kind, a] of Object.entries(this.reg.applied)) {
      if (!a.active || a.version === inst.version) continue;
      try { this.apply(kind, a.sources); redone.push(kind); } catch (e) { this.log.warn(`Réapplication impossible (${kind}) : ${e.message}`); }
    }
    return redone;
  }

  modifiedFiles() {
    const inst = this._version();
    const out = [];
    for (const [kind, a] of Object.entries(this.reg.applied)) if (a.active && inst && a.version === inst.version) for (const f of a.files) out.push({ kind, file: f });
    return out;
  }

  status() {
    const inst = this._version();
    const out = { installed: !!inst, version: inst ? inst.version : null, items: {} };
    for (const [kind, k] of Object.entries(KINDS)) {
      const a = this.reg.applied[kind];
      out.items[kind] = {
        label: k.label, exts: k.exts,
        active: !!(a && a.active && inst && a.version === inst.version),
        outdated: !!(a && a.active && inst && a.version !== inst.version),
        source: a ? a.sources.map((s) => path.basename(s)) : [], files: a ? a.files.length : 0
      };
    }
    return out;
  }
}

module.exports = { Customization, KINDS, CURSOR_NAMES };

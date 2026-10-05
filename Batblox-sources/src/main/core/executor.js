"use strict";
// Exécuteur : un lanceur de logiciels 100 % choisis par l'utilisateur (calculatrice, bloc-notes, etc.).
// La liste est VIDE par défaut : Batblox n'y ajoute jamais rien de lui-même.
// Sécurité : l'interface ne transmet jamais de chemin pour lancer ; elle envoie seulement l'identifiant
// d'un élément que l'utilisateur a lui-même ajouté, et le chemin est relu ici depuis la liste enregistrée.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const MAX_ITEMS = 100;
const ALLOWED_EXT = [".exe", ".lnk", ".bat", ".cmd"];
const NAME_MAX = 60;

// Chemin absolu Windows (C:\...) ou UNC (\\serveur\...), avec une extension autorisée.
const WIN_PATH_RE = /^(?:[A-Za-z]:\\|\\\\[^\\/:*?"<>|\0]+\\)[^\0*?"<>|]{1,400}$/;

function extOf(p) { return path.win32.extname(String(p || "")).toLowerCase(); }

function validPath(p) {
  const s = String(p || "").trim();
  if (!WIN_PATH_RE.test(s)) return false;
  if (s.split("\\").includes("..")) return false;
  return ALLOWED_EXT.includes(extOf(s));
}

function defaultName(p) {
  return path.win32.basename(String(p), extOf(p)).slice(0, NAME_MAX) || "Logiciel";
}

function cleanName(n, fallback) {
  const s = String(n == null ? "" : n).replace(/[\u0000-\u001f]/g, "").trim().slice(0, NAME_MAX);
  return s || fallback;
}

const samePath = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

class Executor {
  /**
   * @param storage   Storage de l'application
   * @param openPath  (chemin) => Promise<string>  — vide si OK, sinon message d'erreur (comme shell.openPath)
   * @param getIcon   (chemin) => Promise<string|null> — icône du logiciel en data:URL (facultatif)
   * @param exists    (chemin) => boolean (facultatif, pour les tests)
   */
  constructor({ storage, openPath, getIcon, exists, logger }) {
    this.storage = storage;
    this.openPath = openPath;
    this.getIcon = getIcon || (async () => null);
    this.exists = exists || ((p) => { try { return fs.existsSync(p); } catch (_) { return false; } });
    this.logger = logger || { info() {}, warn() {}, error() {} };
    this.icons = new Map(); // chemin (minuscules) -> data:URL ou null
    this.data = this._load();
  }

  _load() {
    const raw = this.storage.get("executor", () => ({ items: [] }));
    const items = Array.isArray(raw && raw.items) ? raw.items : [];
    const seen = new Set(), clean = [];
    for (const it of items) {
      if (!it || !validPath(it.path) || seen.has(String(it.path).toLowerCase())) continue;
      seen.add(String(it.path).toLowerCase());
      clean.push({ id: /^[a-f0-9]{16}$/.test(String(it.id)) ? String(it.id) : crypto.randomBytes(8).toString("hex"), name: cleanName(it.name, defaultName(it.path)), path: String(it.path).trim() });
    }
    const data = { items: clean.slice(0, MAX_ITEMS) };
    this.storage.set("executor", data);
    return data;
  }

  _save() { this.storage.set("executor", this.data); }

  async list() {
    const out = [];
    for (const it of this.data.items) {
      const key = it.path.toLowerCase();
      if (!this.icons.has(key)) {
        let ic = null;
        try { ic = this.exists(it.path) ? await this.getIcon(it.path) : null; } catch (_) { ic = null; }
        this.icons.set(key, ic || null);
      }
      out.push({ id: it.id, name: it.name, path: it.path, icon: this.icons.get(key), found: this.exists(it.path) });
    }
    return out;
  }

  /** Ajoute les chemins choisis par l'utilisateur. Renvoie { added, skipped } (skipped = raisons, en français). */
  add(paths) {
    const added = [], skipped = [];
    for (const raw of Array.isArray(paths) ? paths : [paths]) {
      const p = String(raw || "").trim();
      const nm = path.win32.basename(p) || p;
      if (!validPath(p)) { skipped.push(`« ${nm} » : seuls les programmes (.exe), raccourcis (.lnk) et scripts (.bat, .cmd) sont acceptés.`); continue; }
      if (this.data.items.some((i) => samePath(i.path, p))) { skipped.push(`« ${nm} » est déjà dans l'exécuteur.`); continue; }
      if (this.data.items.length >= MAX_ITEMS) { skipped.push(`Limite de ${MAX_ITEMS} logiciels atteinte.`); break; }
      const item = { id: crypto.randomBytes(8).toString("hex"), name: defaultName(p), path: p };
      this.data.items.push(item);
      added.push(item.id);
    }
    if (added.length) this._save();
    return { added, skipped };
  }

  rename(id, name) {
    const it = this._find(id);
    it.name = cleanName(name, defaultName(it.path));
    this._save();
    return it.name;
  }

  remove(id) {
    const i = this.data.items.findIndex((x) => x.id === String(id));
    if (i < 0) throw new Error("Ce logiciel n'est plus dans la liste.");
    this.data.items.splice(i, 1);
    this._save();
    return true;
  }

  /** Décale un logiciel de `delta` places (-1 = plus tôt, +1 = plus tard). */
  move(id, delta) {
    const i = this.data.items.findIndex((x) => x.id === String(id));
    if (i < 0) throw new Error("Ce logiciel n'est plus dans la liste.");
    const j = Math.max(0, Math.min(this.data.items.length - 1, i + (Number(delta) < 0 ? -1 : 1)));
    if (j !== i) { const [it] = this.data.items.splice(i, 1); this.data.items.splice(j, 0, it); this._save(); }
    return true;
  }

  /** Lance un logiciel de la liste (jamais un chemin venu de l'interface). */
  async launch(id) {
    const it = this._find(id);
    if (!this.exists(it.path)) throw new Error(`« ${it.name} » est introuvable à l'emplacement enregistré (${it.path}). Supprime-le puis ajoute-le de nouveau.`);
    const err = await this.openPath(it.path);
    if (err) { this.logger.warn(`Exécuteur : échec du lancement de ${it.name} : ${err}`); throw new Error(`Impossible de lancer « ${it.name} » : ${err}`); }
    return it.name;
  }

  pathOf(id) { return this._find(id).path; }

  _find(id) {
    const it = this.data.items.find((x) => x.id === String(id));
    if (!it) throw new Error("Ce logiciel n'est plus dans la liste.");
    return it;
  }
}

module.exports = { Executor, validPath, defaultName, ALLOWED_EXT, MAX_ITEMS };

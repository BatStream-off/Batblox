"use strict";
// Mise à jour automatique depuis les « Releases » GitHub du dépôt BatStream-off/Batblox.
// Aucune dépendance : la logique (versions, choix du fichier, vérification) est ici et testable ;
// le réseau, le dossier de téléchargement et le lancement de l'installeur sont injectés par main.js.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const REPO = { owner: "BatStream-off", name: "Batblox" };
const API_LATEST = `https://api.github.com/repos/${REPO.owner}/${REPO.name}/releases/latest`;
const RELEASES_PAGE = `https://github.com/${REPO.owner}/${REPO.name}/releases/latest`;
const DOWNLOAD_PREFIX = `https://github.com/${REPO.owner}/${REPO.name}/releases/download/`;
const CHECK_TTL_MS = 10 * 60 * 1000;           // une vérification est mémorisée 10 min (l'API GitHub limite à 60 appels/h sans compte)
const MAX_INSTALLER_BYTES = 400 * 1048576;     // garde-fou : un installeur plus gros est refusé

/** « v1.5.0 », « 1.5 » → [1, 5, 0] ; null si ce n'est pas une version. Les suffixes (-beta) sont ignorés. */
function parseVersion(v) {
  const m = /^v?(\d{1,4})(?:\.(\d{1,4}))?(?:\.(\d{1,4}))?(?:[-+].*)?$/i.exec(String(v || "").trim());
  return m ? [Number(m[1]), Number(m[2] || 0), Number(m[3] || 0)] : null;
}
/** 1 si a > b, -1 si a < b, 0 si égales ; null si l'une n'est pas valide. */
function compareVersions(a, b) {
  const x = parseVersion(a), y = parseVersion(b);
  if (!x || !y) return null;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
  return 0;
}

/** Choisit l'installeur Windows (NSIS) dans les fichiers d'une release ; jamais la version portable. */
function pickInstaller(assets) {
  const list = (Array.isArray(assets) ? assets : []).filter((a) => a && typeof a.name === "string" && typeof a.browser_download_url === "string");
  const exe = list.filter((a) => /\.exe$/i.test(a.name) && !/portable|blockmap/i.test(a.name));
  const pick = exe.find((a) => /setup/i.test(a.name)) || exe[0];
  return pick && pick.browser_download_url.startsWith(DOWNLOAD_PREFIX) ? pick : null;
}

/** Texte brut et court pour les notes de version (pas de HTML ni de Markdown lourd). */
function cleanNotes(body) {
  return String(body || "").replace(/\r/g, "").replace(/<[^>]*>/g, "").replace(/[#*_`>]/g, "").trim().slice(0, 1200);
}

class Updater {
  /**
   * @param {object} o
   * @param {string} o.currentVersion version de l'application
   * @param {(url:string)=>Promise<any>} o.getJson lit du JSON (https)
   * @param {(url:string, dest:string, onProgress?:Function)=>Promise<{bytes:number}>} o.download télécharge vers un fichier
   * @param {string} o.dir dossier de téléchargement
   * @param {(file:string)=>Promise<void>|void} o.launch lance l'installeur (puis l'application se ferme)
   * @param {(url:string)=>void} o.openPage ouvre une page web
   * @param {boolean} o.portable vrai pour la version portable (pas d'installeur à lancer)
   * @param {boolean} o.windows
   */
  constructor(o) {
    this.o = o;
    this.log = o.logger || { info() {}, warn() {}, error() {} };
    this.cache = null;
    this.busy = false;
    this.progress = null;
  }

  state() {
    const c = this.cache;
    return { current: this.o.currentVersion, windows: !!this.o.windows, portable: !!this.o.portable, busy: this.busy, progress: this.progress,
      checkedAt: c ? c.at : null, available: !!(c && c.available), latest: c && c.available ? c.latest : null, error: c ? c.error || null : null };
  }

  /** Interroge GitHub. `force` ignore la mémoire de 10 min. Ne lève jamais : l'erreur est dans le résultat. */
  async check({ force } = {}) {
    const now = Date.now();
    if (!force && this.cache && !this.cache.error && now - this.cache.at < CHECK_TTL_MS) return this.state();
    let entry = { at: now, available: false, latest: null, error: null };
    try {
      const j = await this.o.getJson(API_LATEST);
      if (!j || typeof j !== "object" || j.draft || j.prerelease) throw new Error("Aucune version publiée pour le moment.");
      const tag = String(j.tag_name || "");
      const cmp = compareVersions(tag, this.o.currentVersion);
      if (cmp === null) throw new Error("Numéro de version inattendu sur GitHub.");
      if (cmp > 0) {
        const asset = pickInstaller(j.assets);
        entry.available = true;
        entry.latest = {
          version: parseVersion(tag).join("."), tag, notes: cleanNotes(j.body), publishedAt: j.published_at || null,
          page: typeof j.html_url === "string" && j.html_url.startsWith(`https://github.com/${REPO.owner}/${REPO.name}/`) ? j.html_url : RELEASES_PAGE,
          installer: asset ? { name: asset.name, size: Number(asset.size) || 0, digest: /^sha256:[0-9a-f]{64}$/i.test(asset.digest || "") ? asset.digest.slice(7).toLowerCase() : null, url: asset.browser_download_url } : null
        };
      }
    } catch (e) {
      entry.error = e && e.status === 403 ? "GitHub limite les demandes pour le moment : réessaie dans quelques minutes."
        : e && e.status === 404 ? "Aucune version publiée sur GitHub pour le moment."
        : (e && e.message) || "Impossible de contacter GitHub.";
      this.log.warn("Mise à jour : " + entry.error);
    }
    this.cache = entry;
    return this.state();
  }

  /** Télécharge l'installeur de la dernière version, vérifie son empreinte puis le lance. */
  async install() {
    if (this.busy) throw new Error("Une mise à jour est déjà en cours.");
    const st = await this.check({ force: true });
    if (st.error) throw new Error(st.error);
    if (!st.available) return { ok: true, already: true };
    const L = st.latest;
    // Version portable ou installeur introuvable : on ouvre la page de la release (téléchargement manuel).
    if (this.o.portable || !this.o.windows || !L.installer) { this.o.openPage(L.page); return { ok: true, manual: true, version: L.version }; }
    this.busy = true; this.progress = 0;
    const file = path.join(this.o.dir, L.installer.name.replace(/[^\w.\- ]/g, "_"));
    try {
      fs.mkdirSync(this.o.dir, { recursive: true });
      try { fs.rmSync(file, { force: true }); } catch (_) {}
      await this.o.download(L.installer.url, file, (p) => { this.progress = p; });
      const size = fs.statSync(file).size;
      if (!size || size > MAX_INSTALLER_BYTES || (L.installer.size && size !== L.installer.size)) throw new Error("Le fichier téléchargé est incomplet. Réessaie.");
      if (L.installer.digest) {
        const hash = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
        if (hash !== L.installer.digest) { fs.rmSync(file, { force: true }); throw new Error("Le fichier téléchargé ne correspond pas à l'empreinte publiée par GitHub : installation annulée."); }
      }
      this.log.info(`Mise à jour ${L.version} téléchargée (${size} octets) : lancement de l'installeur`);
      await this.o.launch(file);
      return { ok: true, launched: true, version: L.version };
    } finally { this.busy = false; this.progress = null; }
  }
}

module.exports = { Updater, parseVersion, compareVersions, pickInstaller, cleanNotes, REPO, API_LATEST, RELEASES_PAGE };

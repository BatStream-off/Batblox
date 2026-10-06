"use strict";
// Maintenance : cache Roblox, vérification de l'installation. Aucune valeur n'est affichée sans avoir été réellement mesurée.
const fs = require("fs");
const path = require("path");

const fsp = fs.promises;

// Limiteur de concurrence : évite de saturer le disque (et la file d'attente de libuv) sur un cache de plusieurs milliers de fichiers.
function limiter(n) {
  let active = 0; const q = [];
  const next = () => { if (active >= n || !q.length) return; active++; const { fn, res, rej } = q.shift(); fn().then(res, rej).finally(() => { active--; next(); }); };
  return (fn) => new Promise((res, rej) => { q.push({ fn, res, rej }); next(); });
}

// Mesure asynchrone : ne bloque plus le processus principal (l'ancienne version synchrone figeait toute l'application pendant le scan).
async function dirSize(dir, limit = 200000) {
  let total = 0, count = 0;
  const io = limiter(48);
  const walk = async (d) => {
    let items = [];
    try { items = await io(() => fsp.readdir(d, { withFileTypes: true })); } catch (_) { return; }
    const subs = [], files = [];
    for (const it of items) {
      if (count++ > limit) break;
      (it.isDirectory() ? subs : files).push(path.join(d, it.name));
    }
    await Promise.all([
      ...files.map(async (f) => { try { const st = await io(() => fsp.stat(f)); total += st.size; } catch (_) {} }),
      ...subs.map(walk)
    ]);
  };
  await walk(dir);
  return total;
}

const exists = (p) => fsp.access(p).then(() => true, () => false);
const INFO_TTL = 30 * 1000; // la taille du cache change lentement : inutile de tout re-scanner à chaque visite de la page

class Maintenance {
  constructor({ env = process.env, launcher, accounts, logger, getSettings }) {
    this.env = env; this.launcher = launcher; this.accounts = accounts; this.log = logger; this.getSettings = getSettings;
    this._info = null; this._infoTs = 0; this._infoP = null;
  }

  cacheTargets() {
    const local = this.env.LOCALAPPDATA;
    if (!local) return [];
    return [
      { id: "logs", label: "Journaux de Roblox", dir: path.join(local, "Roblox", "logs") },
      { id: "temp", label: "Fichiers temporaires de Roblox", dir: path.join(local, "Temp", "Roblox") },
      { id: "stockage", label: "Cache de ressources (rbx-storage)", dir: path.join(local, "Roblox", "rbx-storage") }
    ];
  }

  /** Taille des caches (asynchrone, dossiers mesurés en parallèle, résultat gardé 30 s ; `force` pour recalculer). */
  async cacheInfo(force) {
    if (!force && this._info && Date.now() - this._infoTs < INFO_TTL) return this._info;
    if (!force && this._infoP) return this._infoP;
    const p = (async () => {
      const items = await Promise.all(this.cacheTargets().map(async (t) => {
        const ex = await exists(t.dir);
        return { id: t.id, label: t.label, exists: ex, bytes: ex ? await dirSize(t.dir) : 0 };
      }));
      const info = { items, total: items.reduce((s, i) => s + i.bytes, 0) };
      this._info = info; this._infoTs = Date.now();
      return info;
    })();
    this._infoP = p;
    try { return await p; } finally { if (this._infoP === p) this._infoP = null; }
  }

  async clean(ids) {
    const procs = await this.launcher.processes();
    if (procs.length) throw new Error("Ferme d'abord Roblox avant de nettoyer le cache.");
    let freed = 0, failed = 0;
    const io = limiter(16);
    for (const t of this.cacheTargets()) {
      if (ids && !ids.includes(t.id)) continue;
      let items = [];
      try { items = await fsp.readdir(t.dir); } catch (_) { continue; }
      await Promise.all(items.map((n) => io(async () => {
        const p = path.join(t.dir, n);
        let size = 0;
        try { const st = await fsp.stat(p); size = st.isDirectory() ? await dirSize(p) : st.size; } catch (_) {}
        try { await fsp.rm(p, { recursive: true, force: true }); freed += size; } catch (_) { failed++; }
      })));
    }
    this._info = null; this._infoTs = 0;
    this.log.info(`Cache nettoyé : ${Math.round(freed / 1048576)} Mo libérés, ${failed} élément(s) ignoré(s)`);
    return { freed, failed };
  }

  async autoClean() {
    const M = this.getSettings().maintenance;
    if (!M.autoClean) return null;
    const info = await this.cacheInfo(true);
    if (info.total < (Number(M.autoCleanMb) || 500) * 1048576) return null;
    try { return await this.clean(null); } catch (_) { return null; }
  }

  /**
   * Vérification de l'installation. Chaque contrôle est réellement exécuté ; le pourcentage est le nombre
   * de contrôles réussis sur le nombre de contrôles effectués. Il ne s'agit PAS d'une vérification de hachage fichier par fichier.
   */
  async integrity(customization) {
    const checks = [];
    const add = (id, label, ok, detail) => checks.push({ id, label, state: ok === null ? "inconnu" : ok ? "ok" : "manquant", detail: detail || "" });
    const inst = this.launcher.install();
    // La seule étape lente est la requête réseau de version : on la lance tout de suite (elle tourne pendant les contrôles disque) avec un délai maximal.
    const latestP = !inst ? Promise.resolve(null) : new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 6000);
      (async () => { const acc = this.accounts.active(); const c = acc ? this.accounts.client(acc.id) : null; return c ? c.latestClientVersion() : null; })()
        .then((v) => { clearTimeout(timer); resolve(v); }, () => { clearTimeout(timer); resolve(null); });
    });
    add("install", "Roblox est installé", !!inst, inst ? inst.version : "Aucune installation trouvée");
    if (inst) {
      add("exe", "Exécutable du client présent", fs.existsSync(inst.exe));
      for (const d of ["content", "PlatformContent", "shaders"]) add("dir-" + d, `Dossier « ${d} » présent`, fs.existsSync(path.join(inst.dir, d)));
      add("ssl", "Certificats (ssl/cacert.pem) présents", fs.existsSync(path.join(inst.dir, "ssl", "cacert.pem")));
      const latest = await latestP;
      if (latest) add("version", "Version à jour", latest === inst.version, latest === inst.version ? "Version officielle" : `Installée : ${inst.version} · officielle : ${latest}`);
      else add("version", "Version à jour", null, "Version officielle non vérifiée (réseau ou compte indisponible)");
    }
    const modified = customization ? customization.modifiedFiles() : [];
    const results = checks.filter((c) => c.state !== "inconnu");
    const okCount = results.filter((c) => c.state === "ok").length;
    return {
      checks, modified,
      ok: okCount, total: results.length,
      percent: results.length ? Math.round((okCount / results.length) * 100) : null,
      state: !inst ? "Fichier manquant" : results.some((c) => c.state === "manquant") ? "Fichier manquant" : modified.length ? "Fichier modifié" : "OK",
      checkedAt: Date.now()
    };
  }

  /** Réparation par les moyens officiels : restaure les fichiers personnalisés, puis relance l'installeur officiel de Roblox. */
  async repair(customization, openExternal, openPath) {
    const steps = [];
    if (customization && customization.modifiedFiles().length) { customization.restoreAll(); steps.push("Fichiers personnalisés restaurés."); }
    const inst = this.launcher.install();
    const installer = inst ? path.join(inst.root, "RobloxPlayerInstaller.exe") : null;
    if (installer && fs.existsSync(installer)) { await openPath(installer); steps.push("Installeur officiel de Roblox lancé."); }
    else { await openExternal("https://www.roblox.com/download"); steps.push("Page de téléchargement officielle de Roblox ouverte."); }
    this.log.info("Réparation : " + steps.join(" "));
    return steps;
  }
}

module.exports = { Maintenance, dirSize };

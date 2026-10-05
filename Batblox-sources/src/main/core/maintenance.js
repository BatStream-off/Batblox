"use strict";
// Maintenance : cache Roblox, vérification de l'installation. Aucune valeur n'est affichée sans avoir été réellement mesurée.
const fs = require("fs");
const path = require("path");

function dirSize(dir, limit = 200000) {
  let total = 0, count = 0;
  const walk = (d) => {
    let items = [];
    try { items = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const it of items) {
      if (count++ > limit) return;
      const p = path.join(d, it.name);
      try { if (it.isDirectory()) walk(p); else total += fs.statSync(p).size; } catch (_) {}
    }
  };
  walk(dir);
  return total;
}

class Maintenance {
  constructor({ env = process.env, launcher, accounts, logger, getSettings }) {
    this.env = env; this.launcher = launcher; this.accounts = accounts; this.log = logger; this.getSettings = getSettings;
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

  cacheInfo() {
    const items = this.cacheTargets().map((t) => ({ id: t.id, label: t.label, exists: fs.existsSync(t.dir), bytes: fs.existsSync(t.dir) ? dirSize(t.dir) : 0 }));
    return { items, total: items.reduce((s, i) => s + i.bytes, 0) };
  }

  async clean(ids) {
    const procs = await this.launcher.processes();
    if (procs.length) throw new Error("Ferme d'abord Roblox avant de nettoyer le cache.");
    let freed = 0, failed = 0;
    for (const t of this.cacheTargets()) {
      if (ids && !ids.includes(t.id)) continue;
      let items = [];
      try { items = fs.readdirSync(t.dir); } catch (_) { continue; }
      for (const n of items) {
        const p = path.join(t.dir, n);
        let size = 0;
        try { const st = fs.statSync(p); size = st.isDirectory() ? dirSize(p) : st.size; } catch (_) {}
        try { fs.rmSync(p, { recursive: true, force: true }); freed += size; } catch (_) { failed++; }
      }
    }
    this.log.info(`Cache nettoyé : ${Math.round(freed / 1048576)} Mo libérés, ${failed} élément(s) ignoré(s)`);
    return { freed, failed };
  }

  async autoClean() {
    const M = this.getSettings().maintenance;
    if (!M.autoClean) return null;
    const info = this.cacheInfo();
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
    add("install", "Roblox est installé", !!inst, inst ? inst.version : "Aucune installation trouvée");
    if (inst) {
      add("exe", "Exécutable du client présent", fs.existsSync(inst.exe));
      for (const d of ["content", "PlatformContent", "shaders"]) add("dir-" + d, `Dossier « ${d} » présent`, fs.existsSync(path.join(inst.dir, d)));
      add("ssl", "Certificats (ssl/cacert.pem) présents", fs.existsSync(path.join(inst.dir, "ssl", "cacert.pem")));
      let latest = null;
      try { const acc = this.accounts.active(); const c = acc ? this.accounts.client(acc.id) : null; if (c) latest = await c.latestClientVersion(); } catch (_) {}
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

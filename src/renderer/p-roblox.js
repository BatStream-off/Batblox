"use strict";

// ---------------------------------------------------------------- Roblox (lanceur)
B.pages.roblox = {
  async render(view) {
    const p = (this.root = h("div", { class: "page" }));
    view.append(p);
    const a = B.S.active;
    p.append(h("header", {}, h("div", {}, h("h1", {}, "Roblox"), h("div", { class: "muted" }, a ? "Compte utilisé pour le lancement : " + a.label : "Aucun compte actif")),
      h("div", { class: "actions" }, h("button", { class: "btn", onclick: () => this.refresh() }, "🔄 Actualiser"))));
    if (!B.S.windows) p.append(h("div", { class: "notice" }, "Le lanceur fonctionne uniquement sous Windows. Les autres fonctions de Batblox restent disponibles."));
    p.append(h("div", { class: "card", id: "r-client" }), h("div", { class: "card", id: "r-status" }));
    await this.refresh();
  },
  drawClient(s) {
    const box = B.$("#r-client"); if (!box) return; B.clear(box);
    const cur = s.client || "auto";
    const opts = [{ id: "auto", name: "Automatique", found: true }].concat(s.clients, [{ id: "custom", name: "Personnalisé…", found: true }]);
    const apply = async (o) => {
      if (o.id === "custom") { const p = await B.run(() => B.call("launcher:pickExe")); if (!p) return; await B.set({ launcher: { client: "custom", customExe: p } }); }
      else await B.set({ launcher: { client: o.id } });
      this.refresh();
    };
    const hint = { auto: "Windows ouvre le lanceur déjà associé à Roblox (Roblox officiel, ou Bloxstrap s'il est installé).", roblox: "Démarre directement le client officiel, même si Bloxstrap est installé.", custom: s.customExe ? "Programme : " + s.customExe : "Choisis le .exe d'un autre lanceur (il reçoit le lien de lancement en argument)." }[cur]
      || "Batblox démarre ce lanceur, qui ouvre ensuite Roblox (il peut vérifier ses mises à jour d'abord : jusqu'à 30 s).";
    box.append(h("h2", {}, "Lanceur utilisé"),
      h("div", { class: "chips" }, opts.map((o) => h("button", { class: "chip" + (cur === o.id ? " on" : ""), disabled: !o.found, title: o.found ? "" : "Non détecté sur ce PC", onclick: () => apply(o) },
        o.name + (!["auto", "custom"].includes(o.id) ? (o.found ? " ✓" : " (non détecté)") : "")))),
      h("div", { class: "muted small", style: "margin-top:10px" }, hint),
      s.chosenOk === false ? h("div", { class: "notice bad", style: "margin-top:10px" }, "Ce lanceur est introuvable : choisis-en un autre ou repasse sur « Automatique ».") : null,
      h("div", { class: "muted small", style: "margin-top:8px" }, "Fishstrap, Voidstrap et les autres se détectent s'ils sont dans %LOCALAPPDATA%. Pour tout autre lanceur, utilise « Personnalisé… »."));
  },
  async drawUpdate(force) {
    const u = await B.run(() => B.call("roblox:updateCheck", { force: !!force }));
    const box = B.$("#r-update"); if (!u || !box || !u.supported) return;
    B.clear(box);
    const cur = (B.S.settings.launcher || {}).client || "auto";
    const via = { auto: "le lien officiel de Roblox", roblox: "le lien officiel de Roblox" }[cur] || "ton lanceur (" + cur + ")";
    const fmt = (g) => (g || "").replace(/^version-/, "").slice(0, 8);
    const busy = !!u.updating || !!this.updating;
    const state = busy ? "⏳ Mise à jour en cours… (une à deux minutes)" : u.upToDate === true ? "✅ Roblox est à jour" : u.upToDate === false ? "⬆️ Mise à jour disponible" : "ℹ️ Version non vérifiable";
    const go = async () => {
      try { await B.updateRoblox(u.running, () => this.drawUpdate(false), () => { this.updating = true; this.drawUpdate(false); }); }
      finally { this.updating = false; this.refresh(); }
    };
    box.append(h("h3", {}, "Mise à jour"), h("div", { class: "row wrap rb-upd" }, h("b", { class: "rb-state" }, state),
      h("button", { class: "btn sm ghost", disabled: busy, onclick: () => this.drawUpdate(true) }, "Revérifier"),
      h("button", { class: "btn" + (u.upToDate === false ? " pri" : ""), disabled: busy || u.upToDate === true || !u.latest, title: u.upToDate === true ? "Déjà à jour" : "", onclick: go }, "Mettre à jour Roblox")),
      h("div", { class: "muted small", style: "margin-top:6px" }, u.latest ? `Installée : ${fmt(u.installed && u.installed.guid) || "?"} · Dernière version : ${fmt(u.latest.guid)}${u.latest.version ? " (" + u.latest.version + ")" : ""}` : (u.error || "")),
      h("div", { class: "muted small", style: "margin-top:4px" }, `La mise à jour passe par ${via} : Roblox se met à jour puis s'ouvre (tu peux le fermer ensuite). Si Roblox est ouvert, Batblox te proposera de le fermer d'abord.`));
  },
  async refresh() {
    const box = B.$("#r-status"); if (!box) return;
    const s = await B.run(() => B.call("roblox:status")); if (!s) return;
    this.drawClient(s);
    B.clear(box);
    box.append(h("h2", {}, "Client Roblox"), h("div", { class: "row" }, h("span", { class: "dot " + (s.installed ? "on" : "err") }), s.installed ? "Roblox détecté (" + s.version + ")" : "Roblox n'est pas installé"));
    if (s.windows && s.installed) { box.append(h("div", { id: "r-update", style: "margin-top:14px" })); this.drawUpdate(false); }
    box.append(h("h3", { style: "margin-top:14px" }, `Instances ouvertes : ${s.instances.length}`));
    if (!s.instances.length) box.append(h("div", { class: "muted small" }, "Aucune instance de Roblox en cours d'exécution."));
    for (const i of s.instances) box.append(h("div", { class: "item" }, h("div", { class: "main" }, h("b", {}, "Roblox — processus " + i.pid), h("span", { class: "muted small" }, B.bytes(i.memKb * 1024) + " de mémoire")),
      h("button", { class: "btn sm", onclick: async () => { await B.run(() => B.call("roblox:close", { pid: i.pid })); setTimeout(() => this.refresh(), 800); } }, "Fermer"),
      h("button", { class: "btn sm bad", title: "Force la fermeture immédiate", onclick: async () => { if (await B.confirm("Forcer la fermeture ? Le jeu en cours sera interrompu sans sauvegarde.", "Forcer", true)) { await B.run(() => B.call("roblox:close", { pid: i.pid, force: true })); setTimeout(() => this.refresh(), 800); } } }, "Forcer")));
    if (s.instances.length > 1) box.append(h("div", { style: "margin-top:8px" }, h("button", { class: "btn bad", onclick: async () => { if (await B.confirm("Fermer toutes les instances de Roblox ?", "Tout fermer", true)) { await B.run(() => B.call("roblox:closeAll", false)); setTimeout(() => this.refresh(), 800); } } }, "Fermer toutes les instances")));
  }
};

// ---------------------------------------------------------------- Comptes
const STATUS = { ok: ["on", "Connecté"], expire: ["err", "Session expirée"], deconnecte: ["off", "Déconnecté"], erreur: ["err", "Erreur de vérification"] };
B.pages.accounts = {
  render(view) {
    const p = (this.root = h("div", { class: "page" }));
    view.append(p);
    this.draw();
  },
  onAccounts() { this.draw(); },
  draw() {
    const p = B.clear(this.root);
    p.append(h("header", {}, h("div", {}, h("h1", {}, "Comptes"), h("div", { class: "muted" }, "Le compte actif est utilisé pour la surveillance et le lancement de Roblox.")),
      h("div", { class: "actions" }, h("button", { class: "btn pri", onclick: B.addAccount }, "➕ Ajouter un compte"))));
    if (!B.S.encryption) p.append(h("div", { class: "notice bad" }, "Le chiffrement de Windows n'est pas disponible : les comptes ne peuvent pas être enregistrés de façon sécurisée."));
    p.append(h("div", { class: "notice" }, "🔒 Les sessions sont chiffrées par Windows. Elles ne sont jamais écrites en clair, ni exportées, ni envoyées à Discord ou ntfy, ni inscrites dans les journaux."));
    const list = B.S.accounts;
    if (!list.length) { p.append(h("div", { class: "card empty" }, "Aucun compte. Ajoute ton premier compte Roblox pour commencer.")); return; }
    for (const a of list) {
      const [cls, txt] = STATUS[a.status] || STATUS.erreur;
      p.append(h("div", { class: "card" }, h("div", { class: "row" }, B.avatar(a.id, a.label, "lg", a.avatarUrl),
        h("div", { class: "grow" }, h("div", { class: "row" }, h("span", { class: "dot " + cls }), h("b", {}, a.label), a.active ? h("span", { class: "pill" }, "actif") : null, a.isDefault ? h("span", { class: "pill" }, "par défaut") : null),
          h("div", { class: "muted small" }, "@" + a.name + " · " + txt + (a.checkedAt ? " · vérifié " + B.ago(a.checkedAt) : ""))),
        h("div", { class: "row wrap", style: "justify-content:flex-end" },
          a.active ? null : h("button", { class: "btn sm pri", onclick: () => B.run(() => B.call("accounts:use", a.id)) }, "Utiliser"),
          h("button", { class: "btn sm", onclick: () => this.rename(a) }, "Modifier"),
          h("button", { class: "btn sm", onclick: async () => { await B.run(() => B.call("accounts:check", a.id)); B.toast("Vérification terminée.", "ok"); } }, "Vérifier"),
          a.isDefault ? null : h("button", { class: "btn sm", onclick: () => B.run(() => B.call("accounts:default", a.id)) }, "Par défaut"),
          a.status === "ok" ? h("button", { class: "btn sm", onclick: async () => { if (await B.confirm(`Déconnecter « ${a.label} » ? Le compte reste dans la liste, mais il faudra se reconnecter.`, "Déconnecter")) B.run(() => B.call("accounts:logout", a.id)); } }, "Déconnecter")
            : h("button", { class: "btn sm pri", onclick: B.addAccount }, "Reconnecter"),
          h("button", { class: "btn sm bad", onclick: async () => { if (await B.confirm(`Supprimer « ${a.label} » de Batblox ? La session enregistrée sera effacée. Ton compte Roblox n'est pas touché.`, "Supprimer", true)) B.run(() => B.call("accounts:remove", a.id)); } }, "Supprimer")))));
    }
  },
  async rename(a) {
    const i = h("input", { type: "text", value: a.label, maxlength: 40, "aria-label": "Nom du profil" });
    const v = await B.modal({ title: "Modifier le profil", body: h("div", {}, h("label", { class: "small muted" }, "Nom du profil"), i), buttons: [{ label: "Annuler", value: null }, { label: "Enregistrer", cls: "pri", action: () => i.value }] });
    if (v) B.run(() => B.call("accounts:rename", { id: a.id, label: v }));
  }
};

// ---------------------------------------------------------------- Personnalisation
B.pages.custom = {
  chosen: {},
  async render(view) {
    const p = (this.root = h("div", { class: "page" }));
    view.append(p);
    await this.draw();
  },
  async draw() {
    const p = B.clear(this.root);
    const st = await B.run(() => B.call("custom:status"));
    p.append(h("header", {}, h("div", {}, h("h1", {}, "Personnalisation"), h("div", { class: "muted" }, "Son de mort, police et curseurs du client Roblox."))));
    p.append(h("div", { class: "notice" }, "Batblox sauvegarde chaque fichier d'origine avant de le remplacer : tu peux toujours désactiver ou restaurer. Une mise à jour de Roblox remet les fichiers d'origine (Batblox peut les réappliquer). Ces modifications portent sur des fichiers locaux de Roblox, qui ne les prend pas officiellement en charge : à utiliser en connaissance de cause."));
    if (!st || !st.installed) { p.append(h("div", { class: "card empty" }, "Roblox n'est pas installé : la personnalisation est indisponible.")); return; }
    for (const [kind, ico, hint] of [["sound", "🔊", "Format .ogg uniquement (le son « ouch » de Roblox)."], ["font", "🔤", "Format .ttf ou .otf. Remplace les polices du client."], ["cursor", "🖱", "Images .png. Choisis plusieurs fichiers nommés ArrowCursor.png, ArrowFarCursor.png, IBeamCursor.png pour un pack, ou un seul pour les deux flèches."]]) {
      const it = st.items[kind], ch = this.chosen[kind];
      const card = h("div", { class: "card" }, h("div", { class: "row" }, h("h2", { class: "grow" }, ico + " " + it.label),
        h("span", { class: "pill" }, it.active ? "✓ appliqué" : it.outdated ? "à réappliquer" : "désactivé")), h("div", { class: "muted small" }, hint));
      if (it.source.length) card.append(h("div", { class: "small", style: "margin-top:6px" }, "Source : " + it.source.join(", ")));
      const prev = h("div", { class: "row wrap", style: "margin-top:10px" });
      if (ch) for (const pv of ch.previews) {
        if (!pv.url) { prev.append(h("span", { class: "muted small" }, pv.name)); continue; }
        if (kind === "sound") prev.append(h("div", {}, h("div", { class: "small" }, pv.name), h("audio", { controls: true, src: pv.url, "aria-label": "Aperçu du son" })));
        else if (kind === "cursor") prev.append(h("div", { class: "row small" }, h("img", { src: pv.url, alt: "", style: "max-width:48px;max-height:48px;image-rendering:pixelated;background:var(--card2);padding:4px;border-radius:6px" }), pv.name));
        else { const fam = "prev" + Math.random().toString(36).slice(2, 8); const st2 = document.createElement("style"); st2.textContent = `@font-face{font-family:${fam};src:url(${pv.url})}`; document.head.append(st2); prev.append(h("div", { style: `font-family:${fam},sans-serif;font-size:22px` }, "Batblox — Portez ce vieux whisky au juge blond qui fume. 0123456789")); }
      }
      card.append(prev);
      card.append(h("div", { class: "row wrap", style: "margin-top:12px" },
        h("button", { class: "btn", onclick: async () => { const r = await B.run(() => B.call("custom:pick", kind)); if (r) { this.chosen[kind] = r; this.draw(); } } }, "📂 Importer…"),
        h("button", { class: "btn pri", disabled: !ch && !it.source.length, onclick: async () => { const paths = ch ? ch.paths : null; if (!paths) return B.toast("Importe d'abord un fichier.", "bad"); const r = await B.run(() => B.call("custom:apply", { kind, paths })); if (r) { delete this.chosen[kind]; B.toast(it.label + " appliqué.", "ok"); this.draw(); } } }, "Appliquer"),
        h("button", { class: "btn", disabled: !it.active, onclick: async () => { await B.run(() => B.call("custom:restore", kind)); B.toast(it.label + " désactivé : fichiers d'origine restaurés.", "ok"); this.draw(); } }, "Désactiver"),
        h("button", { class: "btn", disabled: !it.source.length, onclick: async () => { if (await B.confirm("Restaurer les fichiers d'origine et oublier cette personnalisation ?", "Restaurer")) { await B.run(() => B.call("custom:forget", kind)); this.draw(); } } }, "Restaurer")));
      p.append(card);
    }
    p.append(h("div", { class: "card" }, B.row("Réappliquer automatiquement après une mise à jour de Roblox", "Vérifié au démarrage de Batblox et à chaque lancement depuis Batblox.", B.switch(B.S.settings.launcher.autoReapplyCustom, (v) => B.set({ launcher: { autoReapplyCustom: v } }), "Réapplication automatique"))));
  }
};

// ---------------------------------------------------------------- Maintenance + intégrité
B.pages.maint = {
  async render(view) {
    const p = (this.root = h("div", { class: "page" }));
    view.append(p);
    p.append(h("header", {}, h("div", {}, h("h1", {}, "Maintenance"), h("div", { class: "muted" }, "Cache, intégrité du client et journaux."))));
    p.append(h("div", { class: "card", id: "m-net" }), h("div", { class: "card", id: "m-int" }), h("div", { class: "card", id: "m-cache" }), h("div", { class: "card", id: "m-log" }));
    this.netIdle();
    this.integrityIdle();
    this.logs(false);
    this.cache(); // sans « await » : la page s'affiche tout de suite, la taille du cache arrive quand elle est mesurée
  },
  netIdle() {
    const b = B.clear(B.$("#m-net"));
    b.append(h("h2", {}, "Test de connexion"), h("div", { class: "muted small" }, "Vérifie que Batblox joint bien Roblox (session, amis, statuts, lancement), Discord et ntfy, et explique ce qui bloque."),
      h("div", { class: "row", style: "margin-top:10px" }, h("button", { class: "btn pri", onclick: () => this.net() }, "Lancer le test")));
  },
  async net() {
    const b = B.clear(B.$("#m-net"));
    b.append(h("h2", {}, "Test de connexion"), h("div", { class: "row" }, h("span", { class: "dot game" }), "Test en cours…"));
    const r = await B.run(() => B.call("net:diag")); if (!r) return this.netIdle();
    B.clear(b);
    const bad = r.filter((c) => c.ok === false).length;
    b.append(h("div", { class: "row" }, h("h2", { class: "grow" }, "Test de connexion"), h("span", { class: "pill " + (bad ? "bad" : "ok") }, bad ? bad + " problème(s)" : "Tout fonctionne")));
    for (const c of r) b.append(h("div", { class: "row small", style: "padding:4px 0; align-items:flex-start" }, h("span", { class: c.ok ? "ok" : c.ok === false ? "bad" : "muted" }, c.ok ? "✓" : c.ok === false ? "✗" : "–"), h("span", {}, c.label), c.detail ? h("span", { class: "muted" }, "— " + c.detail) : null));
    b.append(h("div", { class: "row", style: "margin-top:10px" }, h("button", { class: "btn", onclick: () => this.net() }, "Relancer le test")));
  },
  integrityIdle() {
    const b = B.clear(B.$("#m-int"));
    b.append(h("h2", {}, "🛡️ Intégrité"), h("div", { class: "muted small" }, "Contrôle la présence du client et de ses dossiers, et si ta version est à jour. Rien n'est affiché tant que la vérification n'a pas été faite."),
      h("div", { class: "row", style: "margin-top:10px" }, h("button", { class: "btn pri", onclick: () => this.integrity() }, "Vérifier maintenant")));
  },
  async integrity() {
    const b = B.clear(B.$("#m-int"));
    b.append(h("h2", {}, "🛡️ Intégrité"), h("div", { class: "row" }, h("span", { class: "dot game" }), "Vérification en cours…"));
    const r = await B.run(() => B.call("maint:integrity")); if (!r) return this.integrityIdle();
    B.clear(b);
    const cls = r.state === "OK" ? "ok" : "bad";
    b.append(h("div", { class: "row" }, h("h2", { class: "grow" }, "🛡️ Intégrité"), h("span", { class: "pill " + cls }, r.state)));
    b.append(h("div", { style: "margin:6px 0" }, r.percent == null ? h("span", { class: "muted" }, "Aucun contrôle n'a pu être effectué.") : h("div", {}, h("b", {}, `${r.ok} / ${r.total} contrôles réussis`), h("div", { class: "bar", style: "margin-top:6px" }, h("i", { style: `width:${r.percent}%` })))));
    for (const c of r.checks) b.append(h("div", { class: "row small", style: "padding:3px 0" }, h("span", { class: c.state === "ok" ? "ok" : c.state === "inconnu" ? "muted" : "bad" }, c.state === "ok" ? "✓" : c.state === "inconnu" ? "?" : "✗"), h("span", {}, c.label), c.detail ? h("span", { class: "muted" }, "— " + c.detail) : null));
    if (r.modified.length) b.append(h("div", { class: "notice", style: "margin-top:10px" }, `${r.modified.length} fichier(s) personnalisé(s) par Batblox (restaurables depuis « Personnalisation »).`));
    b.append(h("div", { class: "muted small", style: "margin-top:8px" }, "Cette vérification ne compare pas chaque fichier à une empreinte officielle : en cas de doute, utilise « Réparer »."));
    b.append(h("div", { class: "row", style: "margin-top:10px" }, h("button", { class: "btn", onclick: () => this.integrity() }, "Vérifier maintenant"),
      h("button", { class: "btn", onclick: async () => { if (await B.confirm("Restaurer les fichiers personnalisés puis lancer la réparation officielle de Roblox ?", "Réparer")) { const s = await B.run(() => B.call("maint:repair")); if (s) B.toast(s.join(" "), "ok"); } } }, "Réparer")));
  },
  async cache(force) {
    const tok = (this.ctok = (this.ctok || 0) + 1);
    const box = B.$("#m-cache"); if (!box) return;
    if (this.last) this.drawCache(this.last, true);
    else {
      const b = B.clear(box);
      b.append(h("div", { class: "cache-head" }, h("h2", {}, "Cache de Roblox"), h("span", { class: "muted small" }, "Calcul en cours…")),
        h("div", { class: "cache-list", "aria-busy": "true" }, [0, 1, 2].map(() => h("div", { class: "cache-item sk-row" }, h("span", { class: "sk box" }), h("span", { class: "sk", style: "width:60%" }), h("span", { class: "sk", style: "width:100%" })))));
    }
    const c = await B.run(() => B.call("maint:cache", { force: !!force }));
    if (tok !== this.ctok || !B.$("#m-cache")) return; // page quittée ou calcul plus récent
    if (!c) { if (this.last) this.drawCache(this.last, false); return; }
    this.last = c;
    this.drawCache(c, false);
  },
  drawCache(c, refreshing) {
    const b = B.clear(B.$("#m-cache"));
    const sel = (this.sel = this.sel && !refreshing ? this.sel : new Set(c.items.filter((i) => i.exists).map((i) => i.id)));
    b.append(h("div", { class: "cache-head" }, h("h2", {}, "Cache de Roblox"), refreshing ? h("span", { class: "muted small" }, "mise à jour…") : null, h("span", { class: "cache-total" }, B.bytes(c.total))));
    if (!c.items.length) b.append(h("div", { class: "muted small" }, "Disponible sous Windows uniquement."));
    else {
      const list = h("div", { class: "cache-list" });
      for (const i of c.items) {
        const pct = c.total > 0 && i.exists ? Math.max(2, Math.round((i.bytes / c.total) * 100)) : 0;
        list.append(h("label", { class: "cache-item" + (i.exists ? "" : " off") },
          h("input", { type: "checkbox", checked: i.exists && sel.has(i.id), disabled: !i.exists, onchange: (e) => (e.target.checked ? sel.add(i.id) : sel.delete(i.id)) }),
          h("span", { class: "nm" }, h("b", { title: i.label }, i.label), i.exists ? h("div", { class: "bar", "aria-hidden": "true" }, h("i", { style: `width:${pct}%` })) : null),
          h("span", { class: "sz" }, i.exists ? B.bytes(i.bytes) : "absent")));
      }
      b.append(list);
    }
    b.append(h("div", { class: "cache-actions" },
      h("button", { class: "btn pri", onclick: async () => { const r = await B.run(() => B.call("maint:clean", { ids: [...sel] })); if (r) { B.toast(`${B.bytes(r.freed)} libérés` + (r.failed ? ` (${r.failed} élément(s) en cours d'utilisation ignoré(s))` : "") + ".", "ok"); this.last = null; this.sel = null; this.cache(true); } } }, "🧹 Nettoyer"),
      h("button", { class: "btn", onclick: () => this.cache(true) }, "Recalculer")));
    const M = B.S.settings.maintenance;
    b.append(h("div", { class: "cache-opts" },
      B.row("Nettoyage automatique", "Au démarrage de Batblox, si le cache dépasse la taille ci-dessous (Roblox doit être fermé).", B.switch(M.autoClean, (v) => B.set({ maintenance: { autoClean: v } }), "Nettoyage automatique")),
      B.row("Seuil (Mo)", null, h("input", { type: "number", min: 50, max: 20000, value: M.autoCleanMb, "aria-label": "Seuil en mégaoctets", onchange: (e) => B.set({ maintenance: { autoCleanMb: Number(e.target.value) } }) }))));
  },
  async logs(show) {
    const b = B.clear(B.$("#m-log"));
    b.append(h("div", { class: "row" }, h("h2", { class: "grow" }, "Journaux"), h("button", { class: "btn sm", title: "Ouvre la console de l'interface (raccourci : F12)", onclick: () => B.run(() => B.call("app:devtools")) }, "Console (F12)"), h("button", { class: "btn sm", onclick: () => this.logs(!show) }, show ? "Masquer" : "Afficher")));
    if (!show) return;
    const l = await B.run(() => B.call("maint:logs"));
    b.append(h("pre", { class: "log" }, (l && l.length ? l.join("\n") : "Journal vide.")));
  }
};

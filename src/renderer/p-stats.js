"use strict";

B.pages.stats = {
  range: "30", metric: "f", who: "me", waiting: false,
  async render(view, opts) {
    this.embedded = !!(opts && opts.embedded);
    this.root = h("div", { class: "page" + (this.embedded ? " embedded" : "") });
    view.append(this.root);
    await this.draw();
  },
  // Construit la page dans un conteneur neuf puis le substitue : pas de flash blanc ni de saut de défilement au rafraîchissement.
  async draw() {
    const next = h("div", { class: "page" + (this.embedded ? " embedded" : "") });
    await this.build(next);
    if (this.root && this.root.isConnected) this.root.replaceWith(next);
    this.root = next;
  },
  async refresh() {
    if (this.busy) return;
    this.busy = true;
    const v = B.$("#view"), top = v ? v.scrollTop : 0;
    try { await this.draw(); } finally { if (v) v.scrollTop = top; this.busy = false; }
  },
  async build(root) {
    const people = (await B.run(() => B.call("stats:people"))) || [];
    if (this.who !== "me" && !people.some((x) => x.id === this.who)) this.who = "me";
    const me = this.who === "me";
    root.append(B.head("Statistiques", me ? "Évolution de ton compte au fil du temps." : "Statistiques d'une personne que tu suis.", [h("div", { class: "chips" }, [["7", "7 jours"], ["30", "30 jours"], ["90", "90 jours"], ["all", "Tout"]].map(([v, l]) => h("button", { class: "chip" + (this.range === v ? " on" : ""), "aria-pressed": this.range === v ? "true" : "false", onclick: () => { this.range = v; this.draw(); } }, l)))], this.embedded));
    root.append(this.whoBar(people));
    if (!me) return this.drawPerson(root);
    const d = await B.run(() => B.call("stats:overview", this.range));
    if (!d) { root.append(h("div", { class: "card empty" }, "Ajoute un compte pour voir les statistiques.")); return; }
    root.append(h("div", { class: "grid g4", style: "margin-bottom:14px" }, [["Amis", d.cards.friends, "f"], ["Abonnés", d.cards.followers, "fo"], ["Abonnements", d.cards.following, "fg"], ["Demandes", d.cards.requests, null]].map(([l, v, k]) => h("div", { class: "stat" }, h("b", {}, B.num(v)), h("span", {}, l), k ? B.sparkline(d.series.map((q) => q[k])) : null))));
    const metrics = { f: "Amis", fo: "Abonnés", fg: "Abonnements" };
    const pts = d.series.map((p) => ({ t: p.t, v: p[this.metric] })).filter((p) => p.v != null);
    const card = h("div", { class: "card" }, h("div", { class: "row wrap" }, h("h2", { class: "grow" }, "Évolution"), h("div", { class: "chips" }, Object.entries(metrics).map(([k, l]) => h("button", { class: "chip" + (this.metric === k ? " on" : ""), onclick: () => { this.metric = k; this.draw(); } }, l)))),
      B.chartSummary(pts, metrics[this.metric].toLowerCase()), B.lineChart(pts, { label: "Évolution : " + metrics[this.metric], name: "evolution-" + metrics[this.metric].toLowerCase() }));
    if (pts.length >= 2) {
      const vals = pts.map((p) => p.v), first = vals[0], last = vals[vals.length - 1], avg = vals.reduce((a, b) => a + b, 0) / vals.length, diff = last - first;
      card.append(B.statStrip(vals));
    }
    root.append(card);
    if (d.weekly.length) {
      const best = [...d.weekly].sort((a, b) => b.added - a.added)[0], worst = [...d.weekly].sort((a, b) => b.removed - a.removed)[0];
      root.append(h("div", { class: "card" }, h("h2", {}, "Ajouts et retraits par semaine"), B.barChart(d.weekly), B.weeklySummary(d.weekly),
        h("div", { class: "muted small" }, `Meilleure semaine : ${best.added} ajout(s) (semaine du ${new Date(best.w).toLocaleDateString("fr-FR")}) · Pire semaine : ${worst.removed} retrait(s) (semaine du ${new Date(worst.w).toLocaleDateString("fr-FR")})`)));
    } else root.append(h("div", { class: "card" }, h("h2", {}, "Ajouts et retraits par semaine"), h("div", { class: "empty" }, "Aucun ajout ni retrait sur cette période.")));
    await this.presence(root);
  },
  // ---------- Statistiques d'une autre personne ----------
  whoBar(people) {
    const short = (n) => { const m = /\(@(.+)\)$/.exec(n || ""); return m ? m[1] : n; };
    const chip = (id, label, title, av, status) => h("button", { class: "chip who" + (this.who === id ? " on" : ""), "data-n": label.toLowerCase(), "aria-pressed": this.who === id ? "true" : "false", title,
      onclick: () => { if (this.who !== id) { this.who = id; this.draw(); } } }, av, status ? B.dot(status) : null, h("span", { class: "nm" }, label));
    const mine = B.S.active;
    const box = h("div", { class: "who-list", role: "group", "aria-label": "Personne" }, chip("me", "Moi", mine ? "Moi — " + mine.label : "Mon compte", mine ? B.avatar(mine.id, mine.label, "xs", mine.avatarUrl) : null, null));
    for (const x of people) box.append(chip(x.id, short(x.name), x.name + (x.paused ? " (en pause)" : ""), B.avatar(x.id, x.name, "xs"), x.paused ? null : x.status));
    const filter = people.length > 14 ? h("input", { type: "search", class: "who-q", placeholder: "Filtrer…", "aria-label": "Filtrer les personnes suivies",
      oninput: (e) => { const q = e.target.value.trim().toLowerCase(); box.querySelectorAll(".chip").forEach((c) => { c.style.display = !q || c.classList.contains("on") || c.dataset.n.includes(q) ? "" : "none"; }); } }) : null;
    return h("div", { class: "card whobar" }, h("div", { class: "row wrap who-head" }, h("span", { class: "muted small" }, "Statistiques de"), filter, h("span", { class: "grow" }),
      h("button", { class: "btn pri", onclick: () => this.addPerson() }, "➕ Suivre quelqu'un")), box,
      people.length ? null : h("div", { class: "muted small", style: "margin-top:10px" }, "Tu ne suis personne pour l'instant. Ajoute un joueur (pseudo, identifiant ou lien) pour voir l'évolution de ses amis, abonnés et sa présence. Tu peux aussi suivre un ami avec « Suivre » dans Mon profil → Amis."));
  },
  async addPerson() {
    const q = h("input", { type: "text", placeholder: "Pseudo, identifiant ou lien du profil Roblox", "aria-label": "Joueur à suivre",
      onkeydown: (e) => { if (e.key === "Enter") { const b = e.target.closest(".modal").querySelector(".btn.pri"); if (b) b.click(); } } });
    const o = { friends: true, status: true, conn: true };
    const opt = (k, label, desc) => B.row(label, desc, B.switch(o[k], (v) => { o[k] = v; }, label));
    const body = h("div", {}, h("p", { class: "muted small" }, "Batblox vérifie ce joueur à chaque passage du monitoring et garde les données pour les statistiques."), q,
      h("div", { style: "margin-top:8px" }, opt("friends", "Liste d'amis", "Évolution du nombre d'amis, ajouts et retraits."), opt("conn", "Abonnés et abonnements", "Évolution des abonnés / abonnements."), opt("status", "Statut et présence", "En ligne / en jeu, heures de pointe. Dépend de ce que Roblox te laisse voir.")));
    const r = await B.modal({ title: "Suivre quelqu'un", body, buttons: [{ label: "Annuler", value: null },
      { label: "Suivre", cls: "pri", action: async () => { const v = q.value.trim(); if (!v) { B.toast("Saisis un pseudo ou un identifiant.", "bad"); return false; } const res = await B.run(() => B.call("watch:add", { query: v, opts: o })); return res || false; } }] });
    if (r && r.id) { this.who = r.id; B.toast("« " + r.name + " » est maintenant suivi.", "ok"); this.draw(); }
  },
  evolution(root, d) {
    const metrics = { f: "Amis", fo: "Abonnés", fg: "Abonnements" };
    const pts = d.series.map((p) => ({ t: p.t, v: p[this.metric] })).filter((p) => p.v != null);
    const card = h("div", { class: "card" }, h("div", { class: "row wrap" }, h("h2", { class: "grow" }, "Évolution"), h("div", { class: "chips" }, Object.entries(metrics).map(([k, l]) => h("button", { class: "chip" + (this.metric === k ? " on" : ""), onclick: () => { this.metric = k; this.draw(); } }, l)))));
    if (pts.length < 2) {
      const why = [];
      const have = pts.length === 1 ? ` Premier point enregistré : ${B.num(pts[0].v)} ${metrics[this.metric].toLowerCase()}.` : "";
      if (d.opts && !d.opts.friends) why.push(h("button", { class: "btn sm", onclick: async () => { await B.run(() => B.call("watch:update", { id: d.id, patch: { friends: true } })); this.draw(); } }, "Activer le suivi de la liste d'amis"));
      if (d.opts && !d.opts.conn) why.push(h("button", { class: "btn sm", onclick: async () => { await B.run(() => B.call("watch:update", { id: d.id, patch: { conn: true } })); this.draw(); } }, "Activer le suivi des abonnés"));
      card.append(h("div", { class: "empty" }, "Pas encore assez de points pour tracer une courbe : elle se remplit à chaque changement et au moins toutes les 30 min." + have), why.length ? h("div", { class: "row wrap", style: "justify-content:center" }, why) : null);
    } else {
      card.append(B.chartSummary(pts, metrics[this.metric].toLowerCase()), B.lineChart(pts, { label: "Évolution : " + metrics[this.metric], name: "evolution-" + metrics[this.metric].toLowerCase() }));
      const vals = pts.map((p) => p.v), first = vals[0], last = vals[vals.length - 1], avg = vals.reduce((x, y) => x + y, 0) / vals.length, diff = last - first;
      card.append(B.statStrip(vals));
    }
    root.append(card);
    if (d.weekly.length) root.append(h("div", { class: "card" }, h("h2", {}, "Ajouts et retraits d'amis par semaine"), B.barChart(d.weekly), B.weeklySummary(d.weekly)));
  },
  async drawPerson(root) {
    const d = await B.run(() => B.call("stats:person", { id: this.who, range: this.range }));
    if (!d) { this.who = "me"; this.waiting = false; B.clear(root); return this.build(root); }
    const isW = d.kind === "watch", o = d.opts;
    this.waiting = !!(isW && !o.paused && !o.error && ((o.friends && d.cards.friends == null) || (o.conn && d.cards.followers == null && d.cards.friends == null)));
    const acts = [h("button", { class: "btn", onclick: () => { B.pages.history.search = d.name.replace(/ \(@.*\)$/, ""); B.go("history"); } }, "📜 Historique")];
    if (isW) {
      acts.push(h("button", { class: "btn", onclick: () => { B.pages.profile.tab = "watch"; B.go("profile"); } }, "⚙ Réglages du suivi"),
        h("button", { class: "btn bad", onclick: async () => { if (await B.confirm("Arrêter de suivre " + d.name + " ? Ses statistiques ne seront plus mises à jour.", "Arrêter", true)) { await B.run(() => B.call("watch:remove", d.id)); this.who = "me"; this.draw(); } } }, "Arrêter le suivi"));
    } else {
      acts.push(h("button", { class: "btn", title: "Suivre aussi l'évolution de ses amis et abonnés", onclick: async () => { const r = await B.run(() => B.call("watch:add", { query: d.id, opts: { friends: true, status: false, conn: true } })); if (r) { B.toast("Son compte est maintenant surveillé.", "ok"); this.draw(); } } }, "👁 Surveiller aussi son compte"),
        h("button", { class: "btn bad", onclick: async () => { const r = await B.run(() => B.call("friends:track", { id: d.id, on: false })); if (r) { if (r.converted) B.toast("Suivi par ami activé : tes autres amis restent suivis.", "ok"); this.who = "me"; this.draw(); } } }, "Arrêter le suivi"));
    }
    const sub = (isW ? "Profil suivi" : "Ami suivi") + " · ID " + d.id + (o && o.paused ? " · en pause" : o && o.error ? " · " + o.error : "");
    root.append(h("div", { class: "card" }, h("div", { class: "row wrap" }, B.avatar(d.id, d.name, "lg"), h("div", { class: "grow min0" }, h("b", {}, d.name), h("div", { class: "muted small" }, sub)),
      d.status ? h("span", { class: "pill" }, B.dot(d.status), B.statusLabel(d.status) + (d.status === "jeu" && d.place ? " · " + d.place : "")) : null), h("div", { class: "row wrap", style: "margin-top:12px" }, acts)));
    if (this.waiting) root.append(h("div", { class: "notice" }, "Première vérification en cours : les chiffres apparaissent d'ici quelques secondes."));
    if (isW) {
      root.append(h("div", { class: "grid g3", style: "margin-bottom:14px" }, [["Amis", d.cards.friends], ["Abonnés", d.cards.followers], ["Abonnements", d.cards.following]].map(([l, v]) => h("div", { class: "stat" }, h("b", {}, v == null ? "—" : B.num(v)), h("span", {}, l)))));
      this.evolution(root, d);
    } else {
      root.append(h("div", { class: "card" }, h("h2", {}, "Amis et abonnés"), h("div", { class: "muted small" }, "Pour un ami suivi, Batblox ne collecte que la présence. Utilise « Surveiller aussi son compte » pour suivre aussi l'évolution de ses amis et abonnés.")));
    }
    // Présence
    const pc = h("div", { class: "card" }, h("h2", {}, "Présence"));
    let hint = null;
    const fix = [];
    if (!d.presenceStats) { hint = "La collecte de la présence est désactivée."; fix.push(h("button", { class: "btn sm", onclick: async () => { await B.set({ monitoring: { presenceStats: true } }); B.toast("Collecte activée : la carte se remplit au fil des vérifications.", "ok"); this.draw(); } }, "Activer")); }
    else if (isW && !o.status) { hint = "Le suivi du statut est désactivé pour ce profil."; fix.push(h("button", { class: "btn sm", onclick: async () => { await B.run(() => B.call("watch:update", { id: d.id, patch: { status: true } })); this.draw(); } }, "Activer le statut")); }
    else if (!d.presence) hint = "Pas encore de données de présence : elles se remplissent au fil des vérifications." + (isW ? " Pour un joueur qui n'est pas ton ami, Roblox cache souvent son activité." : "");
    pc.append(B.pages.friends.statsBody(d.presence, hint), fix.length ? h("div", { class: "row", style: "margin-top:10px" }, fix) : null);
    root.append(pc);
  },
  onMonitor(snap) {
    if (!this.root || !this.root.isConnected || (snap && snap.running)) return;
    const lr = snap && snap.lastRun;
    if (this.waiting || (lr && lr !== this.seenRun)) { this.seenRun = lr; this.refresh(); }
  },
  async presence(root) {
    const p = await B.run(() => B.call("stats:heat"));
    const card = h("div", { class: "card" }, h("div", { class: "row" }, h("h2", { class: "grow" }, "Présence"),
      p && p.totalSec ? h("button", { class: "btn sm", onclick: async () => { if (await B.confirm("Effacer les statistiques de présence ?", "Effacer", true)) { await B.run(() => B.call("data:clearPresence")); this.draw(); } } }, "Effacer") : null));
    if (!p || !p.enabled) card.append(h("div", { class: "notice" }, "La collecte de la présence est désactivée. ", h("button", { class: "btn sm", onclick: async () => { await B.set({ monitoring: { presenceStats: true } }); B.toast("Collecte activée : la carte se remplit au fil des vérifications.", "ok"); this.draw(); } }, "Activer")));
    else if (p.totalSec < 3600) card.append(h("div", { class: "empty" }, `Pas assez de données pour le moment (${B.dur(p.totalSec)} observés sur ${p.friends} ami(s)). La carte apparaît après environ une heure d'observation, et devient fiable avec plusieurs jours.`));
    else card.append(h("div", { class: "muted small" }, `Part du temps passé en ligne selon le jour et l'heure — ${p.friends} ami(s), ${B.dur(p.totalSec)} observés. Les cases grises n'ont pas encore été observées.`), B.heatmap(p.cells, p.obs));
    root.append(card);
  }
};

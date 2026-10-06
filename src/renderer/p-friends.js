"use strict";

B.pages.friends = {
  list: [], q: "", sort: "statut", filter: "tous", stats: false,
  async render(view, opts) {
    this.embedded = !!(opts && opts.embedded);
    this.root = h("div", { class: "page" + (this.embedded ? " embedded" : "") });
    view.append(this.root);
    this.list = await B.run(() => B.call("friends:list")) || [];
    this.draw();
  },
  draw() {
    const root = B.clear(this.root);
    const mon = B.S.settings.monitoring;
    root.append(B.head("Amis", this.list.length + " ami(s) · statut mis à jour à chaque vérification",
      [h("button", { class: "btn", onclick: async () => { await B.run(() => B.call("monitor:checkNow")); this.list = await B.call("friends:list"); this.draw(); } }, "🔄 Vérifier maintenant")], this.embedded));
    if (mon.presenceMode !== "all") root.append(h("div", { class: "notice" }, "Le statut en ligne n'est suivi que pour les amis marqués 🔔. Tu peux suivre tous tes amis dans Réglages."));
    const bar = h("div", { class: "row wrap", style: "margin-bottom:12px" },
      h("input", { type: "search", placeholder: "Rechercher un ami…", value: this.q, "aria-label": "Rechercher", style: "max-width:260px", oninput: (e) => { this.q = e.target.value; this.drawList(); } }),
      h("select", { "aria-label": "Trier", onchange: (e) => { this.sort = e.target.value; this.drawList(); } }, ["statut", "nom", "dernière activité"].map((o) => h("option", { value: o, selected: o === this.sort }, "Tri : " + o))),
      h("div", { class: "chips" }, [["tous", "Tous"], ["en_ligne", "En ligne"], ["jeu", "En jeu"], ["hors_ligne", "Hors ligne"], ["suivis", "Suivis"]].map(([v, l]) => h("button", { class: "chip" + (this.filter === v ? " on" : ""), onclick: () => { this.filter = v; this.draw(); } }, l))));
    root.append(bar, h("div", { class: "card list", id: "fl" }));
    this.drawList();
    B.call("friends:idle").then((idle) => {
      if (!idle.length) return;
      const n = h("div", { class: "notice" }, `${idle.length} ami(s) suivi(s) n'ont pas été vus en ligne depuis ${mon.idleDays} jours : `,
        h("button", { class: "btn sm", onclick: () => this.triage(idle) }, "Faire le tri"));
      root.insertBefore(n, root.children[1]);
    }).catch(() => {});
  },
  rank: { jeu: 0, studio: 1, en_ligne: 2, inconnu: 3, hors_ligne: 4 },
  drawList() {
    const box = B.$("#fl"); if (!box) return;
    B.clear(box);
    const q = this.q.trim().toLowerCase();
    let l = this.list.filter((f) => (!q || f.name.toLowerCase().includes(q)) && (this.filter === "tous" || (this.filter === "suivis" ? f.tracked : this.filter === "en_ligne" ? f.status === "en_ligne" || f.status === "studio" : f.status === this.filter)));
    if (this.sort === "nom") l.sort((a, b) => a.name.localeCompare(b.name, "fr"));
    else if (this.sort === "dernière activité") l.sort((a, b) => (b.lastOn || 0) - (a.lastOn || 0));
    else l.sort((a, b) => this.rank[a.status] - this.rank[b.status] || a.name.localeCompare(b.name, "fr"));
    if (!l.length) { box.append(h("div", { class: "empty" }, this.list.length ? "Aucun ami ne correspond." : "Ta liste d'amis apparaîtra après la première vérification.")); return; }
    for (const f of l.slice(0, 300)) {
      const sub = f.status === "jeu" ? "🎮 " + (f.place || "En jeu") : f.status === "hors_ligne" ? "Dernière activité : " + (f.lastOn ? B.ago(f.lastOn) : "inconnue") : B.statusLabel(f.status);
      box.append(h("div", { class: "item" }, B.avatar(f.id, f.name, "ring " + f.status), h("div", { class: "main" }, h("b", {}, f.name), h("span", { class: "muted small" }, sub)), B.dot(f.status),
        f.canJoin ? h("button", { class: "btn sm", onclick: () => B.run(() => B.call("roblox:join", f.id)).then((r) => r && B.toast("Roblox se lance…", "ok")) }, "Rejoindre") : null,
        h("button", { class: "btn sm", title: "Historique de cet ami", onclick: () => { B.pages.history.search = f.name.replace(/ \(@.*\)$/, ""); B.go("history"); } }, "📜"),
        h("button", { class: "btn sm", title: "Statistiques de présence", onclick: () => this.showStats(f) }, "📊"),
        h("button", { class: "btn sm" + (f.tracked ? " pri" : ""), title: f.tracked ? "Arrêter de suivre cette personne" : "Suivre cette personne (amis, statut, abonnés, stats)", "aria-pressed": f.tracked ? "true" : "false",
          onclick: async () => {
            const r = await B.run(() => B.call("friends:track", { id: f.id, on: !f.tracked }));
            if (!r) return;
            B.toast(f.tracked ? "« " + f.name + " » n'est plus suivi." : "« " + f.name + " » est maintenant suivi (Profils suivis).", "ok");
            this.list = await B.call("friends:list"); this.draw();
          } }, f.tracked ? "🔔 Suivi" : "🔕")));
    }
    if (l.length > 300) box.append(h("div", { class: "muted small", style: "padding:8px" }, `${l.length - 300} autre(s) : affine la recherche pour les voir.`));
  },
  // Corps des statistiques de présence (réutilisé par la page Statistiques)
  statsBody(st, hint) {
    const body = h("div", {});
    if (!st) body.append(h("div", { class: "notice" }, hint || (B.S.settings.monitoring.presenceStats ? "Pas encore de données de présence : elles se remplissent au fil des vérifications." : "Active « Statistiques de présence » dans les réglages pour collecter ces données.")));
    else {
      const hrs = (i) => (i >= 0 ? `${i} h–${(i + 1) % 24} h` : "—");
      body.append(h("div", { class: "grid g2" }, h("div", { class: "stat" }, h("b", {}, st.online != null ? st.online + " %" : "—"), h("span", {}, "Taux de présence")),
        h("div", { class: "stat" }, h("b", {}, hrs(st.peakHour)), h("span", {}, "Heure de pointe")), h("div", { class: "stat" }, h("b", {}, st.bestDay >= 0 ? B.DAYS_LONG[st.bestDay] : "—"), h("span", {}, "Jour le plus actif")),
        h("div", { class: "stat" }, h("b", {}, B.dur(st.observedSec)), h("span", {}, "Temps observé"))));
      body.append(h("h3", { style: "margin-top:14px" }, "Présence par heure et par jour"), B.heatmap(st.week, st.weekObs));
      if (st.games.length) body.append(h("h3", { style: "margin-top:14px" }, "Jeux les plus joués"), h("table", {}, st.games.map((g) => h("tr", {}, h("td", {}, g.n || "Jeu inconnu"), h("td", {}, B.dur(g.s))))));
    }
    return body;
  },
  async showStats(f) {
    const st = await B.run(() => B.call("friends:stats", f.id));
    await B.modal({ title: f.name, body: this.statsBody(st, st ? null : "Pas encore de données pour cet ami : elles se remplissent au fil des vérifications."), wide: true });
  },
  async triage(idle) {
    const body = h("div", {}, h("p", { class: "muted" }, "Ces amis suivis n'ont pas été vus en ligne depuis longtemps. Rien n'est retiré sans ton accord."),
      idle.map((i) => h("div", { class: "item" }, h("div", { class: "main" }, h("b", {}, i.name), h("span", { class: "muted small" }, `Absent depuis ${i.days} jours`)),
        h("button", { class: "btn sm", onclick: async (e) => { const r = await B.run(() => B.call("friends:track", { id: i.id, on: false })); if (r) e.target.closest(".item").remove(); } }, "Arrêter le suivi"))));
    await B.modal({ title: "Faire le tri", body });
    this.list = await B.call("friends:list"); this.draw();
  },
  onMonitor() { if (document.activeElement && document.activeElement.tagName === "INPUT") return; B.call("friends:list").then((l) => { this.list = l; this.drawList(); }).catch(() => {}); }
};

"use strict";
// Activité : regroupe Historique, Statistiques et Notifications en trois onglets.
// (Remplace les trois anciennes pages ; les anciens liens y renvoient via B.go.)

// [identifiant de la page, libellé, icône, description courte]
const ACT_TABS = [
  ["history", "Historique", "history", "Changements détectés"],
  ["stats", "Statistiques", "stats", "Évolution et présence"],
  ["notifs", "Notifications", "notifs", "Alertes et plages horaires"]
];

B.pages.activity = {
  tab: "history",

  render(view) {
    this.root = h("div", { class: "page" });
    view.append(this.root);
    this.root.append(B.head("Activité", "Historique, statistiques et notifications au même endroit."),
      h("div", { id: "ac-tabs" }), h("div", { id: "ac-body", style: "margin-top:16px" }));
    this.drawTabs();
    this.drawBody();
  },

  drawTabs() {
    const box = B.$("#ac-tabs"); if (!box) return;
    B.clear(box);
    box.append(h("div", { class: "tabs", role: "tablist", "aria-label": "Sections de l'activité" }, ACT_TABS.map(([id, label, ico, desc]) =>
      h("button", { class: "stat tabtile", role: "tab", "aria-selected": this.tab === id ? "true" : "false", onclick: () => this.open(id) },
        h("div", { class: "stat-ico" }, B.icon(ico)), h("div", {}, h("b", { class: "tt" }, label), h("span", {}, desc))))));
  },

  open(id) {
    if (id === this.tab && B.$("#ac-body").firstChild) return;
    this.tab = id;
    if (id === "history") { B.S.unread = 0; B.renderNav(); }
    this.drawTabs();
    this.drawBody();
  },

  drawBody() {
    const el = B.$("#ac-body"); if (!el) return;
    B.pages[this.tab].render(B.clear(el), { embedded: true });
  },

  // Les événements du processus principal sont transmis à l'onglet affiché.
  onMonitor(snap) { const p = B.pages[this.tab]; if (p && p.onMonitor) p.onMonitor(snap); },
  onHistory() { const p = B.pages[this.tab]; if (p && p.onHistory) p.onHistory(); }
};

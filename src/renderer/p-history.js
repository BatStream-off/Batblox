"use strict";
const FILTERS = [["tout", "Tout", null], ["ajouts", "Ajouts", ["added", "req_accepted"]], ["retraits", "Retraits", ["removed", "req_gone"]], ["pseudos", "Pseudos", ["renamed"]], ["statut", "Statut", ["online", "offline", "ingame", "leftgame"]], ["demandes", "Demandes", ["req_in", "req_accepted", "req_gone"]], ["abonnés", "Abonnés", ["followers"]], ["abonnements", "Abonnements", ["followings"]]];

B.pages.history = {
  search: "", filter: "tout", pageNo: 0,
  async render(view, opts) {
    this.embedded = !!(opts && opts.embedded);
    this.root = h("div", { class: "page" + (this.embedded ? " embedded" : "") });
    view.append(this.root);
    const root = this.root;
    root.append(B.head("Historique", h("span", { id: "hcount" }), [
        h("button", { class: "btn", onclick: async (e) => { e.target.disabled = true; await B.run(() => B.call("monitor:checkNow")); e.target.disabled = false; this.load(); } }, "🔄 Vérifier maintenant"),
        h("button", { class: "btn", onclick: async () => { const p = await B.run(() => B.call("history:csv")); if (p) B.toast("Exporté : " + p, "ok"); } }, "⬇ Export CSV"),
        h("button", { class: "btn bad", onclick: async () => { if (await B.confirm("Effacer tout l'historique ? Cette action est définitive.", "Effacer", true)) { await B.run(() => B.call("history:clear")); this.load(); } } }, "🗑 Effacer")], this.embedded));
    root.append(h("div", { class: "row wrap", style: "margin-bottom:12px" },
      h("input", { type: "search", placeholder: "Rechercher un pseudo…", value: this.search, "aria-label": "Rechercher dans l'historique", style: "max-width:260px", oninput: (e) => { this.search = e.target.value; this.pageNo = 0; clearTimeout(this.t); this.t = setTimeout(() => this.load(), 200); } }),
      h("div", { class: "chips", id: "hf" })));
    root.append(h("div", { id: "hl" }));
    this.drawChips();
    await this.load();
  },
  drawChips() {
    const box = B.clear(B.$("#hf"));
    for (const [id, label] of FILTERS) box.append(h("button", { class: "chip" + (this.filter === id ? " on" : ""), "aria-pressed": this.filter === id ? "true" : "false", onclick: () => { this.filter = id; this.pageNo = 0; this.drawChips(); this.load(); } }, label));
  },
  async load() {
    const types = (FILTERS.find((f) => f[0] === this.filter) || [])[2];
    const r = await B.run(() => B.call("history:list", { types, search: this.search, page: this.pageNo, size: 60 }));
    const box = B.$("#hl"); if (!box || !r) return;
    B.clear(box);
    const c = B.$("#hcount"); if (c) c.textContent = r.total + " événement(s)";
    if (!r.items.length) { box.append(h("div", { class: "card empty" }, this.search || this.filter !== "tout" ? "Aucun événement ne correspond à ces filtres." : "Aucun événement pour le moment. Batblox enregistre les changements à partir de la deuxième vérification.")); return; }
    let last = "";
    for (const e of r.items) {
      const d = B.dateLabel(e.ts);
      if (d !== last) { last = d; box.append(h("div", { class: "day" }, d)); }
      box.append(B.eventRow(e));
    }
    const pages = Math.ceil(r.total / 60);
    if (pages > 1) box.append(h("div", { class: "row", style: "justify-content:center;margin-top:12px" },
      h("button", { class: "btn sm", disabled: this.pageNo === 0, onclick: () => { this.pageNo--; this.load(); } }, "← Plus récents"), h("span", { class: "muted small" }, `Page ${this.pageNo + 1} / ${pages}`),
      h("button", { class: "btn sm", disabled: this.pageNo + 1 >= pages, onclick: () => { this.pageNo++; this.load(); } }, "Plus anciens →")));
  },
  onHistory() { if (this.pageNo === 0) this.load(); }
};

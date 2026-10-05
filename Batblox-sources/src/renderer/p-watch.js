"use strict";

B.pages.watch = {
  async render(view, opts) {
    this.embedded = !!(opts && opts.embedded);
    this.root = h("div", { class: "page" + (this.embedded ? " embedded" : "") });
    view.append(this.root);
    await this.draw();
  },
  async draw() {
    const root = B.clear(this.root);
    const list = await B.run(() => B.call("watch:list")) || [];
    const input = h("input", { type: "text", placeholder: "Pseudo ou identifiant Roblox", "aria-label": "Pseudo ou identifiant", onkeydown: (e) => { if (e.key === "Enter") add(); } });
    const add = async () => {
      const v = input.value.trim(); if (!v) return;
      const r = await B.run(() => B.call("watch:add", { query: v, opts: { friends: true, status: true, conn: true } }));
      if (r) { input.value = ""; B.toast("Profil « " + r.name + " » ajouté.", "ok"); this.draw(); }
    };
    root.append(B.head("Profils suivis", "Surveille la liste d'amis et l'activité de n'importe quel joueur.",
      [h("button", { class: "btn", onclick: async () => { await B.run(() => B.call("monitor:checkNow")); this.draw(); } }, "🔄 Vérifier maintenant")], this.embedded));
    root.append(h("div", { class: "card" }, h("div", { class: "row" }, input, h("button", { class: "btn pri", onclick: add }, "➕ Ajouter"))));
    if (!list.length) { root.append(h("div", { class: "card empty" }, "Aucun profil suivi. Ajoute un joueur avec son pseudo ou son identifiant, ou active 🔔 sur un ami.")); return; }
    for (const w of list) {
      const opt = (k, label) => h("label", { class: "row small", style: "gap:6px" }, B.switch(w[k], async (v) => { await B.run(() => B.call("watch:update", { id: w.id, patch: { [k]: v } })); w[k] = v; }, label), label);
      root.append(h("div", { class: "card" }, h("div", { class: "row" }, B.avatar(w.id, w.name, "lg"),
        h("div", { class: "grow" }, h("b", {}, w.name), h("div", { class: "muted small" }, (w.count != null ? w.count + " ami(s) · " : "") + (w.paused ? "en pause" : w.error ? w.error : "suivi actif"),
          w.live ? " · " + B.statusLabel(w.live) + (w.live === "jeu" && w.place ? " — " + w.place : "") : "")),
        w.live === "jeu" ? h("button", { class: "btn sm", onclick: () => B.run(() => B.call("roblox:join", w.id)).then((r) => r && B.toast("Roblox se lance…", "ok")) }, "Rejoindre") : null,
        h("button", { class: "btn sm", onclick: async () => { await B.run(() => B.call("watch:update", { id: w.id, patch: { paused: !w.paused } })); this.draw(); } }, w.paused ? "▶ Reprendre" : "⏸ Pause"),
        h("button", { class: "btn sm bad", onclick: async () => { if (await B.confirm(`Arrêter de suivre ${w.name} ?`, "Supprimer", true)) { await B.run(() => B.call("watch:remove", w.id)); this.draw(); } } }, "Supprimer")),
        h("div", { class: "row wrap", style: "margin-top:10px" }, opt("friends", "Liste d'amis"), opt("status", "Statut"), opt("conn", "Abonnés / abonnements"))));
    }
    root.append(h("p", { class: "muted small" }, "Le suivi du statut d'un profil dépend de ce que Roblox te laisse voir : pour les joueurs qui ne sont pas tes amis, l'activité n'est souvent pas disponible."));
  }
};

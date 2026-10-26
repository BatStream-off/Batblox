"use strict";
// Mini-fenêtre « Amis en ligne » (index.html?mini=1) : compacte, toujours au premier plan par défaut.
// Même passerelle que la fenêtre principale ; se met à jour à chaque vérification du monitoring.

B.pages.mini = {
  q: "",
  render(view) {
    const root = h("div", { class: "mini" });
    view.append(root);
    const pin = h("button", { class: "tb-icon mini-pin" + (B.S.settings.system.miniOnTop ? " on" : ""), title: "Toujours au premier plan", "aria-pressed": B.S.settings.system.miniOnTop ? "true" : "false",
      onclick: async () => { await B.set({ system: { miniOnTop: !B.S.settings.system.miniOnTop } }); const on = B.S.settings.system.miniOnTop; pin.classList.toggle("on", on); pin.setAttribute("aria-pressed", on ? "true" : "false"); } });
    pin.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4h6l-1 6 3.5 3.5h-11L10 10Z"/><path d="M12 13.5V20"/></svg>';
    const open = h("button", { class: "tb-icon", title: "Ouvrir Batblox", "aria-label": "Ouvrir Batblox", onclick: () => B.call("mini:openMain", "home") });
    open.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';
    const close = h("button", { class: "tb-icon mini-close", title: "Fermer", "aria-label": "Fermer la mini-fenêtre", onclick: () => B.call("mini:close") });
    close.innerHTML = '<svg viewBox="0 0 10 10" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.1" aria-hidden="true"><path d="M0 0l10 10M10 0L0 10"/></svg>';
    this.count = h("span", { class: "muted small" }, "");
    root.append(h("div", { class: "mini-head" }, h("img", { src: "../assets/logo-header.png", alt: "" }), h("div", { class: "min0 grow" }, h("b", {}, "Amis en ligne"), this.count), pin, open, close),
      h("div", { class: "mini-search" }, h("input", { type: "search", placeholder: "Filtrer…", value: this.q, "aria-label": "Filtrer les amis", oninput: (e) => { this.q = e.target.value; this.draw(); } })),
      this.box = h("div", { class: "mini-list", role: "list" }));
    this.load();
  },
  async load() {
    if (!B.S.active) { this.list = []; this.draw(); return; }
    try { const [l] = await Promise.all([B.call("friends:list"), B.people.load()]); this.list = l || []; } catch (_) { this.list = this.list || []; }
    this.draw();
  },
  draw() {
    const box = this.box; if (!box) return;
    B.clear(box);
    if (!B.S.active) { box.append(h("div", { class: "empty" }, "Aucun compte actif.", h("br"), h("button", { class: "btn sm pri", onclick: () => B.call("mini:openMain", "accounts") }, "Ajouter un compte"))); this.count.textContent = B.tr(""); return; }
    const rank = { jeu: 0, studio: 1, en_ligne: 2 };
    const all = this.list || [];
    const on = all.filter((f) => f.status in rank);
    const q = this.q.trim().toLowerCase();
    const l = on.filter((f) => !q || String(f.name || "").toLowerCase().includes(q) || B.people.note(f.id).toLowerCase().includes(q))
      .sort((a, b) => rank[a.status] - rank[b.status] || String(a.name || "").localeCompare(String(b.name || ""), "fr"));
    this.count.textContent = B.tr(on.length + " en ligne sur " + all.length + (B.S.snap && B.S.snap.lastRun ? " · " + B.ago(B.S.snap.lastRun) : ""));
    if (!l.length) { box.append(h("div", { class: "empty" }, all.length ? (q ? "Aucun ami en ligne ne correspond." : "Aucun ami en ligne pour le moment.") : "Ta liste d'amis apparaît après la première vérification.")); return; }
    for (const f of l) {
      const sub = f.status === "jeu" ? (f.place || "En jeu") : B.statusLabel(f.status);
      box.append(h("div", { class: "mini-item", role: "listitem" },
        h("span", { class: "avw" }, B.avatar(f.id, f.name, "sm"), h("span", { class: "fb-dot " + (f.status === "en_ligne" ? "st-on" : "st-game") })),
        h("div", { class: "main" }, h("b", { title: f.name }, f.name, B.people.chips(f.id)), h("span", { class: "muted small", title: sub }, sub)),
        f.canJoin ? h("button", { class: "btn sm pri", title: "Rejoindre " + f.name, onclick: () => B.run(() => B.call("roblox:join", f.id)).then((r) => r && B.toast("Roblox se lance…", "ok")) }, "Rejoindre") : null));
    }
  },
  onMonitor() { this.load(); },
  onAccounts() { this.load(); }
};

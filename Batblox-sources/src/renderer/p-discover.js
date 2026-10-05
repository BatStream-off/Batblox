"use strict";

// ---------------------------------------------------------------- Découvrir (comme la page « Découvrir » de Roblox)
// Accueil : rangées de jeux (amis, proches des tiens, classements). « Tout voir » ouvre le classement complet,
// la barre de recherche interroge tous les jeux Roblox. Le contenu se charge par pages (« Charger plus »).
B.pages.discover = {
  data: null, friends: [], view: "home", q: "", list: [], next: "", title: "", busy: false, tok: 0,
  async render(view) {
    const p = (this.root = h("div", { class: "page" }));
    view.append(p);
    const q = h("input", { type: "search", placeholder: "Rechercher un jeu…", "aria-label": "Rechercher un jeu", value: this.q, style: "max-width:300px",
      oninput: (e) => { this.q = e.target.value; clearTimeout(this.qt); this.qt = setTimeout(() => this.search(), 450); },
      onkeydown: (e) => { if (e.key === "Enter") { clearTimeout(this.qt); this.search(); } } });
    p.append(h("header", {}, h("div", {}, h("h1", {}, "Découvrir"), h("div", { class: "muted" }, "Tous les jeux Roblox : recherche, classements et suggestions.")),
      h("div", { class: "actions" }, q, h("button", { class: "btn", id: "d-ref", onclick: () => this.loadHome(true) }, "🔄 Actualiser"))));
    p.append(h("div", { id: "d-chips", class: "chips", style: "margin-bottom:14px" }), h("div", { id: "d-body" }));
    if (this.view === "home" || !this.data) { this.view = "home"; await this.loadHome(false); } else { this.chips(); this.draw(); }
  },
  fail(e) { return (e && e.message ? e.message : String(e)).replace(/^Error invoking remote method 'api': Error: /, ""); },
  async loadHome(force) {
    const body = B.$("#d-body"); if (!body) return;
    const tok = ++this.tok;
    const btn = B.$("#d-ref"); if (btn) btn.disabled = true;
    if (!this.data || force) { B.clear(body); body.append(h("div", { class: "card" }, h("div", { class: "row" }, h("span", { class: "dot game" }), "Recherche de jeux…"), B.skeleton(8))); }
    try {
      const [res, fr] = await Promise.all([B.call("discover:games", { force }), B.call("friends:list").catch(() => [])]);
      if (tok !== this.tok) return;
      this.data = res; this.friends = fr || [];
    } catch (e) {
      if (tok !== this.tok) return;
      if (!this.data) { B.clear(body); body.append(h("div", { class: "notice bad" }, this.fail(e)), h("div", { style: "margin-top:10px" }, h("button", { class: "btn", onclick: () => this.loadHome(true) }, "Réessayer"))); if (btn) btn.disabled = false; return; }
      B.fail(e);
    }
    if (btn) btn.disabled = false;
    this.view = "home"; this.chips(); this.draw();
  },
  chips() {
    const box = B.clear(B.$("#d-chips")); if (!box || !this.data) return;
    box.append(h("button", { class: "chip" + (this.view === "home" ? " on" : ""), onclick: () => { this.q = ""; const i = B.$("input[type=search]"); if (i) i.value = ""; this.view = "home"; this.chips(); this.draw(); } }, "Accueil"));
    for (const s of this.data.sections.filter((x) => x.token)) box.append(h("button", { class: "chip" + (this.view === "sort:" + s.token ? " on" : ""), onclick: () => this.openSort(s) }, s.title));
    if (this.view === "search") box.append(h("button", { class: "chip on" }, "Recherche : " + this.q.trim()));
  },
  async openSort(s) {
    this.view = "sort:" + s.token; this.title = s.title; this.list = s.games.slice(); this.next = ""; this.chips();
    await this.fetchPage(true, () => B.call("discover:sort", { id: s.token }), s.games.length > 0);
  },
  async search() {
    const q = this.q.trim();
    if (q.length < 2) { if (this.view === "search") { this.view = "home"; this.chips(); this.draw(); } return; }
    this.view = "search"; this.title = "Résultats pour « " + q + " »"; this.list = []; this.next = ""; this.chips();
    await this.fetchPage(true, () => B.call("discover:search", { q }), false);
  },
  async more() {
    const view = this.view, q = this.q.trim(), page = this.next;
    await this.fetchPage(false, () => (view === "search" ? B.call("discover:search", { q, page }) : B.call("discover:sort", { id: view.slice(5), page })), true);
  },
  async fetchPage(first, call, keepOnError) {
    const tok = ++this.tok; this.busy = true; this.draw(first);
    try {
      const r = await call();
      if (tok !== this.tok) return;
      const seen = new Set(first ? [] : this.list.map((g) => g.pid));
      const add = r.games.filter((g) => !seen.has(g.pid));
      this.list = first ? add : this.list.concat(add); this.next = r.next || "";
      this.err = "";
    } catch (e) {
      if (tok !== this.tok) return;
      this.err = this.fail(e);
      if (!keepOnError) this.list = [];
    }
    this.busy = false; this.draw();
  },
  tile(g) {
    const isFav = (B.S.settings.launcher.favorites || []).some((f) => f.placeId === g.pid);
    const cover = h("div", { class: "tile-cover" }, (g.name.trim()[0] || "?").toUpperCase());
    if (g.icon) { const img = h("img", { src: g.icon, alt: "" }); img.onload = () => { B.clear(cover); cover.append(img); }; }
    const meta = [g.players ? "👥 " + (g.players >= 10000 ? Math.round(g.players / 1000) + " k" : B.num(g.players)) : null, g.likes != null ? "👍 " + g.likes + " %" : null].filter(Boolean).join(" · ");
    const star = h("button", { class: "btn sm", title: isFav ? "Déjà dans les favoris" : "Ajouter aux favoris", "aria-label": "Ajouter aux favoris", disabled: isFav,
      onclick: async () => { const cur = (B.S.settings.launcher.favorites || []).filter((f) => f.placeId !== g.pid).concat({ placeId: g.pid, name: g.name }); await B.set({ launcher: { favorites: cur } }); star.disabled = true; star.textContent = "⭐"; B.toast("« " + g.name + " » ajouté aux favoris.", "ok"); } }, isFav ? "⭐" : "☆");
    return h("div", { class: "tile" }, cover, h("b", { class: "tile-name", title: g.name }, g.name), h("span", { class: "muted small" }, meta || "Jeu " + g.pid),
      h("div", { class: "row tile-act" }, h("button", { class: "btn sm pri", disabled: !B.S.active, onclick: () => B.run(() => B.call("roblox:launch", { placeId: g.pid })).then((r) => r && B.toast("Roblox se lance…", "ok")) }, "Lancer"), star));
  },
  draw(loadingFirst) {
    const body = B.$("#d-body"); if (!body) return; B.clear(body);
    if (this.view === "home") return this.drawHome(body);
    const card = h("div", { class: "card" }, h("div", { class: "row" }, h("h2", { class: "grow" }, this.title), h("span", { class: "muted small" }, this.list.length ? this.list.length + " jeu" + (this.list.length > 1 ? "x" : "") : "")));
    if (this.err) card.append(h("div", { class: "notice bad" }, this.err));
    if (this.list.length) card.append(h("div", { class: "tiles" }, this.list.map((g) => this.tile(g))));
    else if (this.busy || loadingFirst) card.append(B.skeleton(8));
    else if (!this.err) card.append(h("div", { class: "empty" }, "Aucun jeu trouvé."));
    if (this.list.length && (this.next || this.busy)) card.append(h("div", { class: "row", style: "justify-content:center;margin-top:14px" }, h("button", { class: "btn", disabled: this.busy, onclick: () => this.more() }, this.busy ? "Chargement…" : "Charger plus")));
    body.append(card);
  },
  drawHome(body) {
    if (!this.data) return;
    const byGame = new Map();
    for (const f of (this.friends || []).filter((x) => x.status === "jeu" && x.place)) {
      const k = f.pid || f.place;
      if (!byGame.has(k)) byGame.set(k, { name: f.place, pid: f.pid || "", friends: [] });
      byGame.get(k).friends.push(f);
    }
    const fr = [...byGame.values()].sort((a, b) => b.friends.length - a.friends.length).slice(0, 8);
    if (fr.length) {
      const list = h("div", { class: "rail" });
      const covers = {};
      for (const g of fr) {
        const cover = h("div", { class: "tile-cover" }, (g.name.trim()[0] || "?").toUpperCase());
        if (g.pid) (covers[g.pid] = covers[g.pid] || []).push(cover);
        const joinable = g.friends.find((f) => f.canJoin);
        list.append(h("div", { class: "tile" }, cover,
          h("b", { class: "tile-name", title: g.name }, g.name),
          h("span", { class: "muted small tile-name", title: g.friends.map((f) => f.name).join(", ") }, g.friends.length + (g.friends.length > 1 ? " amis" : " ami") + " · " + g.friends.slice(0, 2).map((f) => f.name).join(", ") + (g.friends.length > 2 ? "…" : "")),
          h("div", { class: "row tile-act" }, joinable
            ? h("button", { class: "btn sm pri", onclick: () => B.run(() => B.call("roblox:join", joinable.id)).then((r) => r && B.toast("Roblox se lance…", "ok")) }, "Rejoindre")
            : h("button", { class: "btn sm", disabled: true, title: "Aucun de ces amis ne peut être rejoint pour le moment" }, "Rejoindre"))));
      }
      body.append(h("div", { class: "card" }, h("h2", {}, "Tes amis y jouent en ce moment"), list));
      // Icônes officielles des jeux (chargées après coup, jamais bloquantes)
      const pids = Object.keys(covers);
      if (pids.length) B.call("gameicons", pids).then((map) => {
        for (const [pid, url] of Object.entries(map || {})) for (const el of covers[pid] || []) { const img = h("img", { src: url, alt: "" }); img.onload = () => { B.clear(el); el.append(img); el.classList.add("img"); }; }
      }).catch(() => {});
    }
    for (const s of this.data.sections) body.append(h("div", { class: "card" },
      h("div", { class: "row" }, h("h2", { class: "grow" }, s.title), s.token ? h("button", { class: "btn sm ghost", onclick: () => this.openSort(s) }, "Tout voir →") : null),
      h("div", { class: "rail" }, s.games.slice(0, 12).map((g) => this.tile(g)))));
    body.append(h("div", { class: "muted small" }, "Suggestions fournies par Roblox · accueil mis en cache 10 min · " + B.ago(this.data.ts)));
  }
};

"use strict";

B.pages.home = {
  render(view) {
    const a = B.S.active, s = B.S.snap || {};
    view.append(h("div", { class: "page", id: "home" }));
    const p = B.$("#home");
    if (!a) {
      p.append(h("div", { class: "card" }, h("h1", {}, "Bienvenue dans Batblox 🦇"), h("p", { class: "muted" }, "Ajoute un compte Roblox pour commencer à surveiller tes amis et lancer le jeu."), h("button", { class: "btn pri", onclick: B.addAccount }, "Ajouter un compte")));
      return;
    }
    p.append(h("header", { class: "hero" }, h("div", { class: "hero-id" }, B.avatar(a.id, a.label, "xl", a.avatarUrl), h("div", {}, h("h1", {}, B.greet() + ", " + a.label), h("div", { class: "muted" }, "Voici ce qui se passe sur ton compte Roblox."))),
      h("div", { class: "actions" }, h("button", { class: "btn", onclick: () => B.go("profile") }, "👤 Mon profil"), h("button", { class: "btn pri", id: "chk", onclick: this.check }, "Vérifier maintenant"))));
    if (a.status !== "ok") p.append(h("div", { class: "notice bad" }, "La session de ce compte n'est plus valide. ", h("button", { class: "btn sm", onclick: () => B.go("accounts") }, "Reconnecter")));
    else if (s.error) p.append(h("div", { class: "notice bad" }, s.error, " ", h("button", { class: "btn sm", onclick: () => { B.go("maint"); setTimeout(() => B.pages.maint.net(), 150); } }, "Tester la connexion")));
    p.append(h("div", { id: "home-live" }));
    this.fill();
  },
  fill() {
    const box = B.$("#home-live");
    if (!box) return;
    B.clear(box);
    const s = B.S.snap || {};
    const me = s.me;
    box.append(h("div", { class: "grid g2" },
      h("div", { class: "card" }, h("h3", { class: "eyebrow" }, "Roblox"), h("div", { class: "row" }, me ? B.dot(me.status) : h("span", { class: "dot off" }), h("b", {}, me ? B.statusLabel(me.status) : "Statut non disponible")),
        me && me.status === "jeu" && me.place ? h("div", { class: "muted" }, "Jeu actuel : " + me.place) : h("div", { class: "muted small" }, B.S.settings.monitoring.showMyStatus ? "Mis à jour à chaque vérification." : "Active « Afficher mon propre statut » dans les réglages.")),
      h("div", { class: "card" }, h("h3", { class: "eyebrow" }, "Lanceur"), h("div", { id: "home-inst", class: "muted" }, "…"),
        h("div", { class: "muted small", id: "home-target", style: "margin-top:4px" }, this.targetText()),
        h("div", { id: "home-upd", class: "small", style: "margin-top:4px" }),
        h("div", { class: "row", style: "margin-top:12px" },
          h("button", { class: "btn pri", id: "home-launch", disabled: this.launching, onclick: () => this.launch() }, this.launching ? "Lancement…" : "🎮 Lancer Roblox"),
          h("button", { class: "btn ghost sm", title: "Choisir un autre jeu", onclick: () => B.go("discover") }, "Autre jeu…")))));
    box.append(h("div", { id: "home-friends" }), h("div", { id: "home-recent" }), h("div", { id: "home-trend" }), h("div", { id: "home-games" }));
    this.fillRecent();
    this.fillTrend();
    this.fillFriends();
    this.fillUpdate();
    B.call("roblox:status").then((r) => { const el = B.$("#home-inst"); if (el) el.textContent = !r.windows ? "Disponible sous Windows uniquement." : r.installed ? `Roblox détecté · instances ouvertes : ${r.instances.length}` : "Roblox n'est pas installé."; }).catch(() => {});
  },
  // Rappel discret : visible seulement quand une mise à jour de Roblox est disponible (vérification mémorisée 10 min).
  async fillUpdate() {
    if (!B.S.windows) return;
    const u = await B.call("roblox:updateCheck", {}).catch(() => null);
    const el = B.$("#home-upd"); if (!el) return;
    B.clear(el);
    if (!u || !u.supported || u.upToDate !== false) return;
    el.append(h("span", {}, u.updating ? "⏳ Mise à jour de Roblox en cours…" : "⬆️ Une mise à jour de Roblox est disponible. "),
      u.updating ? null : h("button", { class: "btn sm", onclick: async () => { await B.updateRoblox(u.running, () => this.fillUpdate()); this.fillUpdate(); } }, "Mettre à jour"));
  },
  fillRecent() {
    const box = B.$("#home-recent"); if (!box) return;
    B.clear(box);
    const list = (B.S.snap && B.S.snap.recentGames) || [];
    const card = h("div", { class: "card" }, h("div", { class: "row" }, h("h2", { class: "grow" }, "Mes derniers jeux"), h("button", { class: "btn sm ghost", onclick: () => B.go("roblox") }, "Lanceur →")));
    if (!list.length) card.append(h("div", { class: "empty" }, "Tes jeux apparaîtront ici dès que tu en lances un avec Batblox ou que tu joues sur Roblox (le statut « Afficher mon propre statut » doit être activé)."));
    else {
      const grid = h("div", { class: "rail" });
      const covers = {};
      for (const g of list) {
        const nm = g.name || "Jeu " + g.pid;
        const cover = h("div", { class: "tile-cover" }, (nm.trim()[0] || "?").toUpperCase());
        (covers[g.pid] = covers[g.pid] || []).push(cover);
        grid.append(h("div", { class: "tile" }, cover,
          h("b", { class: "tile-name", title: nm }, nm),
          h("span", { class: "muted small" }, B.ago(g.last)),
          h("div", { class: "row tile-act" }, h("button", { class: "btn sm pri", onclick: () => B.run(() => B.call("roblox:launch", { placeId: g.pid })).then((r) => r && B.toast("Roblox se lance…", "ok")) }, "Rejouer"))));
      }
      card.append(grid);
      // Icônes officielles des jeux (chargées après coup, jamais bloquantes)
      B.call("gameicons", list.map((g) => g.pid)).then((map) => {
        for (const [pid, url] of Object.entries(map || {})) for (const el of covers[pid] || []) { const img = h("img", { src: url, alt: "" }); img.onload = () => { B.clear(el); el.append(img); el.classList.add("img"); }; }
      }).catch(() => {});
    }
    box.append(card);
  },
  async fillFriends() {
    const tok = (this.tok = (this.tok || 0) + 1);
    const list = await B.run(() => B.call("friends:list")) || [];
    const gBox = B.$("#home-games"), fBox = B.$("#home-friends");
    if (tok !== this.tok || !gBox || !fBox) return;
    B.clear(gBox); B.clear(fBox);
    const mon = B.S.settings.monitoring;

    if (mon.presenceMode !== "all") {
      fBox.append(h("div", { class: "notice" }, "Seuls les amis marqués « Suivi » sont suivis : les autres apparaissent sans statut. ",
        h("button", { class: "btn sm pri", onclick: async () => { await B.set({ monitoring: { presenceMode: "all" } }); await B.run(() => B.call("monitor:checkNow")); this.fillFriends(); } }, "Suivre tous mes amis")));
    }

    // --- Mes jeux favoris (raccourcis de lancement) ---
    const favs = B.S.settings.launcher.favorites || [];
    if (favs.length) gBox.append(h("div", { class: "card" }, h("h2", {}, "Mes jeux favoris"),
      h("div", { class: "games" }, favs.map((g) => h("div", { class: "game" }, h("div", { class: "game-cover fav" }, (g.name.trim()[0] || "?").toUpperCase()),
        h("div", { class: "game-body" }, h("b", { title: g.name }, g.name), h("span", { class: "muted small" }, "Jeu " + g.placeId)),
        h("button", { class: "btn sm", onclick: () => B.run(() => B.call("roblox:launch", { placeId: g.placeId })).then((r) => r && B.toast("Roblox se lance…", "ok")) }, "Lancer"))))));

    // --- Amis : comme sur Roblox, un rond par ami avec une pastille (gris = hors ligne, bleu = en ligne, vert = en jeu) ---
    const rank = { jeu: 0, studio: 1, en_ligne: 2 }, isOn = (f) => f.status in rank;
    const sorted = list.slice().sort((x, y) => (isOn(y) - isOn(x)) || ((rank[x.status] === undefined ? 9 : rank[x.status]) - (rank[y.status] === undefined ? 9 : rank[y.status]))
      || (isOn(x) ? 0 : (Number(y.lastOn) || 0) - (Number(x.lastOn) || 0)) || x.name.localeCompare(y.name, "fr"));
    const onCount = sorted.filter(isOn).length, MAX = 40;
    const fCard = h("div", { class: "card" }, h("div", { class: "row" }, h("h2", { class: "grow" }, "Amis en ligne"),
      h("span", { class: "muted small" }, list.length ? onCount + " / " + list.length : ""), h("button", { class: "btn sm ghost", onclick: () => B.go("friends") }, "Tout voir →")));
    if (!list.length) fCard.append(h("div", { class: "empty" }, "Ta liste d'amis apparaît après la première vérification. ", h("button", { class: "btn sm", onclick: this.check }, "Vérifier maintenant")));
    else {
      const dotClass = { jeu: "st-game", studio: "st-game", en_ligne: "st-on" };
      const row = h("div", { class: "frow", role: "list", "aria-label": "Mes amis" });
      for (const f of sorted.slice(0, MAX)) {
        const short = f.name.replace(/\s*\(@[^)]*\)\s*$/, "") || f.name;
        const sub = f.status === "jeu" ? (f.place || "En jeu") : isOn(f) ? B.statusLabel(f.status) : "Hors ligne";
        row.append(h("div", { class: "fbub" + (isOn(f) ? "" : " off"), role: "listitem", title: f.name + " — " + (f.status === "jeu" && f.place ? "En jeu : " + f.place : B.statusLabel(f.status)) },
          h("span", { class: "avw" }, B.avatar(f.id, f.name), h("span", { class: "fb-dot " + (dotClass[f.status] || "st-off"), "aria-label": B.statusLabel(f.status) })),
          h("b", {}, short), h("span", { class: "sub" }, sub),
          f.canJoin ? h("button", { class: "btn sm pri", title: "Rejoindre " + f.name, onclick: () => B.run(() => B.call("roblox:join", f.id)).then((r) => r && B.toast("Roblox se lance…", "ok")) }, "Rejoindre") : null));
      }
      fCard.append(row);
      if (sorted.length > MAX) fCard.append(h("div", { class: "muted small", style: "margin-top:4px" }, (sorted.length - MAX) + " autre(s) dans la page Amis."));
    }
    fBox.append(fCard);
  },
  // --- Jeux Roblox : les jeux en tendance (classements officiels de Roblox) ---
  async fillTrend(force) {
    const T = this.trend || (this.trend = { data: null, err: "", busy: false, sel: 0, ts: 0, scroll: 0 });
    this.drawTrend();
    if (T.busy || !B.S.active || B.S.active.status !== "ok") return;
    if (!force && T.data && Date.now() - T.ts < 600000) return;
    T.busy = true; T.err = ""; this.drawTrend();
    try { T.data = await B.call("discover:trending", { force: !!force }); T.ts = Date.now(); if (T.sel >= T.data.sections.length) T.sel = 0; }
    catch (e) { T.err = (e && e.message ? e.message : String(e)).replace(/^Error invoking remote method 'api': Error: /, ""); }
    T.busy = false;
    if (B.page === "home") this.drawTrend();
  },
  drawTrend() {
    const box = B.$("#home-trend"), T = this.trend; if (!box || !T) return;
    B.clear(box);
    const secs = (T.data && T.data.sections) || [], cur = secs[T.sel];
    const card = h("div", { class: "card" }, h("div", { class: "row wrap" }, h("h2", { class: "grow" }, "🔥 Jeux Roblox"),
      secs.length > 1 ? h("div", { class: "chips" }, secs.map((s, i) => h("button", { class: "chip" + (i === T.sel ? " on" : ""), onclick: () => { T.sel = i; T.scroll = 0; this.drawTrend(); } }, s.title))) : (cur ? h("span", { class: "muted small" }, cur.title) : null),
      h("button", { class: "btn sm ghost", onclick: () => B.go("discover") }, "Tout voir →")));
    if (T.err && !cur) card.append(h("div", { class: "notice bad" }, T.err, " ", h("button", { class: "btn sm", onclick: () => this.fillTrend(true) }, "Réessayer")));
    else if (cur) {
      const rail = h("div", { class: "rail" }, cur.games.slice(0, 12).map((g) => B.pages.discover.tile(g)));
      rail.addEventListener("scroll", () => { T.scroll = rail.scrollLeft; }, { passive: true });
      card.append(rail);
      card.append(h("div", { class: "muted small" }, "Classements fournis par Roblox · mis à jour " + B.ago(T.ts) + " · ", h("button", { class: "btn sm ghost", disabled: T.busy, onclick: () => this.fillTrend(true) }, T.busy ? "Actualisation…" : "Actualiser")));
      box.append(card);
      rail.scrollLeft = T.scroll || 0;
      return;
    } else card.append(B.skeleton(6));
    box.append(card);
  },
  // Jeu lancé par le bouton : le dernier joué avec Batblox, sinon le premier favori.
  target() {
    const recent = (B.S.snap && B.S.snap.recentGames) || [];
    if (recent.length && recent[0].pid) return { placeId: recent[0].pid, name: recent[0].name || "Jeu " + recent[0].pid, from: "dernier jeu" };
    const fav = (B.S.settings.launcher.favorites || [])[0];
    return fav ? { placeId: fav.placeId, name: fav.name, from: "favori" } : null;
  },
  targetText() {
    const t = this.target();
    return t ? "Lance : " + t.name + " (" + t.from + ")" : "Aucun jeu récent : Batblox te demandera lequel lancer.";
  },
  async askGame() {
    const i = h("input", { type: "text", placeholder: "Identifiant ou lien du jeu (ex. https://www.roblox.com/games/920587237/…)", "aria-label": "Jeu à lancer",
      onkeydown: (e) => { if (e.key === "Enter") { const b = e.target.closest(".modal").querySelector(".btn.pri"); if (b) b.click(); } } });
    const v = await B.modal({ title: "Quel jeu lancer ?", body: h("div", {}, h("p", { class: "muted small" }, "Colle l'identifiant ou le lien d'un jeu Roblox. Les prochaines fois, le bouton relancera le dernier jeu joué."), i),
      buttons: [{ label: "Annuler", value: null }, { label: "Lancer", cls: "pri", action: () => i.value.trim() || false }] });
    return v ? { placeId: v, name: "" } : null;
  },
  async launch() {
    if (this.launching) return;
    const t = this.target() || (await this.askGame());
    if (!t) return;
    const paint = () => { const b = B.$("#home-launch"); if (b) { b.disabled = !!this.launching; b.textContent = this.launching ? "Lancement…" : "🎮 Lancer Roblox"; } };
    this.launching = true; paint();
    const r = await B.run(() => B.call("roblox:launch", { placeId: t.placeId }));
    this.launching = false; paint();
    if (r) B.toast("Roblox se lance avec " + B.S.active.label + (t.name ? " — " + t.name : "") + "…", "ok");
  },
  async check() {
    const b = B.$("#chk"); if (b) b.disabled = true;
    await B.run(() => B.call("monitor:checkNow"));
    if (b) b.disabled = false;
  },
  onMonitor() { this.fill(); }
};

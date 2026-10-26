"use strict";
// Activité → Bilan du mois : temps de jeu, amis gagnés et perdus, pseudos changés, jeux préférés.
// Exportable : image PNG (capture de la carte), image copiée, texte copié, CSV.

const rcDur = (sec) => { sec = Math.round(sec || 0); const hh = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60); return !sec ? "0 min" : hh ? hh + " h " + String(m).padStart(2, "0") : m + " min"; };
const rcDay = (k) => { const [y, mo, d] = k.split("-").map(Number); return new Date(y, mo - 1, d).toLocaleDateString(B.loc(), { weekday: "long", day: "numeric", month: "long" }); };

B.pages.recap = {
  sel: null, // "AAAA-MM"
  render(view, opts) {
    const embedded = !!(opts && opts.embedded);
    this.root = h("div", { class: "page" + (embedded ? " embedded" : "") });
    view.append(this.root);
    if (!embedded) this.root.append(B.head("Bilan du mois", "Ton mois sur Roblox en un coup d'œil."));
    this.bar = h("div", { class: "row wrap rc-bar" });
    this.box = h("div", {}, h("div", { class: "card" }, B.skeleton(3)));
    this.root.append(this.bar, this.box);
    this.load();
  },
  async load() {
    const months = (await B.run(() => B.call("recap:months"))) || [];
    if (!this.root.isConnected) return;
    if (!this.sel || !months.includes(this.sel)) this.sel = months[0] || null;
    this.months = months;
    this.drawBar();
    if (!this.sel) { B.clear(this.box).append(h("div", { class: "card empty" }, "Pas encore de données : le bilan se remplit au fil des vérifications.")); return; }
    const [y, m] = this.sel.split("-").map(Number);
    const r = await B.run(() => B.call("recap:month", { y, m: m - 1 }));
    if (r && this.root.isConnected) { this.r = r; this.draw(r); }
  },
  drawBar() {
    const i = this.months.indexOf(this.sel);
    const lbl = (k) => { const [y, m] = k.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString(B.loc(), { month: "long", year: "numeric" }); };
    B.clear(this.bar).append(
      h("button", { class: "btn sm", disabled: i < 0 || i >= this.months.length - 1, title: "Mois précédent", onclick: () => { this.sel = this.months[i + 1]; this.load(); } }, "← Précédent"),
      h("select", { "aria-label": "Mois", onchange: (e) => { this.sel = e.target.value; this.load(); } }, this.months.map((k) => h("option", { value: k, selected: k === this.sel }, lbl(k)))),
      h("button", { class: "btn sm", disabled: i <= 0, title: "Mois suivant", onclick: () => { this.sel = this.months[i - 1]; this.load(); } }, "Suivant →"),
      h("span", { class: "grow" }),
      h("button", { class: "btn sm", title: "Enregistrer le bilan en image PNG", onclick: () => this.image(false) }, "🖼 Image"),
      h("button", { class: "btn sm", title: "Copier l'image (à coller dans Discord…)", onclick: () => this.image(true) }, "📋 Copier l'image"),
      h("button", { class: "btn sm", onclick: async () => { if (!this.r) return; await B.run(() => B.call("app:copy", this.r.text)); B.toast("Bilan copié en texte.", "ok"); } }, "Copier le texte"),
      h("button", { class: "btn sm", onclick: async () => { if (!this.r) return; const f = await B.run(() => B.call("recap:csv", { y: this.r.y, m: this.r.m })); if (f) B.toast("Bilan exporté : " + f, "ok"); } }, "⬇ CSV"));
  },
  draw(r) {
    const P = r.play, F = r.friends;
    const stat = (big, lbl, sub) => h("div", { class: "rc-stat" }, h("b", {}, big), h("span", {}, lbl), sub ? h("small", { class: "muted" }, sub) : null);
    const names = (list, empty) => list.length ? h("div", { class: "rc-names" }, list.slice(0, 12).map((a) => h("span", { class: "rc-name pii", title: new Date(a.ts).toLocaleDateString(B.loc()) }, a.name)), list.length > 12 ? h("span", { class: "muted small" }, "+ " + (list.length - 12)) : null) : h("span", { class: "muted small" }, empty);
    const games = (list, val, empty) => list.length ? h("ol", { class: "rc-games" }, list.map((g) => h("li", {}, h("span", { class: "game-cover" }, B.initial(g.name || "?")), h("span", { class: "rc-gname" }, g.name || "Jeu " + g.id), h("span", { class: "muted small" }, val(g))))) : h("div", { class: "muted small" }, empty);
    const card = h("div", { class: "card rc-card", id: "rc-card" },
      h("div", { class: "rc-head" }, h("img", { src: "../assets/logo-header.png", alt: "" }), h("div", {}, h("span", { class: "muted small" }, "Mon bilan Batblox"), h("h2", {}, (() => { const t = new Date(r.y, r.m, 1).toLocaleDateString(B.loc(), { month: "long", year: "numeric" }); return t.charAt(0).toUpperCase() + t.slice(1); })()))),
      h("div", { class: "rc-stats" },
        stat(rcDur(P.total), "de jeu", P.days ? P.days + " jour" + (P.days > 1 ? "s" : "") + " sur " + r.daysInMonth + ", " + rcDur(P.avg) + " en moyenne" : "aucune partie suivie"),
        stat((F.net > 0 ? "+" : "") + F.net, "ami" + (Math.abs(F.net) > 1 ? "s" : ""), "+" + F.gained.length + " gagné" + (F.gained.length > 1 ? "s" : "") + ", −" + F.removed.length + " perdu" + (F.removed.length > 1 ? "s" : "")),
        stat(String(F.renamed.length), "pseudo" + (F.renamed.length > 1 ? "s" : "") + " changé" + (F.renamed.length > 1 ? "s" : ""), F.requests ? F.requests + " demande(s) d'ami reçue(s)" : null),
        P.best ? stat(rcDur(P.best.s), "ta plus grosse journée", rcDay(P.best.day)) : stat(r.topFriend ? String(r.topFriend.plays) : "—", "parties lancées par ton ami le plus actif", r.topFriend ? h("span", { class: "pii" }, r.topFriend.name) : null)),
      h("div", { class: "rc-cols" },
        h("div", {}, h("h3", {}, "Mes jeux"), games(P.top, (g) => rcDur(g.s), "Active « Afficher mon propre statut » pour suivre ton temps de jeu.")),
        h("div", {}, h("h3", {}, "Les jeux de mes amis"), games(r.friendGames, (g) => g.players + " ami" + (g.players > 1 ? "s" : "") + ", " + g.plays + " partie" + (g.plays > 1 ? "s" : ""), "Aucun jeu lancé par tes amis ce mois-ci (ou statut non suivi)."))),
      h("div", { class: "rc-cols" },
        h("div", {}, h("h3", {}, "Nouveaux amis"), names(F.gained, "Aucun.")),
        h("div", {}, h("h3", {}, "Amis perdus"), names(F.removed, "Aucun."))),
      h("div", { class: "rc-foot muted small" }, "Batblox · calculé à partir de ton historique sur ce PC"));
    B.clear(this.box).append(card);
  },
  async image(copy) {
    const card = B.$("#rc-card"); if (!card) return;
    card.scrollIntoView({ block: "start" });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const b = card.getBoundingClientRect();
    if (b.height > window.innerHeight - b.top) B.toast("La fenêtre est trop petite pour tout capturer : agrandis-la pour une image complète.");
    const rect = { x: b.left, y: b.top, width: b.width, height: Math.min(b.height, window.innerHeight - b.top) };
    if (copy) { const ok = await B.run(() => B.call("recap:copyImage", { rect })); if (ok) B.toast("Image du bilan copiée : colle-la dans Discord ou ailleurs.", "ok"); }
    else { const f = await B.run(() => B.call("recap:image", { rect, key: this.r && this.r.key })); if (f) B.toast("Image enregistrée : " + f, "ok"); }
  },
  onHistory() { clearTimeout(this._t); this._t = setTimeout(() => this.load(), 800); }
};

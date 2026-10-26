"use strict";
// Activité → Temps de jeu : temps passé en jeu par le compte actif (aujourd'hui, 14 derniers jours, jeux les plus joués)
// et limite quotidienne avec rappel. Les données viennent du statut Roblox lu à chaque vérification (aucune requête en plus).

const ptDur = (sec) => {
  sec = Math.round(sec || 0);
  if (sec < 60) return sec ? "< 1 min" : "0 min";
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  return h ? h + " h " + String(m).padStart(2, "0") : m + " min";
};
const ptDay = (k, short) => { const [y, mo, d] = k.split("-").map(Number); const dt = new Date(y, mo - 1, d); return short ? B.DAYS[(dt.getDay() + 6) % 7] : dt.toLocaleDateString(B.loc(), { weekday: "long", day: "numeric", month: "long" }); };

B.pages.playtime = {
  render(view, opts) {
    const embedded = !!(opts && opts.embedded);
    this.root = h("div", { class: "page" + (embedded ? " embedded" : "") });
    view.append(this.root);
    if (!embedded) this.root.append(B.head("Temps de jeu", "Ton temps passé en jeu, jour par jour."));
    this.box = h("div", {});
    this.root.append(this.box);
    this.box.append(h("div", { class: "card" }, B.skeleton(3)));
    this.load();
  },

  async load() {
    const tok = (this.tok = (this.tok || 0) + 1);
    const d = await B.run(() => B.call("playtime:summary"));
    if (tok !== this.tok || !this.box || !this.box.isConnected) return;
    this.draw(d);
  },

  draw(d) {
    const box = B.clear(this.box);
    const M = B.S.settings.monitoring;
    if (!B.S.active || !d) { box.append(h("div", { class: "card empty" }, "Ajoute un compte pour suivre ton temps de jeu.")); return; }
    if (!M.showMyStatus || !M.presence) {
      box.append(h("div", { class: "notice" }, "⚠ Le temps de jeu se calcule avec ton propre statut Roblox : active « Statut en ligne » et « Afficher mon propre statut » dans Réglages → Monitoring.",
        h("button", { class: "btn sm", onclick: async () => { await B.set({ monitoring: { presence: true, showMyStatus: true } }); B.toast("Suivi du temps de jeu activé.", "ok"); this.load(); } }, "Activer")));
    }

    // --- En-tête : aujourd'hui, 7 jours, limite ---
    const lim = d.limitMin, pct = lim ? Math.min(100, Math.round((d.today / (lim * 60)) * 100)) : 0;
    const delta = d.prevWeek ? Math.round(((d.week - d.prevWeek) / d.prevWeek) * 100) : null;
    box.append(h("div", { class: "pt-top" },
      h("div", { class: "card pt-today" + (lim && d.today >= lim * 60 ? " over" : "") },
        h("span", { class: "muted small" }, d.playing ? "Aujourd'hui · en jeu maintenant" : "Aujourd'hui"),
        h("b", { class: "pt-big" }, ptDur(d.today)),
        lim ? h("div", {}, h("div", { class: "bar pt-lim" }, h("i", { style: "width:" + pct + "%" })),
          h("span", { class: "muted small" }, d.today >= lim * 60 ? "Limite de " + ptDur(lim * 60) + " atteinte" : "Encore " + ptDur(lim * 60 - d.today) + " avant ta limite de " + ptDur(lim * 60)))
          : h("span", { class: "muted small" }, d.playing && d.playing.name ? "Tu joues à " + d.playing.name : "Aucune limite quotidienne")),
      h("div", { class: "card pt-week" },
        h("span", { class: "muted small" }, "7 derniers jours"),
        h("b", { class: "pt-big" }, ptDur(d.week)),
        h("span", { class: "muted small" }, delta == null ? "Moyenne : " + ptDur(d.week / 7) + " par jour" : (delta > 0 ? "+" : "") + delta + " % par rapport à la semaine d'avant"))));

    // --- 14 derniers jours (barres) ---
    const max = Math.max(3600, ...d.series.map((x) => x.s));
    const limLine = lim ? h("i", { class: "pt-limline", style: "--f:" + Math.min(1, (lim * 60) / max).toFixed(4), title: "Limite quotidienne : " + ptDur(lim * 60) }) : null;
    box.append(h("div", { class: "card" }, h("h2", {}, "14 derniers jours"),
      h("div", { class: "pt-chart", role: "img", "aria-label": "Temps de jeu des 14 derniers jours" }, limLine,
        d.series.map((x, i) => h("div", { class: "pt-col" + (i === d.series.length - 1 ? " today" : "") + (lim && x.s >= lim * 60 ? " over" : ""), title: ptDay(x.day) + " : " + ptDur(x.s) },
          h("span", { class: "pt-val" }, x.s >= 60 ? ptDur(x.s).replace(" min", "") : ""),
          h("i", { style: "height:" + (x.s ? Math.max(3, (x.s / max) * 100) : 0) + "%" }),
          h("span", { class: "pt-lbl" }, i === d.series.length - 1 ? "Auj." : ptDay(x.day, true)))))));

    // --- Jeux ---
    const gameList = (list, empty) => list.length
      ? h("div", { class: "list bare" }, list.map((g) => h("div", { class: "item" },
          h("div", { class: "game-cover" }, B.initial(g.name || "?")),
          h("div", { class: "main" }, h("b", { title: g.name }, g.name || "Jeu " + g.id), h("span", { class: "muted small" }, ptDur(g.s))),
          /^\d+$/.test(g.id) ? h("button", { class: "btn sm", disabled: !B.S.active, onclick: () => B.run(() => B.call("roblox:launch", { placeId: g.id })).then((r) => r && B.toast("Roblox se lance…", "ok")) }, "Rejouer") : null)))
      : h("div", { class: "empty" }, empty);
    box.append(h("div", { class: "grid g2" },
      h("div", { class: "card" }, h("h2", {}, "Aujourd'hui"), gameList(d.todayGames, "Pas encore joué aujourd'hui.")),
      h("div", { class: "card" }, h("h2", {}, "Les plus joués (30 jours)"), gameList(d.top, "Tes jeux apparaîtront ici après ta première partie."))));

    // --- Réglages ---
    const presets = [0, 60, 120, 180, 240];
    const cur = B.S.settings.playtime.dailyLimitMin;
    const num = h("input", { type: "number", min: 0, max: 1440, step: 15, value: cur, style: "width:96px", "aria-label": "Limite en minutes",
      onchange: async () => { await B.set({ playtime: { dailyLimitMin: Number(num.value) || 0 } }); this.load(); } });
    box.append(h("div", { class: "card", style: "margin-top:var(--gap)" }, h("h2", {}, "Limite quotidienne"),
      B.row("Me prévenir au-delà de", "Une notification Windows quand ton temps de jeu du jour dépasse la limite (une fois par jour). Rien n'est bloqué.",
        h("div", { class: "row wrap" }, h("div", { class: "chips" }, presets.map((m) => h("button", { class: "chip" + (cur === m ? " on" : ""), onclick: async () => { await B.set({ playtime: { dailyLimitMin: m } }); this.load(); } }, m ? m / 60 + " h" : "Aucune"))),
          num, h("span", { class: "muted small" }, "min"))),
      B.row("Effacer le temps de jeu", "Supprime l'historique du temps de jeu de ce compte.", h("button", { class: "btn bad", onclick: async () => {
        if (await B.confirm("Effacer tout le temps de jeu enregistré pour ce compte ?", "Effacer", true)) { await B.run(() => B.call("playtime:clear")); this.load(); }
      } }, "Effacer"))));
    box.append(h("p", { class: "muted small", style: "margin:4px" }, "Calculé à partir de ton statut Roblox à chaque vérification (toutes les " + M.intervalSec + " s) : la précision est d'environ une vérification."));
  },

  onPlaytime() { clearTimeout(this._t); this._t = setTimeout(() => this.load(), 300); }
};

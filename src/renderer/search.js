"use strict";
// Recherche globale (Ctrl+K ou bouton « Rechercher » en haut) : pages, réglages, actions, amis, jeux.
// ↑ / ↓ pour choisir, Entrée pour ouvrir, Échap pour fermer. Les accents et majuscules sont ignorés ; une note d'ami est aussi cherchée.

(function () {
  const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  // [libellé, page, titre de la carte à atteindre, mots-clés en plus]
  const SETTINGS = [
    ["Thème", "settings", "Apparence", "sombre clair batman joker inde batcave couleur"],
    ["Couleur d'accent", "settings", "Apparence", "bleu violet vert orange rose cyan"],
    ["Taille de l'interface", "settings", "Apparence", "zoom agrandir reduire texte"],
    ["Page d'ouverture", "settings", "Apparence", "demarrage accueil"],
    ["Mode streamer", "settings", "Apparence", "live masquer pseudos avatars"],
    ["Intro vidéo au démarrage", "settings", "Apparence", "animation video"],
    ["Mode potato", "settings", "Apparence", "performance ancien pc lent"],
    ["Animations, ombres, effets, éclairs", "settings", "Apparence", "animation ombre effet eclair orage"],
    ["Son des clics", "settings", "Son", "volume bruit"],
    ["Intervalle de vérification", "settings", "Monitoring", "secondes frequence"],
    ["Afficher mon propre statut", "settings", "Monitoring", "statut temps de jeu"],
    ["Statistiques de présence", "settings", "Monitoring", "presence heures"],
    ["Relais réseau", "settings", "Réseau", "proxy roproxy"],
    ["Mises à jour de Batblox", "settings", "Mises à jour", "version github"],
    ["Démarrage avec Windows, zone de notification", "settings", "Système", "tray demarrage reduit"],
    ["Mini-fenêtre « Amis en ligne »", "settings", "Système", "petite fenetre premier plan"],
    ["Exporter / importer les données", "settings", "Données", "sauvegarde export import csv"],
    ["Réinitialiser Batblox", "settings", "Données", "effacer tout"],
    ["Sauvegarde automatique", "settings", "Sauvegarde automatique", "backup dossier semaine"],
    ["Raccourcis clavier", "settings", "Raccourcis clavier", "touches clavier ctrl"],
    ["Notifications Windows", "notifs", null, "alertes son"],
    ["Ne pas déranger", "notifs", "Ne pas déranger", "plage horaire nuit silence"],
    ["Silence pendant que je joue", "notifs", "Pendant que je joue", "en jeu partie"],
    ["Groupes d'amis", "notifs", "Groupes d'amis", "proches ecole sourdine"],
    ["Jeux surveillés", "notifs", "Jeux surveillés", "alerte jeu ami"],
    ["Résumé quotidien", "notifs", "Résumé quotidien", "discord ntfy jour"],
    ["Limite de temps de jeu", "playtime", "Limite quotidienne", "pause rappel"],
    ["Webhook Discord, ntfy", "discord", null, "telephone alertes"],
    ["Discord Rich Presence", "discord", "Discord Rich Presence", "statut discord"],
    ["Lanceur utilisé (Bloxstrap, Fishstrap…)", "roblox", null, "bloxstrap fishstrap voidstrap client"],
    ["Cache de Roblox", "maint", "Cache de Roblox", "nettoyer espace disque"],
    ["Test de connexion", "maint", "Test de connexion", "reseau probleme"],
    ["Signaler un problème", "settings", "Système", "bug rapport journal"]
  ];
  const EXTRA_PAGES = [["friends", "Amis", "friends"], ["watch", "Profils suivis", "watch"], ["history", "Historique", "history"], ["stats", "Statistiques", "stats"], ["playtime", "Temps de jeu", "roblox"], ["notifs", "Notifications", "notifs"]];

  let friendsCache = null, friendsAt = 0;

  /** Aller à une carte d'une page (par son titre) et la faire briller un instant. */
  function goCard(page, title) {
    B.go(page);
    if (!title) return;
    let tries = 0;
    const find = () => {
      const h2 = [...document.querySelectorAll("#view .card > h2")].find((x) => fold(x.textContent).trim() === fold(title));
      if (!h2) { if (tries++ < 20) setTimeout(find, 60); return; }
      const card = h2.parentElement;
      card.scrollIntoView({ behavior: "auto", block: "start" });
      card.classList.remove("flash"); void card.offsetWidth; card.classList.add("flash");
      setTimeout(() => card.classList.remove("flash"), 1600);
    };
    setTimeout(find, 50);
  }

  function items(friends) {
    const out = [];
    for (const it of B.NAV) if (Array.isArray(it)) out.push({ kind: "Page", icon: B.ICO[it[0]], label: it[1], run: () => B.go(it[0]) });
    for (const [id, label, ico] of EXTRA_PAGES) out.push({ kind: "Page", icon: B.ICO[ico], label, run: () => B.go(id) });
    for (const [label, page, card, kw] of SETTINGS) out.push({ kind: "Réglage", icon: B.ICO.settings, label, kw, run: () => goCard(page, card) });
    const A = B.S.settings.appearance;
    if (B.S.active) {
      out.push({ kind: "Action", glyph: "play", label: "Lancer Roblox", kw: "jouer demarrer", run: () => { B.go("home"); B.pages.home.launch(); } });
      out.push({ kind: "Action", glyph: "refresh", label: "Vérifier maintenant", kw: "actualiser rafraichir", run: () => B.run(() => B.call("monitor:checkNow")) });
    }
    out.push({ kind: "Action", glyph: "eyeoff", label: A.streamer ? "Désactiver le mode streamer" : "Activer le mode streamer", kw: "live masquer", run: () => B.set({ appearance: { streamer: !A.streamer } }) });
    out.push({ kind: "Action", glyph: "mini", label: "Mini-fenêtre « Amis en ligne »", kw: "petite fenetre", run: () => B.run(() => B.call("mini:toggle")) });
    out.push({ kind: "Action", glyph: "plus", label: "Ajouter un compte", kw: "connexion compte", run: () => B.addAccount() });
    if ((B.S.accounts || []).length > 1) out.push({ kind: "Action", glyph: "users", label: "Changer de compte", kw: "compte", run: () => B.switchAccount() });
    out.push({ kind: "Action", glyph: "tag", label: "Gérer les groupes d'amis", kw: "proches ecole", run: () => B.people.manage() });
    out.push({ kind: "Action", glyph: "sparkles", label: "Quoi de neuf dans Batblox", kw: "nouveautes version", run: () => B.whatsNew(true) });
    out.push({ kind: "Action", glyph: "bug", label: "Signaler un problème", kw: "bug erreur rapport aide support", run: () => B.report() });
    out.push({ kind: "Page", icon: B.ICO.stats, label: "Bilan du mois", kw: "recap mois resume partager", run: () => B.go("recap") });
    for (const f of friends || []) {
      const note = B.people.note(f.id);
      const sub = f.status === "jeu" && f.place ? "En jeu : " + f.place : B.statusLabel(f.status);
      out.push({ kind: "Ami", avatar: f, label: f.name, sub: sub + (note ? " · " + note : ""), kw: note, pii: true, run: () => B.people.open(f) });
      if (f.canJoin) out.push({ kind: "Rejoindre", avatar: f, label: "Rejoindre " + f.name, sub: f.place || "", kw: f.place, pii: true, run: () => B.run(() => B.call("roblox:join", f.id)).then((r) => r && B.toast("Roblox se lance…", "ok")) });
    }
    const games = new Map();
    for (const g of (B.S.snap && B.S.snap.recentGames) || []) if (g.pid) games.set(String(g.pid), g.name || "Jeu " + g.pid);
    for (const g of B.S.settings.launcher.favorites || []) games.set(String(g.placeId), g.name || "Jeu " + g.placeId);
    const T = B.pages.home.trend; if (T && T.data) for (const s of T.data.sections || []) for (const g of s.games || []) if (g.pid && !games.has(String(g.pid))) games.set(String(g.pid), g.name);
    for (const [pid, name] of games) out.push({ kind: "Jeu", glyph: "play", label: name, sub: "Lancer", run: () => B.run(() => B.call("roblox:launch", { placeId: pid })).then((r) => r && B.toast("Roblox se lance…", "ok")) });
    return out;
  }

  function score(it, q) {
    const l = fold(it.label), all = l + " " + fold(it.kw) + " " + fold(it.sub) + " " + fold(it.kind);
    const words = q.split(/\s+/).filter(Boolean);
    if (!words.every((w) => all.includes(w))) return -1;
    let s = 0;
    if (l.startsWith(q)) s += 100; else if (l.includes(q)) s += 60;
    for (const w of words) if (l.split(/[\s'«»()-]+/).some((x) => x.startsWith(w))) s += 15;
    s += { Action: 8, Page: 10, Ami: 6, Rejoindre: 5, Réglage: 4, Jeu: 3 }[it.kind] || 0;
    return s - l.length / 100;
  }

  B.search = {
    async open() {
      if (document.querySelector(".palette")) return;
      if (document.getElementById("intro")) return;
      const layer = B.$("#layer");
      const input = h("input", { type: "search", placeholder: "Rechercher un ami, un jeu, une page, un réglage…", "aria-label": "Rechercher", autocomplete: "off", spellcheck: "false" });
      const list = h("div", { class: "pal-list", role: "listbox", id: "pal-list" });
      const pal = h("div", { class: "palette", role: "dialog", "aria-label": "Recherche" }, h("div", { class: "pal-head" }, B.glyph("search"), input, h("kbd", {}, "Échap")), list,
        h("div", { class: "pal-foot muted small" }, h("span", {}, h("kbd", {}, "↑"), " ", h("kbd", {}, "↓"), " choisir"), h("span", {}, h("kbd", {}, "Entrée"), " ouvrir"), h("span", { class: "grow" }), h("span", {}, "Les notes de tes amis sont aussi cherchées")));
      const scrim = h("div", { class: "scrim pal-scrim", onmousedown: (e) => { if (e.target === scrim) close(); } }, pal);
      layer.append(scrim);
      input.focus();
      let all = items(friendsCache), shown = [], sel = 0;
      const close = () => { scrim.remove(); document.removeEventListener("keydown", key, true); };
      const run = (it) => { close(); setTimeout(() => it.run(), 0); };
      const draw = () => {
        const q = fold(input.value.trim());
        shown = q ? all.map((it) => [it, score(it, q)]).filter((x) => x[1] >= 0).sort((a, b) => b[1] - a[1]).slice(0, 40).map((x) => x[0])
          : all.filter((it) => it.kind === "Action" || it.kind === "Page").slice(0, 12);
        if (/^\d{4,19}$/.test(q) || /roblox\.com\/games\/\d+/.test(input.value)) {
          const pid = (/(\d{4,19})/.exec(input.value) || [])[1];
          if (pid && B.S.active) shown.unshift({ kind: "Jeu", glyph: "play", label: "Lancer le jeu " + pid, sub: "Identifiant ou lien collé", run: () => B.run(() => B.call("roblox:launch", { placeId: pid })) });
        }
        sel = Math.min(sel, Math.max(0, shown.length - 1));
        B.clear(list);
        if (!shown.length) { list.append(h("div", { class: "pal-empty muted" }, "Aucun résultat pour « " + input.value.trim() + " ».")); return; }
        let lastKind = null;
        shown.forEach((it, i) => {
          if (!q && it.kind !== lastKind) { list.append(h("div", { class: "pal-sec" }, it.kind === "Action" ? "Actions" : "Pages")); lastKind = it.kind; }
          const ico = it.avatar ? B.avatar(it.avatar.id, it.avatar.name, "sm") : it.glyph ? B.glyph(it.glyph) : (() => { const s = document.createElement("span"); s.className = "ico"; s.innerHTML = it.icon || ""; return s; })();
          list.append(h("div", { class: "pal-item" + (i === sel ? " on" : ""), role: "option", "aria-selected": i === sel ? "true" : "false", id: "pal-" + i,
            onmousemove: () => { if (sel !== i) { sel = i; mark(); } }, onclick: () => run(it) },
            h("span", { class: "pal-ico" }, ico), h("span", { class: "pal-txt" }, h("b", { class: it.pii ? "pii" : null }, it.label), it.sub ? h("span", { class: "muted small" + (it.pii ? " pii" : "") }, it.sub) : null),
            h("span", { class: "pal-kind" }, it.kind)));
        });
        input.setAttribute("aria-activedescendant", "pal-" + sel);
      };
      const mark = () => { list.querySelectorAll(".pal-item").forEach((el, i) => { el.classList.toggle("on", i === sel); el.setAttribute("aria-selected", i === sel ? "true" : "false"); }); const on = list.querySelector(".pal-item.on"); if (on) on.scrollIntoView({ block: "nearest" }); input.setAttribute("aria-activedescendant", "pal-" + sel); };
      const key = (e) => {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
        else if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); mark(); }
        else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); mark(); }
        else if (e.key === "Enter") { e.preventDefault(); if (shown[sel]) run(shown[sel]); }
      };
      document.addEventListener("keydown", key, true);
      input.addEventListener("input", () => { sel = 0; draw(); });
      draw();
      // Amis chargés en arrière-plan (cache de 60 s)
      if (B.S.active && (!friendsCache || Date.now() - friendsAt > 60000)) {
        try { const [l] = await Promise.all([B.call("friends:list"), B.people.load()]); friendsCache = l || []; friendsAt = Date.now(); if (scrim.isConnected) { all = items(friendsCache); draw(); } } catch (_) {}
      }
    }
  };
})();

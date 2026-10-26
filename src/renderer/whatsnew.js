"use strict";
// « Quoi de neuf » (une fois par version, après une mise à jour) et guide du premier lancement (trois écrans).
// Nouvelle installation (aucun compte) → guide. Mise à jour → nouveautés. Ensuite, plus rien jusqu'à la version suivante.
// Les deux restent accessibles depuis Réglages → Système.

// [titre, texte, page à ouvrir (facultatif), libellé du bouton]
B.CHANGELOG = {
  "1.6.0": {
    intro: "Une grosse mise à jour : plus fluide, plus lisible, et de nombreuses options.",
    items: [
      ["Plus rapide", "Avatars, icônes et listes de jeux gardés en cache : les pages s'affichent tout de suite, même juste après le démarrage. Mon profil n'attend plus ~4 s ses compteurs."],
      ["Intro fluide", "Plus de saccades au lancement. Tu peux aussi la passer (clic ou Échap) ou la couper dans les réglages."],
      ["Temps de jeu", "Ton temps de jeu par jour et par jeu, avec une limite quotidienne et un rappel.", "playtime", "Voir mon temps de jeu"],
      ["Jeux surveillés", "Une alerte quand un ami lance le jeu de ton choix ; un clic sur la notification pour le rejoindre.", "notifs", "Choisir mes jeux"],
      ["Groupes et notes d'amis", "Range tes amis (Proches, École…), ajoute une note sur chacun, et choisis qui te notifie.", "friends", "Ouvrir mes amis"],
      ["Bilan du mois", "Ton mois en une carte : temps de jeu, amis gagnés et perdus, jeux préférés. À partager en image.", "recap", "Voir mon bilan"],
      ["English version", "Batblox est maintenant aussi en anglais (Réglages → Apparence → Langue)."],
      ["Prochaine connexion", "Dans la fiche d'un ami : « Préviens-moi quand il se connecte », une alerte unique. La fiche montre aussi ses anciens pseudos."],
      ["Recherche globale", "Ctrl + K pour trouver un ami, un jeu, une page ou un réglage."],
      ["Mode streamer", "Masque pseudos, avatars et identifiants à l'écran pendant un live (Ctrl + Maj + S)."],
      ["Mini-fenêtre", "Tes amis en ligne dans une petite fenêtre au premier plan (Ctrl + Maj + M)."],
      ["Et aussi", "Silence pendant que je joue, résumé quotidien sur Discord / ntfy, sauvegarde automatique, couleur d'accent, taille de l'interface, page d'ouverture, raccourcis clavier, vue de tous les comptes, bouton « Signaler un problème »."]
    ]
  }
};

const cmpVer = (a, b) => { const x = String(a).split(".").map(Number), y = String(b).split(".").map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); } return 0; };
const whenIntroGone = (cb) => { const t = () => (document.getElementById("intro") ? setTimeout(t, 250) : cb()); t(); };

B.afterBoot = () => whenIntroGone(() => {
  const U = B.S.settings.ui || {}, v = B.S.version || "";
  if (!v || U.seenVersion === v) return;
  const fresh = !U.onboarded && !(B.S.accounts || []).length;
  if (fresh) B.onboarding();
  else if (B.CHANGELOG[v]) B.whatsNew();
  else B.set({ ui: { seenVersion: v, onboarded: true } });
});

/** Fenêtre des nouveautés de la version installée. force = ouverte depuis les réglages. */
B.whatsNew = async (force) => {
  const v = B.S.version || "";
  const keys = Object.keys(B.CHANGELOG).sort(cmpVer);
  const key = B.CHANGELOG[v] ? v : keys[keys.length - 1];
  const c = B.CHANGELOG[key];
  if (!c) return;
  let closeModal = null;
  const body = h("div", { class: "wn" }, h("p", { class: "muted" }, c.intro),
    h("div", { class: "wn-list" }, c.items.map(([t, d, page, cta]) => h("div", { class: "wn-item" },
      h("div", { class: "min0 grow" }, h("b", {}, t), h("div", { class: "muted small" }, d)),
      page ? h("button", { class: "btn sm", onclick: () => { if (closeModal) closeModal(true); B.go(page); } }, cta || "Voir") : null))));
  await B.modal({ title: "Quoi de neuf dans Batblox " + key, body, wide: true, ready: (cl) => { closeModal = cl; }, buttons: [{ label: "C'est parti", cls: "pri", value: true }] });
  if (!force || (B.S.settings.ui || {}).seenVersion !== v) B.set({ ui: { seenVersion: v, onboarded: true } });
};

/** Guide du premier lancement : 1. compte, 2. apparence, 3. notifications. */
B.onboarding = async () => {
  let step = 0, closeModal = null;
  const box = h("div", { class: "ob" });
  const dots = () => h("div", { class: "ob-dots", "aria-hidden": "true" }, [0, 1, 2].map((i) => h("i", { class: i === step ? "on" : i < step ? "done" : "" })));
  const toggle = (path, label, desc) => {
    const get = () => path.reduce((o, k) => o[k], B.S.settings);
    const patch = (val) => { const p = {}; let o = p; path.forEach((k, i) => { o[k] = i === path.length - 1 ? val : {}; o = o[k]; }); return p; };
    return B.row(label, desc, B.switch(get(), (val) => B.set(patch(val)), label));
  };
  const draw = () => {
    B.clear(box);
    box.append(dots());
    if (step === 0) {
      const has = (B.S.accounts || []).length > 0;
      box.append(h("h3", {}, "1. Connecte ton compte Roblox"),
        h("p", { class: "muted" }, "Une fenêtre Roblox officielle s'ouvre : Batblox ne voit jamais ton mot de passe. La session est chiffrée par Windows sur ce PC."),
        has ? h("div", { class: "notice" }, "✓ Compte connecté : " + B.S.active.label + ". Tu peux en ajouter d'autres plus tard (page Comptes).")
          : h("button", { class: "btn pri lg", onclick: async () => { await B.addAccount(); draw(); } }, "➕ Ajouter mon compte"));
    } else if (step === 1) {
      const A = B.S.settings.appearance;
      const themes = [["auto", "Automatique"], ["light", "Clair"], ["dark", "Sombre"], ["batman", "Batman"], ["joker", "Joker"], ["bat", "Batcave"], ["inde", "Inde"]];
      box.append(h("h3", {}, "2. Choisis ton apparence"),
        h("div", { class: "ob-themes" }, themes.map(([k, l]) => h("button", { class: "ob-theme th-" + k + (A.theme === k ? " on" : ""), "aria-pressed": A.theme === k ? "true" : "false", onclick: async () => { await B.set({ appearance: { theme: k } }); draw(); } }, h("i", {}), l))),
        B.row("Langue", null, h("select", { "aria-label": "Langue", onchange: async (e) => { await B.set({ appearance: { lang: e.target.value } }); B.call("app:reloadUI"); } },
          [["fr", "Français"], ["en", "English"]].map(([v, l]) => h("option", { value: v, selected: (B.S.settings.appearance.lang || "fr") === v }, l)))),
        B.row("Couleur d'accent", "Pour les thèmes Automatique, Clair et Sombre.", B.pages.settings.accentPicker()),
        toggle(["appearance", "clickSound"], "Son des clics", "Un petit son discret à chaque clic."));
    } else {
      box.append(h("h3", {}, "3. Choisis tes notifications"),
        h("p", { class: "muted" }, "Tout se règle plus tard dans Activité → Notifications."),
        toggle(["notifications", "enabled"], "Notifications Windows", "Ajouts et retraits d'amis, changements de pseudo, demandes reçues."),
        toggle(["notifications", "events", "online"], "Connexions de mes amis", "Peut être fréquent si tu as beaucoup d'amis : tu pourras le limiter à un groupe (Proches…)."),
        toggle(["notifications", "events", "ingame"], "Jeux lancés par mes amis", null),
        toggle(["notifications", "quietInGame"], "Silence pendant que je joue", "Les alertes sont regroupées en une seule à la fin de ta partie."));
    }
    box.append(h("div", { class: "ob-foot" },
      step > 0 ? h("button", { class: "btn ghost", onclick: () => { step--; draw(); } }, "← Retour") : h("button", { class: "btn ghost", onclick: () => closeModal && closeModal(true) }, "Passer le guide"),
      h("span", { class: "grow" }),
      step < 2 ? h("button", { class: "btn pri", onclick: () => { step++; draw(); } }, "Suivant") : h("button", { class: "btn pri", onclick: () => closeModal && closeModal(true) }, "Terminer")));
  };
  draw();
  await B.modal({ title: "Bienvenue dans Batblox 🦇", body: box, wide: true, ready: (cl) => { closeModal = cl; }, buttons: [] });
  await B.set({ ui: { onboarded: true, seenVersion: B.S.version || "" } });
  if (B.S.active) B.go(B.page === "accounts" ? "home" : B.page);
};

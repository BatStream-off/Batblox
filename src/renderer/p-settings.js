"use strict";

const sw = (path, label) => {
  const get = () => path.reduce((o, k) => o[k], B.S.settings);
  return B.switch(get(), (v) => { const patch = {}; let o = patch; path.forEach((k, i) => { o[k] = i === path.length - 1 ? v : {}; o = o[k]; }); B.set(patch); }, label);
};
// Champ numérique : après enregistrement, affiche la valeur réellement retenue (Batblox la borne : ex. 5 s → 15 s).
const numIn = (path, attrs) => {
  const get = () => path.reduce((o, k) => (o ? o[k] : undefined), B.S.settings);
  const i = h("input", Object.assign({ type: "number", value: get(), onchange: async () => { await setv(path, Number(i.value)); const v = get(); if (v !== undefined) i.value = v; } }, attrs));
  return i;
};
const setv = (path, v) => { const patch = {}; let o = patch; path.forEach((k, i) => { o[k] = i === path.length - 1 ? v : {}; o = o[k]; }); return B.set(patch); };

B.pages.notifs = {
  render(view, opts) {
    const N = B.S.settings.notifications, embedded = !!(opts && opts.embedded);
    const p = h("div", { class: "page" + (embedded ? " embedded" : "") });
    view.append(p);
    p.append(B.head("Notifications", "Notifications Windows pour les changements détectés.", null, embedded));
    p.append(h("div", { class: "card" },
      B.row("Activer les notifications", "Coupe toutes les notifications ; l'historique continue d'être enregistré.", sw(["notifications", "enabled"], "Notifications")),
      B.row("Son de notification", "Joue le son de Windows avec chaque notification.", sw(["notifications", "sound"], "Son")),
      B.row("Tester", "Affiche une notification Windows de test.", h("button", { class: "btn", onclick: () => B.run(() => B.call("push:test", "desktop")) }, "Envoyer un test"))));
    const ev = [["added", "Ami ajouté"], ["removed", "Ami supprimé"], ["renamed", "Changement de pseudo"], ["online", "Connexion"], ["offline", "Déconnexion"], ["ingame", "Jeu lancé"], ["req_in", "Demande d'ami"], ["followers", "Abonnés"], ["followings", "Abonnements"]];
    p.append(h("div", { class: "card" }, h("h2", {}, "Événements"), ev.map(([k, l]) => B.row(l, null, sw(["notifications", "events", k], l)))));
    p.append(h("div", { class: "card" }, h("h2", {}, "Ne pas déranger"),
      B.row("Activer la plage horaire", "Pendant cette plage, aucune notification n'est envoyée. Le monitoring continue et tout reste dans l'historique.", sw(["notifications", "quiet", "enabled"], "Ne pas déranger")),
      B.row("De / à", null, h("div", { class: "row" },
        h("input", { type: "time", value: N.quiet.from, "aria-label": "Début", onchange: (e) => setv(["notifications", "quiet", "from"], e.target.value) }), "→",
        h("input", { type: "time", value: N.quiet.to, "aria-label": "Fin", onchange: (e) => setv(["notifications", "quiet", "to"], e.target.value) })))));
    p.append(h("div", { class: "card" }, h("h2", {}, "Pendant que je joue"),
      B.row("Silence pendant que je joue", "Les notifications Windows sont retenues tant que tu es en jeu, puis une seule notification te résume tout à la fin de la partie. Discord et ntfy continuent normalement. Nécessite « Afficher mon propre statut » (Réglages → Monitoring).", sw(["notifications", "quietInGame"], "Silence pendant que je joue"))));
    p.append(h("div", { class: "card" }, h("h2", {}, "Groupes d'amis"),
      B.row("Connexions seulement pour mes groupes", "Les connexions et déconnexions ne sont notifiées que pour les amis d'un groupe où « Connexions » est coché (par exemple « Proches »). Les autres événements ne changent pas. Un groupe en « Sourdine » ne notifie plus rien.", sw(["notifications", "groupConnOnly"], "Connexions seulement pour mes groupes")),
      B.row("Groupes", "Crée tes groupes ici, puis range tes amis avec le bouton Fiche (📝) de la page Amis.", h("button", { class: "btn", onclick: () => B.people.manage() }, "⚙ Gérer les groupes"))));
    p.append(this.alertsCard());
    p.append(this.digestCard());
  },

  // Jeux surveillés : une alerte dédiée quand un ami lance l'un de ces jeux ; un clic sur la notification le rejoint.
  alertsCard() {
    const card = h("div", { class: "card", id: "ga-card" });
    const draw = () => {
      const list = B.S.settings.notifications.gameAlerts || [];
      const save = async (next) => { await B.set({ notifications: { gameAlerts: next } }); draw(); };
      const inp = h("input", { type: "text", placeholder: "Nom du jeu (ex. Blox Fruits) ou identifiant", maxlength: 60, "aria-label": "Jeu à surveiller",
        onkeydown: (e) => { if (e.key === "Enter") add(); } });
      const add = () => { const v = inp.value.trim(); if (!v) return; if (list.some((x) => x.toLowerCase() === v.toLowerCase())) { B.toast("Ce jeu est déjà surveillé."); return; } save(list.concat(v)); };
      const recent = ((B.S.snap && B.S.snap.recentGames) || []).map((g) => g.name).filter((n) => n && !list.some((x) => x.toLowerCase() === n.toLowerCase())).slice(0, 5);
      const kids = (...a) => a.filter((x) => x != null && x !== false); // jamais « null » dans append()
      B.clear(card).append(...kids(h("h2", {}, "Jeux surveillés"),
        h("p", { class: "muted small" }, "Quand un ami lance l'un de ces jeux, tu reçois une alerte dédiée, même si « Jeu lancé » est désactivé plus haut. Clique sur la notification pour le rejoindre. Un nom partiel suffit : « fruits » trouve « Blox Fruits »."),
        list.length ? h("div", { class: "chips ga-list" }, list.map((x) => h("span", { class: "chip on ga-chip" }, x,
          h("button", { class: "ga-x", title: "Ne plus surveiller « " + x + " »", "aria-label": "Retirer " + x, onclick: () => save(list.filter((y) => y !== x)) }, "✕")))) : null,
        h("div", { class: "field-row" }, inp, h("button", { class: "btn pri", onclick: add }, "➕ Surveiller")),
        recent.length ? h("div", { class: "row wrap ga-sugg" }, h("span", { class: "muted small" }, "Tes derniers jeux :"), recent.map((n) => h("button", { class: "chip", onclick: () => save(list.concat(n)) }, "+ " + n))) : null));
    };
    draw();
    return card;
  },

  // Résumé quotidien : un message par jour sur Discord / ntfy (ajouts et retraits d'amis, pseudos, temps de jeu…).
  digestCard() {
    const N = B.S.settings.notifications, D = N.digest;
    const remote = (N.discord.enabled && N.discord.url) || (N.ntfy.enabled && N.ntfy.topic);
    return h("div", { class: "card" }, h("h2", {}, "Résumé quotidien"),
      remote ? null : h("div", { class: "notice" }, "⚠ Le résumé est envoyé sur Discord ou ntfy : active l'un des deux d'abord.", h("button", { class: "btn sm", onclick: () => B.go("discord") }, "Configurer")),
      B.row("Envoyer un résumé chaque jour", "Un seul message : nouveaux amis, amis retirés, changements de pseudo, demandes reçues et ton temps de jeu de la journée.", sw(["notifications", "digest", "enabled"], "Résumé quotidien")),
      B.row("Heure d'envoi", "Si Batblox est fermé à cette heure-là, le résumé part dès sa prochaine ouverture le même jour.",
        h("input", { type: "time", value: D.time, "aria-label": "Heure du résumé", onchange: (e) => setv(["notifications", "digest", "time"], e.target.value) })),
      B.row("Aperçu", "Le résumé d'aujourd'hui, tel qu'il serait envoyé maintenant.", h("div", { class: "row" },
        h("button", { class: "btn", onclick: async () => {
          const u = await B.run(() => B.call("digest:preview")); if (!u) return;
          B.modal({ title: u.title, body: h("pre", { class: "log digest-prev", "data-allow-copy": "" }, u.text), buttons: [{ label: "Fermer", value: true }] });
        } }, "Voir l'aperçu"),
        h("button", { class: "btn", disabled: !remote, onclick: () => B.run(() => B.call("digest:test")).then((n) => n && B.toast("Résumé envoyé.", "ok")) }, "Envoyer maintenant"))));
  }
};

B.pages.discord = {
  async render(view) {
    const N = B.S.settings.notifications, R = B.S.settings.discordRpc;
    const p = h("div", { class: "page" });
    view.append(p);
    p.append(h("header", {}, h("div", {}, h("h1", {}, "Discord"), h("div", { class: "muted" }, "Alertes sur ton téléphone et statut Discord."))));
    p.append(h("div", { class: "notice" }, "⚠ Les messages envoyés vers Discord ou ntfy contiennent des pseudos et quittent Batblox. Aucune information de connexion Roblox n'est jamais envoyée."));

    const url = h("input", { type: "password", value: N.discord.url, placeholder: "https://discord.com/api/webhooks/…", autocomplete: "off", "aria-label": "Adresse du webhook Discord" });
    p.append(h("div", { class: "card" }, h("h2", {}, "Discord — Webhook"),
      B.row("Activer", "Envoie chaque alerte dans un salon Discord.", sw(["notifications", "discord", "enabled"], "Discord")),
      h("div", { class: "field-row" }, url, h("button", { class: "btn", onclick: async () => { await B.set({ notifications: { discord: { url: url.value.trim() } } }); if (B.S.settings.notifications.discord.url !== url.value.trim()) B.toast("Adresse de webhook invalide.", "bad"); else B.toast("Adresse enregistrée.", "ok"); } }, "Enregistrer")),
      B.row("Tester", "Envoie un message de test.", h("button", { class: "btn", onclick: () => B.run(() => B.call("push:test", "discord")).then((r) => r && B.toast("Message envoyé à Discord.", "ok")) }, "Envoyer un test"))));

    const server = h("input", { type: "text", value: N.ntfy.server, "aria-label": "Serveur ntfy" });
    const topic = h("input", { type: "text", value: N.ntfy.topic, placeholder: "ex. batblox-ab12cd34", "aria-label": "Sujet ntfy", autocomplete: "off" });
    p.append(h("div", { class: "card" }, h("h2", {}, "ntfy"),
      B.row("Activer", "Reçois les alertes dans l'application ntfy.", sw(["notifications", "ntfy", "enabled"], "ntfy")),
      B.row("Serveur", "Doit utiliser https.", server),
      B.row("Sujet (topic)", "Lettres, chiffres, tiret et tiret bas. Choisis-en un difficile à deviner : toute personne qui le connaît peut lire tes alertes.", h("div", { class: "row" }, topic,
        h("button", { class: "btn", onclick: () => { topic.value = "batblox-" + Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, "0")).join(""); } }, "Aléatoire"))),
      h("div", { class: "field-row" }, h("div", { class: "grow" }), h("button", { class: "btn", onclick: async () => {
        const want = topic.value.trim();
        await B.set({ notifications: { ntfy: { server: server.value.trim(), topic: want } } });
        const got = B.S.settings.notifications.ntfy;
        server.value = got.server; topic.value = got.topic;
        if (want && !got.topic) B.toast("Sujet refusé : 1 à 64 caractères, lettres, chiffres, « - » et « _ » uniquement.", "bad");
        else B.toast("ntfy enregistré.", "ok");
      } }, "Enregistrer")),
      B.row("Tester", "Envoie un message de test.", h("button", { class: "btn", onclick: () => B.run(() => B.call("push:test", "ntfy")).then((r) => r && B.toast("Message envoyé à ntfy.", "ok")) }, "Envoyer un test"))));

    const cid = h("input", { type: "text", value: R.clientId, placeholder: "Identifiant d'application Discord", "aria-label": "Identifiant d'application Discord" });
    const state = h("div", { class: "muted small", id: "rpc-state" });
    p.append(h("div", { class: "card" }, h("h2", {}, "Discord Rich Presence"),
      h("p", { class: "muted small" }, "Affiche sur ton profil Discord que tu joues à Roblox, avec le nom du jeu et le temps de jeu. Il faut créer une application sur discord.com/developers et coller son identifiant (« Application ID »). L'application Discord doit être ouverte sur cet ordinateur, et « Partager mon activité » activé dans Discord (Paramètres → Confidentialité des activités). La présence n'apparaît que lorsque Roblox est ouvert."),
      B.row("Activer", "Mise à jour automatique toutes les 15 secondes.", sw(["discordRpc", "enabled"], "Rich Presence")),
      h("div", { class: "field-row" }, cid, h("button", { class: "btn", onclick: async () => { await B.set({ discordRpc: { clientId: cid.value.trim() } }); B.toast("Identifiant enregistré.", "ok"); this.state(); } }, "Enregistrer"), h("button", { class: "btn", title: "Relance la connexion à Discord maintenant", onclick: async () => { await B.run(() => B.call("rpc:retry")); this.state(); } }, "Réessayer")),
      h("div", { class: "field-row" }, state)));
    this.state();
  },
  async state() {
    const s = await B.run(() => B.call("rpc:state")); const el = B.$("#rpc-state"); if (!el || !s) return;
    const on = B.S.settings.discordRpc.enabled;
    el.textContent = B.tr(s.error ? "⚠ " + s.error
      : s.ready ? (s.playing ? "● Connecté à Discord — présence affichée" : "● Connecté à Discord — la présence s'affichera dès que Roblox sera ouvert")
      : on ? (s.connecting ? "Connexion à Discord…" : "En attente de Discord…") : "Désactivé");
    clearTimeout(this._t); if (on) this._t = setTimeout(() => B.page === "discord" && this.state(), s.ready ? 8000 : 3000);
  }
};

B.pages.settings = {
  render(view) {
    const S = B.S.settings, A = S.appearance, M = S.monitoring;
    const p = h("div", { class: "page" });
    view.append(p);
    p.append(h("header", {}, h("div", {}, h("h1", {}, "Réglages"), h("div", { class: "muted" }, "Batblox v" + (B.S.version || "")))));
    p.append(h("div", { class: "card" }, h("h2", {}, "Apparence"),
      B.row("Thème", "Auto suit le thème de Windows. Batcave, Joker, Batman : thèmes sombres ; Inde : thème clair safran, blanc et vert.", h("select", { "aria-label": "Thème", onchange: (e) => setv(["appearance", "theme"], e.target.value) },
        [["auto", "Automatique"], ["light", "Clair"], ["dark", "Sombre"], ["bat", "Batcave Neon"], ["joker", "Joker"], ["batman", "Batman"], ["inde", "Inde"]].map(([v, l]) => h("option", { value: v, selected: A.theme === v }, l)))),
      B.row("Langue", "Langue de l'interface. Le changement recharge la fenêtre.", h("select", { "aria-label": "Langue", onchange: async (e) => { await setv(["appearance", "lang"], e.target.value); B.call("app:reloadUI"); } },
        [["fr", "Français"], ["en", "English"]].map(([v, l]) => h("option", { value: v, selected: (A.lang || "fr") === v }, l)))),
      B.row("Couleur d'accent", "Boutons, liens et éléments actifs des thèmes Clair, Sombre et Automatique. Les autres thèmes gardent leurs couleurs.", this.accentPicker()),
      B.row("Taille de l'interface", "Agrandit ou réduit tout le texte et les éléments. Raccourcis : Ctrl + + / Ctrl + − / Ctrl + 0.", this.zoomPicker()),
      B.row("Page d'ouverture", "La page affichée quand Batblox s'ouvre.", h("select", { "aria-label": "Page d'ouverture", onchange: (e) => setv(["appearance", "startPage"], e.target.value) },
        [["home", "Accueil"], ["discover", "Découvrir"], ["profile", "Mon profil"], ["activity", "Activité"], ["messages", "Messages"], ["roblox", "Roblox"]].map(([v, l]) => h("option", { value: v, selected: (A.startPage || "home") === v }, l)))),
      B.row("Mode streamer", "Masque à l'écran les pseudos, avatars, identifiants et messages, et rend les notifications Windows anonymes. Pratique pour partager ton écran ou faire un live. Raccourci : Ctrl + Maj + S, ou l'icône en haut.", sw(["appearance", "streamer"], "Mode streamer")),
      B.row("Intro vidéo au démarrage", "La courte animation jouée à l'ouverture de Batblox. Tu peux aussi la passer d'un clic ou avec Échap.", sw(["appearance", "intro"], "Intro vidéo")),
      B.row("Mode potato", "Aucun effet ni animation : pour les ordinateurs anciens. Tout fonctionne pareil.", sw(["appearance", "potato"], "Mode potato")),
      B.row("Animations", null, sw(["appearance", "animations"], "Animations")),
      B.row("Ombres", null, sw(["appearance", "shadows"], "Ombres")),
      B.row("Effets", "Lueur des thèmes Batcave, Joker, Batman et Inde qui suit la souris.", sw(["appearance", "effects"], "Effets")),
      B.row("Éclairs", "Active ou désactive les éclairs d'orage. Cette option ne concerne que le thème Batman : sur les autres thèmes, elle n'a aucun effet. Les éclairs nécessitent aussi que les Effets et les animations soient activés et que le mode potato soit coupé.", sw(["appearance", "lightning"], "Éclairs (thème Batman)"))));
    const snd = B.switch(A.clickSound !== false, (v) => { B.sound.enabled = v; setv(["appearance", "clickSound"], v); }, "Son des clics");
    snd.querySelector("input").dataset.soundPref = "1";
    p.append(h("div", { class: "card" }, h("h2", {}, "Son"),
      B.row("Son des clics", "Un petit son satisfaisant à chaque clic sur un bouton, un onglet ou un interrupteur.", snd),
      B.row("Volume", "Le son reste volontairement discret.", h("div", { class: "range-wrap" },
        h("input", { type: "range", min: 0, max: 100, step: 5, value: A.clickVolume == null ? 40 : A.clickVolume, "aria-label": "Volume du son des clics",
          style: `--p:${A.clickVolume == null ? 40 : A.clickVolume}%`,
          oninput: (e) => { B.sound.volume = e.target.value / 100; e.target.style.setProperty("--p", e.target.value + "%"); e.target.nextSibling.textContent = e.target.value + " %"; },
          onchange: (e) => { setv(["appearance", "clickVolume"], Number(e.target.value)); B.sound.play("click", true); } }),
        h("span", { class: "range-val" }, (A.clickVolume == null ? 40 : A.clickVolume) + " %"))),
      B.row("Tester", "Joue le son tel que tu l'entendras.", h("button", { class: "btn", "data-no-sound": "1", onclick: () => B.sound.play("pri", true) }, "🔊 Écouter"))));
    p.append(h("div", { class: "card" }, h("h2", {}, "Monitoring"),
      B.row("Monitoring activé", "Met toutes les vérifications en pause ou les reprend.", sw(["monitoring", "enabled"], "Monitoring")),
      B.row("Intervalle de vérification", "En secondes (15 à 3600). Des vérifications trop rapides peuvent faire ralentir ton compte par Roblox : 60 s est un bon réglage.",
        numIn(["monitoring", "intervalSec"], { min: 15, max: 3600, style: "width:90px", "aria-label": "Intervalle en secondes" })),
      B.row("Liste d'amis", "Ajouts et retraits d'amis.", sw(["monitoring", "friends"], "Amis")),
      B.row("Changements de pseudo", null, sw(["monitoring", "names"], "Pseudos")),
      B.row("Abonnés et abonnements", null, sw(["monitoring", "follows"], "Abonnés")),
      B.row("Demandes d'ami reçues", null, sw(["monitoring", "requests"], "Demandes")),
      B.row("Statut en ligne", "Connexions, déconnexions et jeux lancés.", sw(["monitoring", "presence"], "Statut")),
      B.row("Amis dont on suit le statut", "« Tous » surveille le statut de tout le monde ; « Sélectionnés » seulement les personnes suivies (bouton « Suivi » dans la page Amis, ou Profils suivis).", h("select", { "aria-label": "Amis suivis", onchange: (e) => setv(["monitoring", "presenceMode"], e.target.value) },
        [["favorites", "Amis sélectionnés"], ["all", "Tous mes amis"]].map(([v, l]) => h("option", { value: v, selected: M.presenceMode === v }, l)))),
      B.row("Afficher mon propre statut", "Visible dans l'accueil, jamais de notification.", sw(["monitoring", "showMyStatus"], "Mon statut")),
      B.row("Délai d'inactivité (jours)", "Au-delà, Batblox propose d'arrêter le suivi d'un ami absent. Rien n'est retiré sans ton accord.", numIn(["monitoring", "idleDays"], { min: 1, max: 365, style: "width:90px", "aria-label": "Jours" })),
      B.row("Statistiques de présence", "Collecte l'heure de connexion de tes amis pour la carte de présence globale. Les personnes que tu suis sont toujours collectées. Désactivé par défaut.", sw(["monitoring", "presenceStats"], "Statistiques de présence"))));
    const px = h("input", { type: "text", value: (S.network && S.network.publicProxy) || "", placeholder: "vide = direct", style: "width:180px", "aria-label": "Relais pour les profils suivis", spellcheck: "false" });
    p.append(h("div", { class: "card" }, h("h2", {}, "Réseau"),
      B.row("Profils suivis sans ton compte", "Les profils suivis sont lus par un second chemin, sans ta session Roblox : le compte est moins sollicité et évite les « Roblox demande de ralentir ». Aucun cookie n'est jamais envoyé par ce chemin.", h("span", { class: "muted" }, "Toujours actif")),
      B.row("Relais (facultatif)", "Un nom de domaine, par exemple roproxy.com. Les requêtes publiques des profils suivis passent alors par ce service tiers (autre adresse, autre quota) ; s'il est en panne, Batblox revient en direct. Laisse vide pour ne rien envoyer à un tiers.",
        h("div", { class: "field-row" }, px, h("button", { class: "btn", onclick: async () => { await B.set({ network: { publicProxy: px.value.trim() } }); B.toast("Relais enregistré.", "ok"); } }, "Enregistrer")))));
    p.append(this.updateCard());
    p.append(h("div", { class: "card" }, h("h2", {}, "Système"),
      B.row("Réduire dans la zone de notification à la fermeture", "Batblox continue la surveillance en arrière-plan.", sw(["system", "trayOnClose"], "Zone de notification")),
      B.row("Lancer Batblox au démarrage de Windows", null, sw(["system", "launchAtStartup"], "Démarrage")),
      B.row("Démarrer réduit", "Au démarrage de Windows, Batblox reste dans la zone de notification.", sw(["system", "startMinimized"], "Démarrer réduit")),
      B.row("Mini-fenêtre « Amis en ligne »", "Une petite fenêtre avec tes amis en ligne et un bouton Rejoindre. Aussi depuis l'icône de la zone de notification ou Ctrl + Maj + M.", h("button", { class: "btn", onclick: () => B.run(() => B.call("mini:toggle", true)) }, "Ouvrir")),
      B.row("Mini-fenêtre toujours au premier plan", "Elle reste visible par-dessus les autres fenêtres, y compris Roblox en mode fenêtré.", sw(["system", "miniOnTop"], "Mini-fenêtre au premier plan")),
      B.row("Nouveautés de cette version", null, h("button", { class: "btn", onclick: () => B.whatsNew(true) }, "✨ Quoi de neuf")),
      B.row("Signaler un problème", "Prépare un rapport (version, système, réglages et journal) sans aucune information de connexion, à copier ou enregistrer.", h("button", { class: "btn", onclick: () => B.report() }, "🐞 Préparer un rapport")),
      B.row("Guide de démarrage", "Les trois écrans du premier lancement : compte, apparence, notifications.", h("button", { class: "btn", onclick: () => B.onboarding() }, "Revoir le guide"))));
    p.append(h("div", { class: "card" }, h("h2", {}, "Données"),
      B.row("Exporter", "Historique, profils suivis, statistiques et réglages. Aucune information de connexion Roblox ni adresse de webhook n'est incluse.", h("button", { class: "btn", onclick: async () => { const f = await B.run(() => B.call("data:export")); if (f) B.toast("Sauvegarde enregistrée : " + f, "ok"); } }, "Exporter")),
      B.row("Importer", "Fichier Batblox ou sauvegarde de l'ancienne extension.", h("div", { class: "row" },
        h("button", { class: "btn", onclick: () => this.imp("merge") }, "Fusionner"), h("button", { class: "btn", onclick: async () => { if (await B.confirm("Remplacer l'historique, les profils suivis et les statistiques par ceux du fichier ?", "Remplacer", true)) this.imp("replace"); } }, "Remplacer"))),
      this.cacheRow(),
      B.row("Export CSV de l'historique", null, h("button", { class: "btn", onclick: async () => { const f = await B.run(() => B.call("history:csv")); if (f) B.toast("Exporté : " + f, "ok"); } }, "Exporter en CSV")),
      B.row("Effacer l'historique", null, h("button", { class: "btn bad", onclick: async () => { if (await B.confirm("Effacer tout l'historique ?", "Effacer", true)) { await B.run(() => B.call("history:clear")); B.toast("Historique effacé.", "ok"); } } }, "Effacer")),
      B.row("Réinitialiser Batblox", "Remet les réglages par défaut et efface historique, profils suivis et statistiques. Les comptes sont conservés.", h("button", { class: "btn bad", onclick: async () => { if (await B.confirm("Tout réinitialiser ? Cette action est définitive.", "Réinitialiser", true)) { await B.run(() => B.call("data:reset")); B.toast("Batblox a été réinitialisé.", "ok"); B.renderPage(); } } }, "Réinitialiser"))));
    p.append(this.backupCard());
    p.append(h("div", { class: "card" }, h("h2", {}, "Raccourcis clavier"),
      h("div", { class: "kbd-list" }, B.SHORTCUTS.map(([k, d]) => h("div", { class: "kbd-row" }, h("span", { class: "kbd-keys" }, k.split(" ou ").map((part, i) => [i ? h("span", { class: "muted small" }, " ou ") : null, part.split(" / ").map((combo, j) => [j ? h("span", { class: "muted" }, " / ") : null, h("kbd", {}, combo)])])), h("span", { class: "muted" }, d))))));
    this.sectionBar(p);
  },
  // Cache de Batblox : taille, taux de réussite, bouton pour vider (les données se rechargent toutes seules).
  cacheRow() {
    const info = h("small", {}, "…");
    const lbl = h("div", { class: "lbl" }, "Cache de Batblox", h("small", {}, "Avatars, icônes de jeux et listes de jeux gardés sur ce PC pour afficher les pages tout de suite, même au démarrage. Aucune donnée de connexion. Le vider ne supprime rien d'important : tout se recharge au besoin."), info);
    const draw = async () => {
      const c = await B.call("cache:info").catch(() => null);
      if (!c) { info.textContent = ""; return; }
      info.textContent = B.tr(c.entries + " élément(s) en mémoire, " + c.disk + " sur le disque (" + B.bytes(c.bytes) + ")" + (c.hitRate != null ? " · " + c.hitRate + " % des demandes servies sans attendre Roblox" : ""));
    };
    draw();
    return h("div", { class: "field-row" }, lbl, h("button", { class: "btn", onclick: async () => { const n = await B.run(() => B.call("cache:clear")); if (n != null) { B.toast("Cache vidé.", "ok"); draw(); } } }, "Vider le cache"));
  },
  accentPicker() {
    const A = B.S.settings.appearance;
    const names = { bleu: "Bleu", violet: "Violet", vert: "Vert", orange: "Orange", rose: "Rose", cyan: "Cyan" };
    const wrap = h("div", { class: "swatches", role: "radiogroup", "aria-label": "Couleur d'accent" });
    const draw = () => {
      B.clear(wrap);
      const on = ["light", "dark", "auto"].includes(B.S.settings.appearance.theme);
      for (const [k, l] of Object.entries(names)) wrap.append(h("button", { class: "swatch sw-" + k + ((B.S.settings.appearance.accent || "bleu") === k ? " on" : ""), role: "radio", "aria-checked": (B.S.settings.appearance.accent || "bleu") === k ? "true" : "false", title: l + (on ? "" : " (thèmes Clair, Sombre et Auto)"), "aria-label": l,
        onclick: async () => { await setv(["appearance", "accent"], k); draw(); } }));
    };
    draw();
    return wrap;
  },
  zoomPicker() {
    const z = B.S.settings.appearance.zoom || 100;
    return h("div", { class: "range-wrap" },
      h("input", { type: "range", min: 80, max: 130, step: 10, value: z, "aria-label": "Taille de l'interface", style: `--p:${((z - 80) / 50) * 100}%`,
        oninput: (e) => { e.target.style.setProperty("--p", ((e.target.value - 80) / 50) * 100 + "%"); e.target.nextSibling.textContent = e.target.value + " %"; },
        onchange: (e) => setv(["appearance", "zoom"], Number(e.target.value)) }),
      h("span", { class: "range-val" }, z + " %"));
  },

  // Sauvegarde automatique : une copie des données chaque semaine dans un dossier choisi (clé USB, OneDrive…), les plus anciennes supprimées.
  backupCard() {
    const card = h("div", { class: "card", id: "bk-card" });
    const draw = (st) => {
      const Bk = B.S.settings.backup;
      const stTxt = !st ? "…" : st.error ? "⚠ Dernier essai échoué : " + st.error
        : st.lastAt ? "Dernière sauvegarde : " + new Date(st.lastAt).toLocaleString(B.loc(), { dateStyle: "medium", timeStyle: "short" }) + (Bk.enabled && st.nextAt ? " · prochaine : " + new Date(st.nextAt).toLocaleDateString(B.loc(), { weekday: "long", day: "numeric", month: "long" }) : "")
        : "Aucune sauvegarde automatique pour le moment.";
      B.clear(card).append(h("h2", {}, "Sauvegarde automatique"),
        B.row("Sauvegarder chaque semaine", "Même contenu que « Exporter » : historique, profils suivis, statistiques, temps de jeu et réglages. Jamais d'information de connexion Roblox.", sw(["backup", "enabled"], "Sauvegarde automatique")),
        B.row("Dossier", Bk.dir ? h("span", { class: "bk-dir", title: Bk.dir, "data-allow-copy": "" }, Bk.dir) : "Aucun dossier choisi. Un dossier synchronisé (OneDrive…) ou une clé USB protège aussi contre une panne du PC.",
          h("div", { class: "row" }, Bk.dir ? h("button", { class: "btn", onclick: () => B.run(() => B.call("backup:open")) }, "📂 Ouvrir") : null,
            h("button", { class: "btn", onclick: async () => { const d = await B.run(() => B.call("backup:pickDir")); if (d) { B.toast("Dossier enregistré.", "ok"); load(); } } }, Bk.dir ? "Changer…" : "Choisir…"))),
        B.row("Copies conservées", "Les plus anciennes sauvegardes automatiques sont supprimées au-delà. Tes autres fichiers ne sont jamais touchés.", numIn(["backup", "keep"], { min: 1, max: 52, style: "width:90px", "aria-label": "Nombre de copies" })),
        h("div", { class: "upd-row" }, h("div", { class: "muted small upd-info", role: "status" }, stTxt),
          h("button", { class: "btn pri upd-btn", disabled: !Bk.dir, onclick: async () => { const f = await B.run(() => B.call("backup:now")); if (f) B.toast("Sauvegarde enregistrée : " + f, "ok"); load(); } }, "Sauvegarder maintenant")));
    };
    const load = async () => { const st = await B.call("backup:state").catch(() => null); if (card.isConnected || !card.parentNode) draw(st); };
    this.onBackup = (st) => { if (card.isConnected) draw(st); };
    draw(B.S.backup || null);
    load();
    return card;
  },

  // Barre de sections collante : un clic fait défiler jusqu'à la carte ; la section visible est mise en évidence.
  sectionBar(p) {
    const cards = Array.from(p.children).filter((c) => c.classList.contains("card") && c.querySelector(":scope > h2"));
    if (cards.length < 3) return;
    const chips = cards.map((c, i) => {
      c.id = c.id || "set-" + i;
      return h("button", { class: "chip", type: "button", onclick: () => c.scrollIntoView({ behavior: B.S.settings.appearance.animations ? "smooth" : "auto", block: "start" }) }, c.querySelector(":scope > h2").textContent.trim());
    });
    const bar = h("div", { class: "secbar chips", role: "navigation", "aria-label": "Sections des réglages" }, chips);
    p.insertBefore(bar, cards[0]);
    const view = B.$("#view");
    const mark = () => {
      if (!bar.isConnected) { view.removeEventListener("scroll", mark); return; }
      const vt = view.getBoundingClientRect().top;
      // Collée en haut ? (la position « sticky » se compte depuis la marge intérieure de la zone de contenu) : fond seulement dans ce cas
      const stick = vt + (parseFloat(getComputedStyle(view).paddingTop) || 0) + (parseFloat(getComputedStyle(bar).top) || 0);
      bar.classList.toggle("stuck", view.scrollTop > 0 && bar.getBoundingClientRect().top <= stick + 1);
      const top = vt + 90;
      let cur = 0;
      cards.forEach((c, i) => { if (c.getBoundingClientRect().top <= top) cur = i; });
      if (view.scrollTop + view.clientHeight >= view.scrollHeight - 4) cur = cards.length - 1;
      chips.forEach((b, i) => { b.classList.toggle("on", i === cur); if (i === cur) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current"); });
    };
    view.addEventListener("scroll", mark, { passive: true });
    mark();
  },
  updateCard() {
    const card = h("div", { class: "card" }, h("h2", {}, "Mises à jour"));
    const info = h("div", { class: "muted small upd-info", role: "status" });
    const btn = h("button", { class: "btn pri upd-btn" }, "Vérifier les mises à jour");
    const draw = (st) => {
      const L = st && st.latest;
      btn.disabled = !!(st && st.busy);
      if (!st) { info.textContent = B.tr(""); return; }
      if (st.busy) { btn.textContent = B.tr("Téléchargement…" + (st.progress ? " " + st.progress + " %" : "")); info.textContent = B.tr("Ne ferme pas Batblox : l'installeur se lancera tout seul."); return; }
      if (st.error) { btn.textContent = B.tr("Vérifier les mises à jour"); info.textContent = B.tr("⚠ " + st.error); return; }
      if (st.available && L) {
        btn.textContent = B.tr(st.portable || !L.installer ? "Ouvrir la page de téléchargement" : "Mettre à jour vers v" + L.version);
        info.textContent = B.tr("Nouvelle version disponible : v" + L.version + (L.notes ? "\n\n" + L.notes : "") + (st.portable ? "\n\nVersion portable : le fichier est à télécharger depuis GitHub." : ""));
        info.style.whiteSpace = "pre-wrap";
        return;
      }
      btn.textContent = B.tr("Vérifier les mises à jour");
      info.textContent = B.tr(st.checkedAt ? "Batblox est à jour (v" + st.current + ")." : "");
    };
    let cur = null;
    btn.onclick = async () => {
      if (cur && cur.available && cur.latest) {
        if (!cur.portable && cur.latest.installer && !(await B.confirm("Télécharger Batblox v" + cur.latest.version + " depuis GitHub puis l'installer ? Batblox va se fermer pendant l'installation. Tes comptes, réglages et historique sont conservés.", "Mettre à jour"))) return;
        btn.disabled = true; btn.textContent = B.tr("Téléchargement…");
        const timer = setInterval(async () => { const s = await B.call("update:state").catch(() => null); if (s && s.busy) draw(s); }, 700);
        const r = await B.run(() => B.call("update:install"));
        clearInterval(timer);
        if (r && r.launched) { B.toast("Installeur lancé : Batblox va se fermer.", "ok"); return; }
        if (r && r.manual) B.toast("Page de téléchargement ouverte dans ton navigateur.", "ok");
        draw(await B.call("update:state").catch(() => cur));
        return;
      }
      btn.disabled = true; btn.textContent = B.tr("Vérification…");
      const st = await B.run(() => B.call("update:check"));
      cur = st || cur; draw(cur);
      if (st && !st.error && !st.available) B.toast("Batblox est à jour.", "ok");
    };
    card.append(
      B.row("Version installée", "Les nouvelles versions sont publiées sur GitHub (BatStream-off/Batblox). Batblox les télécharge et les installe pour toi.", h("span", { class: "muted" }, "v" + (B.S.version || ""))),
      B.row("Vérifier au démarrage", "Une vérification discrète quelques secondes après l'ouverture ; rien n'est installé sans ton accord.", sw(["updates", "checkOnStart"], "Vérifier au démarrage")),
      h("div", { class: "upd-row" }, info, btn));
    B.call("update:state").then((st) => { cur = st; draw(cur); }).catch(() => {});
    return card;
  },
  async imp(mode) {
    const r = await B.run(() => B.call("data:import", { mode }));
    if (r) B.toast(`Import terminé (${r.source === "extension" ? "ancienne extension" : "Batblox"}) : ${r.history} événement(s), ${r.watched} profil(s) suivi(s).`, "ok");
  }
};

"use strict";

const sw = (path, label) => {
  const get = () => path.reduce((o, k) => o[k], B.S.settings);
  return B.switch(get(), (v) => { const patch = {}; let o = patch; path.forEach((k, i) => { o[k] = i === path.length - 1 ? v : {}; o = o[k]; }); B.set(patch); }, label);
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
      h("div", { class: "field-row" }, h("div", { class: "grow" }), h("button", { class: "btn", onclick: async () => { await B.set({ notifications: { ntfy: { server: server.value.trim(), topic: topic.value.trim() } } }); B.toast("ntfy enregistré.", "ok"); } }, "Enregistrer")),
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
    el.textContent = s.error ? "⚠ " + s.error
      : s.ready ? (s.playing ? "● Connecté à Discord — présence affichée" : "● Connecté à Discord — la présence s'affichera dès que Roblox sera ouvert")
      : on ? (s.connecting ? "Connexion à Discord…" : "En attente de Discord…") : "Désactivé";
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
      B.row("Mode potato", "Aucun effet ni animation : pour les ordinateurs anciens. Tout fonctionne pareil.", sw(["appearance", "potato"], "Mode potato")),
      B.row("Animations", null, sw(["appearance", "animations"], "Animations")),
      B.row("Ombres", null, sw(["appearance", "shadows"], "Ombres")),
      B.row("Effets", "Lueur des thèmes Batcave, Joker, Batman et Inde qui suit la souris.", sw(["appearance", "effects"], "Effets"))));
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
        h("input", { type: "number", min: 15, max: 3600, value: M.intervalSec, style: "width:90px", "aria-label": "Intervalle en secondes", onchange: (e) => setv(["monitoring", "intervalSec"], Number(e.target.value)) })),
      B.row("Liste d'amis", "Ajouts et retraits d'amis.", sw(["monitoring", "friends"], "Amis")),
      B.row("Changements de pseudo", null, sw(["monitoring", "names"], "Pseudos")),
      B.row("Abonnés et abonnements", null, sw(["monitoring", "follows"], "Abonnés")),
      B.row("Demandes d'ami reçues", null, sw(["monitoring", "requests"], "Demandes")),
      B.row("Statut en ligne", "Connexions, déconnexions et jeux lancés.", sw(["monitoring", "presence"], "Statut")),
      B.row("Amis dont on suit le statut", "« Tous » surveille le statut de tout le monde ; « Sélectionnés » seulement les personnes suivies (🔔 dans la page Amis, ou Profils suivis).", h("select", { "aria-label": "Amis suivis", onchange: (e) => setv(["monitoring", "presenceMode"], e.target.value) },
        [["favorites", "Amis sélectionnés"], ["all", "Tous mes amis"]].map(([v, l]) => h("option", { value: v, selected: M.presenceMode === v }, l)))),
      B.row("Afficher mon propre statut", "Visible dans l'accueil, jamais de notification.", sw(["monitoring", "showMyStatus"], "Mon statut")),
      B.row("Délai d'inactivité (jours)", "Au-delà, Batblox propose d'arrêter le suivi d'un ami absent. Rien n'est retiré sans ton accord.", h("input", { type: "number", min: 1, max: 365, value: M.idleDays, style: "width:90px", "aria-label": "Jours", onchange: (e) => setv(["monitoring", "idleDays"], Number(e.target.value)) })),
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
      B.row("Démarrer réduit", "Au démarrage de Windows, Batblox reste dans la zone de notification.", sw(["system", "startMinimized"], "Démarrer réduit"))));
    p.append(h("div", { class: "card" }, h("h2", {}, "Données"),
      B.row("Exporter", "Historique, profils suivis, statistiques et réglages. Aucune information de connexion Roblox ni adresse de webhook n'est incluse.", h("button", { class: "btn", onclick: async () => { const f = await B.run(() => B.call("data:export")); if (f) B.toast("Sauvegarde enregistrée : " + f, "ok"); } }, "Exporter")),
      B.row("Importer", "Fichier Batblox ou sauvegarde de l'ancienne extension.", h("div", { class: "row" },
        h("button", { class: "btn", onclick: () => this.imp("merge") }, "Fusionner"), h("button", { class: "btn", onclick: async () => { if (await B.confirm("Remplacer l'historique, les profils suivis et les statistiques par ceux du fichier ?", "Remplacer", true)) this.imp("replace"); } }, "Remplacer"))),
      B.row("Export CSV de l'historique", null, h("button", { class: "btn", onclick: async () => { const f = await B.run(() => B.call("history:csv")); if (f) B.toast("Exporté : " + f, "ok"); } }, "Exporter en CSV")),
      B.row("Effacer l'historique", null, h("button", { class: "btn bad", onclick: async () => { if (await B.confirm("Effacer tout l'historique ?", "Effacer", true)) { await B.run(() => B.call("history:clear")); B.toast("Historique effacé.", "ok"); } } }, "Effacer")),
      B.row("Réinitialiser Batblox", "Remet les réglages par défaut et efface historique, profils suivis et statistiques. Les comptes sont conservés.", h("button", { class: "btn bad", onclick: async () => { if (await B.confirm("Tout réinitialiser ? Cette action est définitive.", "Réinitialiser", true)) { await B.run(() => B.call("data:reset")); B.toast("Batblox a été réinitialisé.", "ok"); B.renderPage(); } } }, "Réinitialiser"))));
  },
  updateCard() {
    const card = h("div", { class: "card" }, h("h2", {}, "Mises à jour"));
    const info = h("div", { class: "muted small", role: "status" });
    const btn = h("button", { class: "btn pri" }, "Vérifier les mises à jour");
    const draw = (st) => {
      const L = st && st.latest;
      btn.disabled = !!(st && st.busy);
      if (!st) { info.textContent = ""; return; }
      if (st.busy) { btn.textContent = "Téléchargement…" + (st.progress ? " " + st.progress + " %" : ""); info.textContent = "Ne ferme pas Batblox : l'installeur se lancera tout seul."; return; }
      if (st.error) { btn.textContent = "Vérifier les mises à jour"; info.textContent = "⚠ " + st.error; return; }
      if (st.available && L) {
        btn.textContent = st.portable || !L.installer ? "Ouvrir la page de téléchargement" : "Mettre à jour vers v" + L.version;
        info.textContent = "Nouvelle version disponible : v" + L.version + (L.notes ? "\n\n" + L.notes : "") + (st.portable ? "\n\nVersion portable : le fichier est à télécharger depuis GitHub." : "");
        info.style.whiteSpace = "pre-wrap";
        return;
      }
      btn.textContent = "Vérifier les mises à jour";
      info.textContent = st.checkedAt ? "Batblox est à jour (v" + st.current + ")." : "";
    };
    let cur = null;
    btn.onclick = async () => {
      if (cur && cur.available && cur.latest) {
        if (!cur.portable && cur.latest.installer && !(await B.confirm("Télécharger Batblox v" + cur.latest.version + " depuis GitHub puis l'installer ? Batblox va se fermer pendant l'installation. Tes comptes, réglages et historique sont conservés.", "Mettre à jour"))) return;
        btn.disabled = true; btn.textContent = "Téléchargement…";
        const timer = setInterval(async () => { const s = await B.call("update:state").catch(() => null); if (s && s.busy) draw(s); }, 700);
        const r = await B.run(() => B.call("update:install"));
        clearInterval(timer);
        if (r && r.launched) { B.toast("Installeur lancé : Batblox va se fermer.", "ok"); return; }
        if (r && r.manual) B.toast("Page de téléchargement ouverte dans ton navigateur.", "ok");
        draw(await B.call("update:state").catch(() => cur));
        return;
      }
      btn.disabled = true; btn.textContent = "Vérification…";
      const st = await B.run(() => B.call("update:check"));
      cur = st || cur; draw(cur);
      if (st && !st.error && !st.available) B.toast("Batblox est à jour.", "ok");
    };
    card.append(
      B.row("Version installée", "Les nouvelles versions sont publiées sur GitHub (BatStream-off/Batblox). Batblox les télécharge et les installe pour toi.", h("span", { class: "muted" }, "v" + (B.S.version || ""))),
      B.row("Vérifier au démarrage", "Une vérification discrète quelques secondes après l'ouverture ; rien n'est installé sans ton accord.", sw(["updates", "checkOnStart"], "Vérifier au démarrage")),
      h("div", { class: "field-row" }, info, btn));
    B.call("update:state").then((st) => { cur = st; draw(cur); }).catch(() => {});
    return card;
  },
  async imp(mode) {
    const r = await B.run(() => B.call("data:import", { mode }));
    if (r) B.toast(`Import terminé (${r.source === "extension" ? "ancienne extension" : "Batblox"}) : ${r.history} événement(s), ${r.watched} profil(s) suivi(s).`, "ok");
  }
};

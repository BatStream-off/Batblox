"use strict";
// « Signaler un problème » : un rapport lisible (version, système, état, réglages sans secret, journal nettoyé) à copier ou enregistrer.
// Le rapport est construit dans le processus principal (main.js → buildReport) : la session Roblox, l'adresse du webhook,
// le sujet ntfy, les chemins personnels, les pseudos des comptes et les notes d'amis n'y figurent jamais.

B.report = async () => {
  const text = await B.run(() => B.call("app:report"));
  if (!text) return;
  const pre = h("pre", { class: "log report-pre", "data-allow-copy": "" }, text);
  await B.modal({
    title: "Signaler un problème", wide: true,
    body: h("div", {},
      h("p", { class: "muted small" }, "Ce rapport aide à comprendre un problème. Il ne contient aucune information de connexion : ni session Roblox, ni webhook Discord, ni sujet ntfy, ni pseudo de tes comptes, ni tes notes d'amis. Relis-le avant de l'envoyer."),
      h("ol", { class: "report-steps muted small" }, h("li", {}, "Décris ce que tu faisais et ce qui s'est passé."), h("li", {}, "Joins ce rapport (copié ou enregistré en fichier)."), h("li", {}, "Envoie-le à la personne qui t'aide, ou ouvre un signalement sur GitHub.")),
      pre),
    buttons: [
      { label: "📋 Copier", action: async () => { await B.run(() => B.call("app:copy", text)); B.toast("Rapport copié : colle-le dans ton message.", "ok"); return false; } },
      { label: "💾 Enregistrer…", action: async () => { const f = await B.run(() => B.call("app:reportSave", text)); if (f) B.toast("Rapport enregistré : " + f, "ok"); return false; } },
      { label: "Ouvrir GitHub", action: () => { B.call("app:reportPage"); return false; } },
      { label: "Fermer", cls: "pri", value: true }
    ]
  });
};

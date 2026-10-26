"use strict";
// Notes et groupes d'amis : cache local + fiche d'un ami + gestion des groupes.
// Les données vivent dans le processus principal (stockage « people ») et ne quittent jamais le PC.

B.PEOPLE_COLORS = { bleu: "Bleu", vert: "Vert", orange: "Orange", rose: "Rose", violet: "Violet", cyan: "Cyan", jaune: "Jaune", gris: "Gris" };

B.people = {
  data: { notes: {}, groups: [], members: {} },
  loaded: false,
  async load(force) {
    if (this.loaded && !force) return this.data;
    try { this.data = await B.call("people:get"); this.loaded = true; } catch (_) { /* hors Batblox (tests) : rien */ }
    return this.data;
  },
  note(id) { return this.data.notes[String(id)] || ""; },
  hasAlert(id) { return !!(this.data.alerts && this.data.alerts[String(id)]); },
  groupsOf(id) { const ids = this.data.members[String(id)] || []; return this.data.groups.filter((g) => ids.includes(g.id)); },
  group(gid) { return this.data.groups.find((g) => g.id === gid) || null; },

  /** Pastilles de groupes (petites, colorées) pour une ligne d'ami. */
  chips(id) {
    const gs = this.groupsOf(id);
    return gs.length ? h("span", { class: "gchips" }, gs.map((g) => h("span", { class: "gchip gc-" + g.color, title: "Groupe « " + g.name + " »" }, g.name))) : null;
  },

  /** Fiche d'un ami : note libre + groupes, enregistrées à la fermeture. f = { id, name, status, place } */
  async open(f, onDone) {
    await this.load();
    const note = h("textarea", { rows: 4, maxlength: 500, placeholder: "Ex. : vrai prénom Lucas, rencontré sur Bedwars, joue surtout le soir…", "aria-label": "Note sur " + f.name, value: "" });
    note.value = this.note(f.id);
    const count = h("span", { class: "muted small" }, note.value.length + " / 500");
    note.addEventListener("input", () => { count.textContent = note.value.length + " / 500"; });
    const sel = new Set((this.data.members[String(f.id)] || []));
    const grpBox = h("div", { class: "chips" });
    const drawGroups = () => {
      B.clear(grpBox);
      if (!this.data.groups.length) grpBox.append(h("span", { class: "muted small" }, "Aucun groupe pour le moment."));
      for (const g of this.data.groups) grpBox.append(h("button", { class: "chip gpick gc-" + g.color + (sel.has(g.id) ? " on" : ""), "aria-pressed": sel.has(g.id) ? "true" : "false",
        onclick: () => { if (sel.has(g.id)) sel.delete(g.id); else sel.add(g.id); drawGroups(); } }, (sel.has(g.id) ? "✓ " : "") + g.name));
      grpBox.append(h("button", { class: "chip", title: "Créer, renommer ou supprimer des groupes", onclick: async () => { await this.manage(); drawGroups(); } }, "⚙ Gérer les groupes"));
    };
    drawGroups();
    const sub = f.status ? h("div", { class: "muted small" }, f.status === "jeu" && f.place ? "En jeu : " + f.place : B.statusLabel(f.status)) : null;
    // Prévenir à la prochaine connexion (alerte unique, activée tout de suite, sans attendre « Enregistrer »)
    const isOn = (st) => st === "en_ligne" || st === "jeu" || st === "studio";
    const alertBox = h("div", { class: "fiche-alert" });
    const drawAlert = () => {
      const on = this.hasAlert(f.id);
      B.clear(alertBox).append(h("button", { class: "btn" + (on ? " pri" : ""), "aria-pressed": on ? "true" : "false", onclick: async () => {
          const r = await B.run(() => B.call("people:alert", { id: f.id, on: !on, wasOn: isOn(f.status) }));
          if (r === undefined) return;
          await this.load(true); drawAlert();
          B.toast(!on ? "Alerte activée pour « " + f.name + " » : tu seras prévenu à sa prochaine connexion." : "Alerte annulée.", "ok");
        } }, on ? "🔔 Alerte active : annuler" : "🔔 Préviens-moi quand il se connecte"),
        h("span", { class: "muted small" }, on ? (isOn(f.status) ? "Il est en ligne en ce moment : tu seras prévenu à sa prochaine reconnexion." : "Une seule notification, puis l'alerte se désactive toute seule.") : "Une seule notification, même si les connexions sont coupées dans tes notifications."));
    };
    drawAlert();
    // Anciens pseudos (chargés en arrière-plan)
    const namesBox = h("div", { class: "fiche-names" });
    B.call("people:names", f.id).then((list) => {
      if (!list || !list.length) { namesBox.append(h("span", { class: "muted small" }, "Aucun changement de pseudo enregistré depuis que Batblox le suit.")); return; }
      namesBox.append(h("ol", { class: "names-list" }, list.map((n) => h("li", {}, h("span", { class: "pii" }, n.from || "?"), h("span", { class: "muted" }, " → "), h("span", { class: "pii" }, n.to || "?"),
        h("span", { class: "muted small" }, " · " + new Date(n.ts).toLocaleDateString(B.loc(), { day: "numeric", month: "long", year: "numeric" }))))));
    }).catch(() => {});
    const ok = await B.modal({
      title: "Fiche d'un ami", // le pseudo est dans le corps (masquable en mode streamer), pas dans le titre
      body: h("div", { class: "fiche" }, h("div", { class: "row", style: "margin-bottom:14px" }, B.avatar(f.id, f.name, "lg"), h("div", { class: "min0" }, h("b", { class: "pii" }, f.name), sub, h("div", { class: "muted small pii" }, "Identifiant " + f.id))),
        alertBox,
        h("label", { class: "small" }, "Note personnelle"), note, h("div", { style: "text-align:right;margin-top:4px" }, count),
        h("label", { class: "small", style: "margin-top:12px" }, "Groupes"), grpBox,
        h("label", { class: "small", style: "margin-top:14px" }, "Anciens pseudos"), namesBox,
        h("p", { class: "muted small", style: "margin-top:12px" }, "La note et les groupes restent sur ce PC : ils ne sont jamais envoyés à Roblox, Discord ou ntfy.")),
      buttons: [{ label: "Annuler", value: false }, { label: "Enregistrer", cls: "pri", value: true }]
    });
    if (!ok) return false;
    await B.run(async () => {
      await B.call("people:note", { id: f.id, text: note.value });
      await B.call("people:members", { id: f.id, groups: [...sel] });
    });
    await this.load(true);
    B.toast("Fiche de « " + f.name + " » enregistrée.", "ok");
    if (onDone) onDone();
    return true;
  },

  /** Créer, renommer, recolorer, supprimer des groupes, et choisir leurs notifications. */
  async manage() {
    await this.load();
    let list = this.data.groups.map((g) => Object.assign({}, g));
    const box = h("div", { class: "gman" });
    const draw = () => {
      B.clear(box);
      if (!list.length) box.append(h("div", { class: "muted small", style: "padding:6px 0 10px" }, "Aucun groupe. Ajoute-en un ci-dessous."));
      list.forEach((g, i) => {
        const name = h("input", { type: "text", value: g.name, maxlength: 24, "aria-label": "Nom du groupe", oninput: (e) => { g.name = e.target.value; } });
        const col = h("select", { "aria-label": "Couleur", onchange: (e) => { g.color = e.target.value; draw(); } }, Object.entries(B.PEOPLE_COLORS).map(([k, l]) => h("option", { value: k, selected: g.color === k }, l)));
        box.append(h("div", { class: "gman-row" },
          h("span", { class: "gdot gc-" + g.color, "aria-hidden": "true" }), name, col,
          h("label", { class: "gman-opt", title: "Leurs connexions et déconnexions restent notifiées quand « seulement mes groupes » est activé" }, h("input", { type: "checkbox", checked: g.conn, onchange: (e) => { g.conn = e.target.checked; } }), "Connexions"),
          h("label", { class: "gman-opt", title: "Aucune notification pour les membres de ce groupe (l'historique continue)" }, h("input", { type: "checkbox", checked: g.mute, onchange: (e) => { g.mute = e.target.checked; } }), "Sourdine"),
          h("button", { class: "btn sm ghost", title: "Supprimer le groupe « " + g.name + " »", "aria-label": "Supprimer le groupe", onclick: () => { list.splice(i, 1); draw(); } }, "🗑")));
      });
      if (list.length < 12) box.append(h("div", { class: "field-row" }, h("button", { class: "btn", onclick: () => { list.push({ name: "Nouveau groupe", color: Object.keys(B.PEOPLE_COLORS)[list.length % 8], conn: true, mute: false }); draw(); const ins = box.querySelectorAll("input[type=text]"); const last = ins[ins.length - 1]; if (last) { last.focus(); last.select(); } } }, "➕ Ajouter un groupe")));
    };
    draw();
    const ok = await B.modal({ title: "Groupes d'amis", wide: true,
      body: h("div", {}, h("p", { class: "muted small" }, "« Connexions » : ses membres restent notifiés quand tu limites les connexions à tes groupes (Activité → Notifications). « Sourdine » : plus aucune notification pour eux."), box),
      buttons: [{ label: "Annuler", value: false }, { label: "Enregistrer", cls: "pri", value: true }] });
    if (!ok) return false;
    const r = await B.run(() => B.call("people:groups", list));
    if (r) { await this.load(true); B.toast("Groupes enregistrés.", "ok"); }
    return !!r;
  }
};

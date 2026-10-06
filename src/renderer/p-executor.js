"use strict";
// Exécuteur : lanceur de logiciels. Vide au départ : c'est l'utilisateur qui choisit ce qu'il veut y voir.

B.pages.executor = {
  async render(view) {
    this.root = h("div", { class: "page" });
    view.append(this.root);
    await this.draw();
  },

  async draw() {
    const root = B.clear(this.root);
    const list = (await B.run(() => B.call("executor:list"))) || [];

    root.append(B.head("Exécuteur", "Ton lanceur personnel : tu choisis toi-même les logiciels qui apparaissent ici.",
      [h("button", { class: "btn pri", onclick: () => this.add() }, "➕ Ajouter un logiciel")]));

    if (!list.length) {
      root.append(h("div", { class: "card empty exe-empty" },
        h("p", {}, "Ton exécuteur est vide."),
        h("p", { class: "small" }, "Ajoute les logiciels que tu veux lancer d'ici : programme (.exe), raccourci (.lnk) ou script (.bat, .cmd)."),
        h("button", { class: "btn pri", onclick: () => this.add() }, "➕ Choisir un logiciel")));
      return;
    }

    const tiles = h("div", { class: "exe-tiles" });
    list.forEach((it, i) => tiles.append(this.tile(it, i, list.length)));
    root.append(tiles);
    root.append(h("p", { class: "muted small", style: "margin-top:14px" }, "Clique sur un logiciel pour le lancer. Le menu ⋮ permet de le renommer, de le déplacer ou de le retirer (le logiciel lui-même n'est jamais supprimé)."));
  },

  tile(it, i, n) {
    const ico = h("span", { class: "exe-ico" }, it.icon ? h("img", { src: it.icon, alt: "" }) : B.initial(it.name));
    const launch = async () => {
      if (!it.found) { B.toast("« " + it.name + " » est introuvable à l'emplacement enregistré.", "bad"); return; }
      const r = await B.run(() => B.call("executor:launch", it.id));
      if (r) B.toast("« " + r + " » lancé.", "ok");
    };
    const dots = h("button", { class: "dots exe-dots", "aria-label": "Options de " + it.name, "aria-haspopup": "menu", title: "Options" }, "⋮");
    dots.onclick = (e) => {
      e.stopPropagation();
      B.menu(dots, [
        { label: "✏️ Renommer", action: () => this.rename(it) },
        { label: "📂 Afficher dans le dossier", action: () => B.run(() => B.call("executor:reveal", it.id)) },
        i > 0 ? { label: "◀ Avancer", action: () => this.move(it, -1) } : null,
        i < n - 1 ? { label: "▶ Reculer", action: () => this.move(it, 1) } : null,
        "-",
        { label: "🗑 Retirer de l'exécuteur", action: () => this.remove(it) }
      ].filter(Boolean));
    };
    return h("div", { class: "exe-tile" + (it.found ? "" : " missing"), role: "button", tabindex: "0", title: it.found ? "Lancer " + it.name + "\n" + it.path : "Introuvable : " + it.path,
      onclick: launch, onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); launch(); } } },
      dots, ico, h("div", { class: "exe-name" }, it.name), it.found ? null : h("div", { class: "exe-warn small" }, "Introuvable"));
  },

  async add() {
    const r = await B.run(() => B.call("executor:add"));
    if (!r) return;
    if (r.added.length) B.toast(r.added.length === 1 ? "Logiciel ajouté." : r.added.length + " logiciels ajoutés.", "ok");
    for (const s of r.skipped) B.toast(s, "bad");
    if (r.added.length) this.draw();
  },

  async rename(it) {
    const input = h("input", { type: "text", maxlength: 60, value: it.name, "aria-label": "Nom affiché", onkeydown: (e) => { if (e.key === "Enter") e.target.closest(".modal").querySelector("button.pri").click(); } });
    const ok = await B.modal({ title: "Renommer", body: h("div", {}, h("label", { class: "small muted" }, "Nom affiché dans l'exécuteur"), input),
      buttons: [{ label: "Annuler", value: false }, { label: "Enregistrer", cls: "pri", value: true }] });
    if (!ok) return;
    if (await B.run(() => B.call("executor:rename", { id: it.id, name: input.value })) !== undefined) this.draw();
  },

  async move(it, delta) {
    if (await B.run(() => B.call("executor:move", { id: it.id, delta })) !== undefined) this.draw();
  },

  async remove(it) {
    if (!(await B.confirm("Retirer « " + it.name + " » de l'exécuteur ? Le logiciel reste installé sur ton PC.", "Retirer", true))) return;
    if (await B.run(() => B.call("executor:remove", it.id)) !== undefined) this.draw();
  }
};

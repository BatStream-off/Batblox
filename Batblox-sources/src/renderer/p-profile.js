"use strict";
// Mon profil : tous les détails du compte actif, et au même endroit ses amis, demandes d'ami, abonnés,
// abonnements et profils suivis. (Remplace les anciennes pages « Amis » et « Profils suivis ».)

// [identifiant, libellé, icône, clé du compteur]
const PF_TABS = [
  ["friends", "Amis", "friends", "friends"],
  ["requests", "Demandes", "mail", "requests"],
  ["followers", "Abonnés", "accounts", "followers"],
  ["following", "Abonnements", "follow", "following"],
  ["watch", "Profils suivis", "watch", "watched"]
];
const PF_LIST = { requests: "Demandes d'ami reçues", followers: "Abonnés", following: "Abonnements" };
const PF_EMPTY = {
  requests: "Aucune demande d'ami en attente.",
  followers: "Personne ne te suit pour le moment.",
  following: "Tu ne suis personne pour le moment."
};
const pfMsg = (e) => (e && e.message ? e.message : String(e)).replace(/^Error invoking remote method 'api': Error: /, "");

function pfAge(iso) {
  const t = Date.parse(iso);
  if (!t) return "—";
  const d = Math.max(0, Math.floor((Date.now() - t) / 86400000)), y = Math.floor(d / 365), m = Math.floor((d % 365) / 30);
  if (y) return y + " an" + (y > 1 ? "s" : "") + (m ? " et " + m + " mois" : "");
  if (m) return m + " mois";
  return d + " jour" + (d > 1 ? "s" : "");
}

B.pages.profile = {
  tab: "friends", det: null, detErr: "", detAt: 0, lists: {}, accId: null, dTok: 0, sig: "",

  render(view) {
    const a = B.S.active;
    this.root = h("div", { class: "page", id: "pf" });
    view.append(this.root);
    if (!a) {
      this.root.append(h("div", { class: "card empty" }, "Ajoute un compte Roblox pour voir ton profil.", h("div", {}, h("button", { class: "btn pri", onclick: B.addAccount }, "Ajouter un compte"))));
      return;
    }
    if (this.accId !== a.id) { this.accId = a.id; this.det = null; this.detErr = ""; this.detAt = 0; this.lists = {}; }
    this.root.append(h("div", { id: "pf-top" }), h("div", { id: "pf-tabs" }), h("div", { id: "pf-body" }));
    this.drawTop();
    this.drawTabs();
    this.drawBody();
    this.loadDetails(false);
  },

  counts() {
    const s = B.S.snap || {}, c = (this.det && this.det.counts) || {};
    const pick = (k, sk) => (c[k] != null ? c[k] : s[sk] != null ? s[sk] : null);
    return { friends: pick("friends", "friends"), requests: pick("requests", "requests"), followers: pick("followers", "followers"), following: pick("following", "following"), watched: s.watched != null ? s.watched : c.watched != null ? c.watched : null };
  },

  // ---------- Détails du compte ----------
  async loadDetails(force) {
    if (!force && this.det && Date.now() - this.detAt < 120000) return;
    const tok = ++this.dTok;
    this.detErr = "";
    let d = null;
    try { d = await B.call("account:details"); } catch (e) { this.detErr = pfMsg(e); }
    if (tok !== this.dTok || !B.$("#pf-top")) return;
    if (d) { this.det = d; this.detAt = Date.now(); }
    this.drawTop();
    this.drawTabs(true);
    if (d) this.loadCounts(tok);
  },

  // Les 4 compteurs viennent d'un service plus lent : ils s'affichent d'abord depuis la dernière vérification, puis se mettent à jour.
  async loadCounts(tok) {
    try {
      const c = await B.call("account:counts");
      if (tok !== this.dTok || !this.det || !B.$("#pf-tabs")) return;
      this.det.counts = Object.assign(this.det.counts || {}, c);
      this.drawTabs();
    } catch (_) { /* les valeurs de la dernière vérification restent affichées */ }
  },

  drawTop() {
    const box = B.$("#pf-top"); if (!box) return;
    B.clear(box);
    const a = B.S.active, d = this.det, p = d && d.profile;
    const me = (d && d.me) || (B.S.snap && B.S.snap.me) || null;
    const badges = [];
    if (p && p.verified) badges.push(h("span", { class: "pill ok" }, "✓ Vérifié"));
    if (d && d.premium) badges.push(h("span", { class: "pill" }, "💎 Premium"));
    if (p && p.banned) badges.push(h("span", { class: "pill bad" }, "Compte banni"));
    if (me) badges.push(h("span", { class: "pill" }, B.dot(me.status), B.statusLabel(me.status) + (me.status === "jeu" && me.place ? " · " + me.place : "")));
    box.append(h("header", { class: "hero" },
      h("div", { class: "hero-id" }, B.avatar(a.id, a.label, "xl", a.avatarUrl),
        h("div", { class: "min0" }, h("h1", {}, p ? p.displayName : a.label), h("div", { class: "muted row", style: "gap:6px" }, h("span", {}, "@" + (p ? p.name : a.name) + " · ID " + a.id), h("button", { class: "btn sm ghost", title: "Copier l'identifiant", onclick: () => { const ok = () => B.toast("Identifiant copié.", "ok"), ko = () => B.toast("Copie impossible.", "bad"); try { navigator.clipboard.writeText(String(a.id)).then(ok, ko); } catch (_) { ko(); } } }, "Copier")),
          badges.length ? h("div", { class: "row wrap", style: "margin-top:8px" }, badges) : null)),
      h("div", { class: "actions" }, h("button", { class: "btn", onclick: () => this.refresh() }, "🔄 Actualiser"))));

    const card = h("div", { class: "card compact" }, h("h3", { class: "eyebrow" }, "Détails du compte"));
    if (this.detErr && !d) {
      card.append(h("div", { class: "notice bad" }, this.detErr, " ", h("button", { class: "btn sm", onclick: () => this.loadDetails(true) }, "Réessayer")));
    } else if (d && !p) {
      card.append(h("div", { class: "notice bad" }, "Profil indisponible pour le moment. ", h("button", { class: "btn sm", onclick: () => this.loadDetails(true) }, "Réessayer")));
    } else if (!d) {
      card.append(h("div", { class: "kv" }, Array.from({ length: 5 }, () => h("div", {}, h("div", { class: "sk sk-line short", style: "margin:0 0 6px" }), h("div", { class: "sk sk-line", style: "margin:0" })))));
    } else {
      const item = (k, v) => h("div", {}, h("dt", {}, k), h("dd", {}, v));
      const created = p.created ? new Date(p.created).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—";
      const desc = p.description || "";
      const long = desc.length > 110 || desc.split("\n").length > 2;
      const dd = h("div", { class: "desc" + (desc ? "" : " none") + (long ? " clamp" : "") }, desc || "Aucune description.");
      card.append(h("dl", { class: "kv" },
        item("Créé le", created),
        item("Ancienneté", pfAge(p.created)),
        item("Robux", d.robux != null ? B.num(d.robux) : "—"),
        item("Premium", d.premium == null ? "—" : d.premium ? "Oui" : "Non"),
        item("Session", d.status === "ok" ? h("span", { title: d.checkedAt ? "Vérifiée " + B.ago(d.checkedAt) : "" }, "Connectée") : "À reconnecter")),
        h("div", { class: "desc-row" }, dd, long ? h("button", { class: "btn sm ghost", onclick: (e) => { const c = dd.classList.toggle("clamp"); e.target.textContent = c ? "Voir plus" : "Réduire"; } }, "Voir plus") : null));
    }
    box.append(card);
  },

  // ---------- Onglets (les 4 compteurs de l'ancien accueil, + profils suivis) ----------
  drawTabs(force) {
    const box = B.$("#pf-tabs"); if (!box) return;
    const c = this.counts(), sig = this.tab + JSON.stringify(c);
    if (!force && sig === this.sig && box.firstChild) return; // évite de perdre le focus clavier à chaque vérification
    this.sig = sig;
    B.clear(box);
    box.append(h("div", { class: "tabs", role: "tablist", "aria-label": "Sections du profil" }, PF_TABS.map(([id, label, ico, key]) =>
      h("button", { class: "stat tabtile", role: "tab", "aria-selected": this.tab === id ? "true" : "false", onclick: () => this.open(id) },
        h("div", { class: "stat-ico" }, B.icon(ico)), h("div", {}, h("b", { title: c[key] == null ? "" : B.num(c[key]) }, B.numShort(c[key])), h("span", {}, label))))));
  },

  open(id) {
    if (id === this.tab && B.$("#pf-body").firstChild) return;
    this.tab = id;
    this.drawTabs(true);
    this.drawBody();
  },

  drawBody() {
    const el = B.$("#pf-body"); if (!el) return;
    const body = B.clear(el);
    if (this.tab === "friends") { B.pages.friends.render(body, { embedded: true }); return; }
    if (this.tab === "watch") { B.pages.watch.render(body, { embedded: true }); return; }
    this.drawList(this.tab);
  },

  refresh() {
    this.detAt = 0;
    this.loadDetails(true);
    if (PF_LIST[this.tab]) this.fetchMore(this.tab, true); else this.drawBody();
  },

  // ---------- Listes : demandes, abonnés, abonnements ----------
  state(kind) { return this.lists[kind] || (this.lists[kind] = { items: [], next: "", loaded: false, busy: false, err: "", q: "" }); },

  drawList(kind) {
    const st = this.state(kind), body = B.$("#pf-body"); if (!body) return;
    const total = this.counts()[kind];
    const search = h("input", { type: "search", placeholder: "Rechercher dans la liste…", "aria-label": "Rechercher", value: st.q, style: "max-width:260px",
      oninput: (e) => { st.q = e.target.value; this.paint(kind); } });
    body.append(h("div", { class: "card" },
      h("div", { class: "row wrap" }, h("h2", { class: "grow" }, PF_LIST[kind]), h("span", { class: "muted small", id: "pf-count" }, total != null ? B.num(total) + " au total" : "")),
      h("div", { class: "row wrap", style: "margin-bottom:10px" }, search,
        kind === "requests" ? h("span", { class: "muted small" }, "Accepter ou refuser agit directement sur Roblox.") : null),
      h("div", { id: "pf-items" }), h("div", { id: "pf-more", class: "row", style: "justify-content:center;margin-top:12px" })));
    this.paint(kind);
    if (!st.loaded && !st.busy) this.fetchMore(kind, false);
  },

  async fetchMore(kind, reset) {
    const st = this.state(kind);
    if (st.busy) return;
    if (reset) { st.items = []; st.next = ""; st.loaded = false; }
    st.busy = true; st.err = "";
    if (this.tab === kind) this.paint(kind);
    try {
      const r = await B.call("network:page", { kind, cursor: st.next });
      const seen = new Set(st.items.map((x) => x.id));
      st.items = st.items.concat(r.items.filter((x) => !seen.has(x.id)));
      st.next = r.next || "";
      st.loaded = true;
    } catch (e) { st.err = pfMsg(e); }
    st.busy = false;
    if (this.tab === kind) this.paint(kind);
  },

  paint(kind) {
    const box = B.$("#pf-items"), more = B.$("#pf-more"); if (!box || !more) return;
    B.clear(box); B.clear(more);
    const st = this.state(kind), q = st.q.trim().toLowerCase();
    if (st.err) box.append(h("div", { class: "notice bad" }, st.err, " ", h("button", { class: "btn sm", onclick: () => this.fetchMore(kind, !st.items.length) }, "Réessayer")));
    const list = q ? st.items.filter((x) => String(x.name || "").toLowerCase().includes(q) || String(x.display || "").toLowerCase().includes(q)) : st.items;
    if (list.length) box.append(h("div", { class: "list bare" }, list.map((u) => this.row(kind, u))));
    else if (st.busy) box.append(h("div", { class: "row", style: "padding:10px 4px" }, h("span", { class: "dot game" }), "Chargement…"));
    else if (st.loaded && !st.err) box.append(h("div", { class: "empty" }, q ? "Aucun résultat pour cette recherche." : PF_EMPTY[kind]));
    if (st.next && !q) more.append(h("button", { class: "btn", disabled: st.busy, onclick: () => this.fetchMore(kind, false) }, st.busy ? "Chargement…" : "Charger plus"));
    const total = this.counts()[kind], c = B.$("#pf-count");
    if (c && st.loaded) c.textContent = (total != null && total > st.items.length ? B.num(st.items.length) + " affiché(s) sur " + B.num(total) : B.num(st.items.length) + " au total");
  },

  row(kind, u) {
    const parts = [u.name ? "@" + u.name : "ID " + u.id];
    if (kind === "requests") {
      const t = Date.parse(u.sent || "");
      if (t) parts.push("reçue " + B.ago(t));
      if (u.mutual) parts.push(u.mutual + " ami" + (u.mutual > 1 ? "s" : "") + " en commun");
    }
    const acts = kind === "requests"
      ? [h("button", { class: "btn sm pri", onclick: () => this.answer(u, true) }, "Accepter"), h("button", { class: "btn sm", onclick: () => this.answer(u, false) }, "Refuser")]
      : [h("button", { class: "btn sm", title: "Suivre ce profil (onglet Profils suivis)", onclick: () => this.watch(u) }, "👁 Suivre")];
    return h("div", { class: "item" }, B.avatar(u.id, u.name),
      h("div", { class: "main" }, h("b", {}, u.display || u.name || "Utilisateur " + u.id), h("span", { class: "muted small" }, parts.join(" · "))), acts);
  },

  async answer(u, accept) {
    const ok = await B.run(() => B.call("network:answer", { id: u.id, accept }));
    if (!ok) return;
    const st = this.state("requests");
    st.items = st.items.filter((x) => x.id !== u.id);
    const c = this.det && this.det.counts;
    if (c) { if (c.requests) c.requests--; if (accept && c.friends != null) c.friends++; }
    this.detAt = 0;
    B.toast(accept ? "« " + (u.display || u.name) + " » est maintenant ton ami." : "Demande de « " + (u.display || u.name) + " » refusée.", "ok");
    this.drawTabs(true);
    if (this.tab === "requests") this.paint("requests");
  },

  async watch(u) {
    const r = await B.run(() => B.call("watch:add", { query: u.id, opts: { friends: true, status: true, conn: true } }));
    if (r) B.toast("Profil « " + r.name + " » ajouté aux profils suivis.", "ok");
  },

  onMonitor() {
    if (this.tab === "friends") B.pages.friends.onMonitor();
    this.drawTabs(false);
  }
};

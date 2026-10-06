"use strict";
// Messages : chat Roblox (conversations privées et de groupe) du compte actif — lecture et réponse.
// La boîte de réception « messages privés » entre joueurs n'existe plus côté Roblox (supprimée en 2024).

B.pages.messages = {
  acc: null, convs: [], next: "", cur: null, msgs: [], older: "", drafts: {}, cache: {}, tmpN: 0, q: "", sending: false, loading: false, token: null, tickN: 0,

  render(view) {
    const a = B.S.active;
    if (!a || this.acc !== a.id) Object.assign(this, { acc: a ? a.id : null, convs: [], next: "", cur: null, msgs: [], older: "", drafts: {}, cache: {} });
    this.root = h("div", { class: "page" });
    view.append(this.root);
    this.root.append(B.head("Messages", "Lis et réponds à tes conversations Roblox sans ouvrir le site.",
      a ? [h("button", { class: "btn", onclick: () => { this.loadList(); this.loadThread(); } }, "🔄 Actualiser")] : null));
    if (!a) { this.root.append(h("div", { class: "notice" }, "Ajoute d'abord un compte Roblox pour voir tes messages.")); return; }
    const search = h("input", { type: "search", placeholder: "Rechercher une conversation…", "aria-label": "Rechercher une conversation", value: this.q, oninput: (e) => { this.q = e.target.value; this.drawList(); } });
    this.root.append(h("div", { class: "chat" },
      h("aside", { class: "card chat-side" }, h("div", { class: "chat-search" }, search), h("div", { class: "chat-list", id: "ms-list" })),
      h("section", { class: "card chat-main", id: "ms-thread" })));
    this.drawList(); this.drawThread();
    this.loadList();
    if (this.cur) this.loadThread();
    this.startTimers();
  },

  // Actualisation douce tant que la page est affichée (jamais fenêtre cachée ni fenêtre de dialogue ouverte).
  startTimers() {
    const token = (this.token = {});
    const alive = () => this.token === token && B.page === "messages" && this.root && this.root.isConnected;
    const gap = () => (document.documentElement.dataset.potato === "1" ? 12000 : 4000);
    const run = async () => {
      if (!alive()) return;
      if (!document.hidden && !document.querySelector(".scrim")) {
        if (this.cur) await this.loadThread(true);
        if (++this.tickN % 5 === 0) await this.loadList(true);
      }
      if (alive()) setTimeout(run, gap());
    };
    setTimeout(run, 1500);
  },

  syncBadge() {
    const n = this.convs.filter((c) => c.unread > 0).length;
    if (n !== B.S.chatUnread) { B.S.chatUnread = n; B.renderNav(); }
  },

  async loadList(silent, more) {
    if (this.loading) return;
    this.loading = true;
    try {
      const r = await B.call("chat:list", { cursor: more ? this.next : "" });
      if (more) { const seen = new Set(this.convs.map((c) => c.id)); this.convs = this.convs.concat(r.items.filter((c) => !seen.has(c.id))); }
      else this.convs = r.items;
      this.next = r.next;
      this.listErr = null;
      this.syncBadge();
    } catch (e) { this.listErr = e.message; if (!silent) B.fail(e); }
    this.loading = false;
    if (this.root && this.root.isConnected) this.drawList();
    if (!more) this.prefetch();
  },

  // Précharge en parallèle les 3 conversations les plus récentes (4 appels avec la liste) : leur ouverture devient instantanée.
  prefetch() {
    const todo = this.convs.filter((c) => c.id !== this.cur && !this.cache[c.id]).slice(0, 3);
    for (const c of todo) {
      B.call("chat:messages", { id: c.id }).then((r) => { if (!this.cache[c.id]) this.cache[c.id] = { msgs: r.items, older: r.next }; }).catch(() => {});
    }
  },

  conv() { return this.convs.find((c) => c.id === this.cur) || null; },

  drawList() {
    const box = B.$("#ms-list"); if (!box) return;
    B.clear(box);
    const q = this.q.trim().toLowerCase();
    const list = this.convs.filter((c) => !q || c.title.toLowerCase().includes(q));
    if (this.listErr && !this.convs.length) box.append(h("div", { class: "empty" }, this.listErr));
    else if (!list.length) box.append(h("div", { class: "empty" }, this.loading && !this.convs.length ? "Chargement…" : this.convs.length ? "Aucune conversation ne correspond." : "Aucune conversation pour le moment."));
    for (const c of list) {
      const sub = c.preview ? (c.previewMine ? "Toi : " : "") + c.preview : c.group ? c.count + " participants" : "";
      box.append(h("button", { class: "conv" + (c.id === this.cur ? " on" : "") + (c.unread ? " unread" : ""), "aria-current": c.id === this.cur ? "true" : null, onclick: () => this.open(c.id) },
        B.avatar(c.other || null, c.title, ""),
        h("div", { class: "main" }, h("b", {}, c.title), h("span", { class: "muted small" }, sub)),
        h("div", { class: "side" }, h("span", { class: "when" }, c.updated ? B.ago(c.updated) : ""), c.unread ? h("span", { class: "badge" }, c.unread > 99 ? "99+" : String(c.unread)) : null)));
    }
    if (this.next && !q) box.append(h("button", { class: "btn sm", style: "margin:8px auto;display:flex", onclick: () => this.loadList(false, true) }, "Voir plus de conversations"));
  },

  async open(id) {
    if (this.cur === id) return;
    this.saveDraft();
    const cached = this.cache[id];
    this.cur = id; this.msgs = cached ? cached.msgs.slice() : []; this.older = cached ? cached.older : "";
    this.drawList(); this.drawThread();
    const c = this.conv();
    // lecture et chargement partent en même temps : on n'attend pas l'un pour l'autre
    if (c && c.unread) { c.unread = 0; this.drawList(); this.syncBadge(); B.call("chat:read", id).catch(() => {}); }
    await this.loadThread(!!cached);
  },

  saveDraft() { if (this.cur && this.ta) { if (this.ta.value) this.drafts[this.cur] = this.ta.value; else delete this.drafts[this.cur]; } },

  merge(items) {
    const map = new Map(this.msgs.map((m) => [m.id, m]));
    let added = 0;
    for (const m of items) { if (!map.has(m.id)) added++; map.set(m.id, m); }
    this.msgs = [...map.values()].sort((a, b) => a.ts - b.ts);
    return added;
  },

  async loadThread(silent) {
    const id = this.cur; if (!id) return;
    let r;
    try { r = await B.call("chat:messages", { id }); }
    catch (e) { if (!silent) { B.fail(e); this.threadErr = e.message; this.drawMessages(); } return; }
    if (this.cur !== id) return;
    this.threadErr = null;
    const first = !this.msgs.length;
    const fresh = r.items.filter((m) => !this.msgs.some((x) => x.id === m.id));
    const added = this.merge(r.items);
    if (first) this.older = r.next;
    this.cache[id] = { msgs: this.msgs.slice(), older: this.older };
    if (!silent || added) this.drawMessages(first);
    if (silent && fresh.some((m) => !m.mine)) { const c = this.conv(); if (c) { c.unread = 0; B.call("chat:read", id).catch(() => {}); this.drawList(); this.syncBadge(); } }
  },

  async loadOlder() {
    const id = this.cur, box = B.$("#ms-msgs"); if (!id || !this.older || !box) return;
    const before = box.scrollHeight;
    try {
      const r = await B.call("chat:messages", { id, cursor: this.older });
      if (this.cur !== id) return;
      this.merge(r.items); this.older = r.next;
      this.drawMessages();
      const nb = B.$("#ms-msgs"); if (nb) nb.scrollTop = nb.scrollHeight - before;
    } catch (e) { B.fail(e); }
  },

  drawThread() {
    const box = B.$("#ms-thread"); if (!box) return;
    B.clear(box);
    const c = this.conv();
    if (!c) { box.append(h("div", { class: "chat-empty" }, h("div", { class: "empty" }, this.convs.length ? "Choisis une conversation pour lire et répondre." : "Tes conversations apparaîtront ici."))); return; }
    this.ta = h("textarea", { rows: 2, maxlength: 500, placeholder: "Écris ta réponse… (Entrée pour envoyer, Maj+Entrée pour un retour à la ligne)", "aria-label": "Ta réponse", value: this.drafts[c.id] || "",
      onkeydown: (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); this.send(); } } });
    this.btn = h("button", { class: "btn pri", onclick: () => this.send() }, "Envoyer");
    box.append(
      h("div", { class: "chat-head" }, B.avatar(c.other || null, c.title, ""), h("div", { class: "main" }, h("b", {}, c.title), h("div", { class: "muted small" }, c.group ? c.count + " participants" : "Conversation privée"))),
      h("div", { class: "chat-msgs", id: "ms-msgs", "aria-live": "polite" }),
      h("div", { class: "chat-compose" }, this.ta, this.btn));
    this.drawMessages(true);
  },

  drawMessages(toEnd) {
    const box = B.$("#ms-msgs"); if (!box) return;
    const c = this.conv();
    const near = box.scrollHeight - box.scrollTop - box.clientHeight < 90;
    B.clear(box);
    if (this.older) box.append(h("button", { class: "btn sm", style: "align-self:center;margin-bottom:6px", onclick: () => this.loadOlder() }, "Messages plus anciens"));
    if (this.threadErr && !this.msgs.length) box.append(h("div", { class: "empty" }, this.threadErr));
    else if (!this.msgs.length) box.append(h("div", { class: "empty" }, "Chargement des messages…"));
    let day = "";
    for (const m of this.msgs) {
      const d = m.ts ? new Date(m.ts).toDateString() : "";
      if (d && d !== day) { day = d; box.append(h("div", { class: "day", style: "align-self:center" }, B.dateLabel(m.ts))); }
      const who = c && c.group && !m.mine ? (c.users[m.from] && (c.users[m.from].display || c.users[m.from].name)) || "Joueur " + m.from : null;
      box.append(h("div", { class: "msg" + (m.mine ? " mine" : "") + (m.deleted || !m.text ? " gone" : "") + (m.pending ? " pending" : "") },
        who ? h("span", { class: "who" }, who) : null,
        h("span", { class: "txt" }, m.deleted ? "Message supprimé" : m.text || "Message non textuel"),
        m.ts ? h("span", { class: "at" }, B.time(m.ts)) : null));
    }
    if (toEnd || near) box.scrollTop = box.scrollHeight;
  },

  async send() {
    const id = this.cur, ta = this.ta;
    if (!id || !ta || this.sending) return;
    const text = ta.value.trim();
    if (!text) return;
    this.sending = true;
    // la bulle apparaît tout de suite (grisée), puis est remplacée par la vraie réponse de Roblox
    const tmp = { id: "tmp" + ++this.tmpN, from: "", mine: true, text, deleted: false, ts: Date.now(), pending: true };
    ta.value = ""; delete this.drafts[id];
    this.msgs.push(tmp); this.drawMessages(true);
    try {
      const r = await B.call("chat:send", { id, text });
      this.msgs = this.msgs.filter((m) => m.id !== tmp.id);
      const c = this.conv();
      if (c) { c.preview = text.slice(0, 120); c.previewMine = true; c.updated = Date.now(); this.convs.sort((a, b) => b.updated - a.updated); this.drawList(); }
      if (this.cur === id) { this.merge(r.items); this.drawMessages(true); this.cache[id] = { msgs: this.msgs.slice(), older: this.older }; }
    } catch (e) {
      this.msgs = this.msgs.filter((m) => m.id !== tmp.id);
      B.fail(e);
      if (this.cur === id) { this.drawMessages(); if (this.ta === ta && !ta.value) ta.value = text; }
    }
    this.sending = false;
    if (this.ta === ta) ta.focus();
  }
};

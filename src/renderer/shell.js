"use strict";


const _p = (d) => '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
B.ICO = {
  home: _p('<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
  friends: _p('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M18 14.3c1.8.8 3 2.6 3 4.7"/>'),
  watch: _p('<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.8"/>'),
  history: _p('<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5"/><path d="M3.5 4v4.5H8"/><path d="M12 7.5V12l3 2"/>'),
  stats: _p('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  notifs: _p('<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15Z"/><path d="M10 21h4"/>'),
  discover: _p('<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5Z"/>'),
  roblox: _p('<rect x="2.5" y="7" width="19" height="11" rx="3.5"/><path d="M7 10.5v4M5 12.5h4"/><circle cx="15.5" cy="11.5" r=".8"/><circle cx="18" cy="13.5" r=".8"/>'),
  accounts: _p('<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5"/>'),
  custom: _p('<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 1.6-2.1-.4-1.1.3-2.4 1.6-2.4H17a4 4 0 0 0 4-4C21 6.9 17 3 12 3Z"/><circle cx="7.5" cy="11" r=".9"/><circle cx="10" cy="7" r=".9"/><circle cx="15" cy="7.5" r=".9"/>'),
  maint: _p('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3.5 17.5a1.8 1.8 0 0 0 2.5 2.5l5.8-5.8a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.3-.6-.6-2.3Z"/>'),
  discord: _p('<path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-8l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/>'),
  settings: _p('<circle cx="12" cy="12" r="3"/><path d="M19.4 14a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V20a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H4a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h0a1.6 1.6 0 0 0 1-1.5V4a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v0a1.6 1.6 0 0 0 1.5 1H20a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"/>'),
  profile: _p('<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="11" r="2"/><path d="M5.8 16c.6-1.4 1.8-2 3.2-2s2.6.6 3.2 2M14 10h4M14 13h3"/>'),
  follow: _p('<circle cx="10" cy="8" r="3.2"/><path d="M4 20c0-3.3 2.7-6 6-6 1.2 0 2.3.3 3.2.9"/><path d="M18 14v6M15 17h6"/>'),
  activity: _p('<path d="M3 12h4l3-8 4 16 3-8h4"/>'),
  executor: _p('<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><path d="M14.5 14.5v5l4.5-2.5Z"/>'),
  messages: _p('<path d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-7l-4 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/><path d="M8 9.5h8M8 12.5h5"/>'),
  mail: _p('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 7 8.5 6 8.5-6"/>')
};
B.icon = (k) => { const s = document.createElement("span"); s.className = "ico"; s.innerHTML = B.ICO[k] || ""; return s; };

B.NAV = [
  "Surveillance",
  ["home", "Accueil"], ["discover", "Découvrir"], ["profile", "Mon profil"], ["activity", "Activité"], ["messages", "Messages"],
  "Application",
  ["roblox", "Roblox"], ["executor", "Exécuteur"], ["accounts", "Comptes"], ["custom", "Personnalisation"], ["maint", "Maintenance"], ["discord", "Discord"],
  "-",
  ["settings", "Réglages"]
];

B.renderNav = () => {
  const nav = B.clear(B.$("#nav"));
  for (const it of B.NAV) {
    if (it === "-") { nav.append(h("div", { class: "grow" })); continue; }
    if (typeof it === "string") { nav.append(h("div", { class: "nav-label" }, it)); continue; }
    const [id, label] = it;
    const b = h("button", { class: B.page === id ? "on" : "", "aria-current": B.page === id ? "page" : null, title: label, onclick: () => B.go(id) }, B.icon(id), h("span", { class: "lbl" }, label));
    if (id === "activity" && B.S.unread) b.append(h("span", { class: "badge" }, B.S.unread > 99 ? "99+" : String(B.S.unread)));
    if (id === "messages" && B.S.chatUnread) b.append(h("span", { class: "badge" }, B.S.chatUnread > 99 ? "99+" : String(B.S.chatUnread)));
    nav.append(b);
  }
};

// Nombre de conversations non lues (pastille du menu) : vérifié de temps en temps, jamais fenêtre cachée.
B.pollChat = async () => {
  if (!B.S.active || document.hidden) return;
  try {
    const r = await B.call("chat:unread");
    if (r.unread !== B.S.chatUnread) { B.S.chatUnread = r.unread; B.renderNav(); }
  } catch (_) { /* silencieux : la page Messages affiche les erreurs */ }
};

B.go = (id) => {
  // « Amis » et « Profils suivis » vivent désormais dans « Mon profil » (anciens liens et raccourcis conservés)
  if (id === "friends" || id === "watch") { B.pages.profile.tab = id; id = "profile"; }
  // « Historique », « Statistiques » et « Notifications » vivent désormais dans « Activité » (anciens liens conservés)
  if (id === "history" || id === "stats" || id === "notifs") { B.pages.activity.tab = id; id = "activity"; }
  if (!B.pages[id]) id = "home";
  B.page = id;
  if (id === "activity" && B.pages.activity.tab === "history") B.S.unread = 0;
  B.renderNav();
  B.renderPage(true);
  B.$("#view").scrollTop = 0;
};

B.renderPage = (entering) => {
  const view = B.clear(B.$("#view"));
  const p = B.pages[B.page];
  // `enter` : apparition échelonnée des blocs, uniquement quand on change de page (pas à chaque rafraîchissement)
  try { p.render(view); } catch (e) { view.append(h("div", { class: "notice bad" }, "Impossible d'afficher cette page : " + e.message)); console.error(e); }
  const pg = view.querySelector(".page");
  if (pg && entering === true) { pg.classList.add("enter"); setTimeout(() => pg.classList.remove("enter"), 900); }
};

// ---------- Réglages (appliqués immédiatement) ----------
B.applyAppearance = () => {
  const a = B.S.settings.appearance, r = document.documentElement;
  r.dataset.theme = a.theme;
  r.dataset.potato = a.potato ? "1" : "0";
  r.dataset.anim = a.animations ? "1" : "0";
  r.dataset.shadow = a.shadows ? "1" : "0";
  r.dataset.lightning = a.lightning === false ? "0" : "1";
  r.dataset.fx = a.effects && !a.potato ? "1" : "0";
  B.sound.enabled = a.clickSound !== false;
  B.sound.volume = (a.clickVolume == null ? 40 : a.clickVolume) / 100;
};
B.set = async (patch) => {
  try { B.S.settings = await B.call("settings:set", patch); B.applyAppearance(); }
  catch (e) { B.fail(e); }
  return B.S.settings;
};

// ---------- Pastille d'état ----------
B.renderStatus = () => {
  const s = B.S.snap, el = B.clear(B.$("#status-pill"));
  if (!s) return;
  const kind = s.paused ? "paused" : s.error ? "err" : s.running ? "game" : "on";
  const txt = s.paused ? "Monitoring en pause" : s.error ? s.error : s.running ? "Vérification…" : "Monitoring actif · " + B.ago(s.lastRun);
  el.append(h("span", { class: "dot " + kind }), txt);
  el.title = s.error || "";
};

// ---------- Sélecteur de compte (en-tête) ----------
B.renderAccount = () => {
  const box = B.clear(B.$("#acc-switch"));
  const a = B.S.active;
  if (!a) {
    box.append(h("button", { class: "btn sm pri", onclick: B.addAccount }, "➕ Ajouter un compte"));
    return;
  }
  const dot = h("span", { class: "dot " + (a.status === "ok" ? "on" : "err"), title: a.status === "ok" ? "Session valide" : "Session à reconnecter" });
  const btn = h("button", { class: "acc-btn", title: "Compte actif : " + a.name, "aria-label": "Compte actif : " + a.label, onclick: () => B.go("accounts") },
    B.avatar(a.id, a.label, "sm", a.avatarUrl), h("span", { class: "nm" }, a.label), dot);
  const dots = h("button", { class: "dots", "aria-label": "Menu des comptes", "aria-haspopup": "menu", title: "Comptes" });
  dots.textContent = "⋮";
  dots.onclick = () => B.menu(dots, [
    { node: h("div", { class: "cur" }, B.avatar(a.id, a.label, "sm", a.avatarUrl), h("div", {}, h("b", {}, a.label), h("div", { class: "muted small" }, "Compte actuel · @" + a.name))) },
    "-",
    { label: "🔄 Changer de compte", action: B.switchAccount },
    { label: "➕ Ajouter un compte", action: B.addAccount },
    "-",
    { label: "⚙ Gérer les comptes", action: () => B.go("accounts") }
  ]);
  box.append(btn, dots);
};

B.switchAccount = async () => {
  const list = B.S.accounts;
  let closeModal = null;
  const body = h("div", {}, list.map((a) => h("div", { class: "acc-row" + (a.active ? " cur" : ""), role: "button", tabindex: "0",
    onclick: async () => { if (!a.active) await B.run(() => B.call("accounts:use", a.id)); if (closeModal) closeModal(true); },
    onkeydown: (e) => { if (e.key === "Enter") e.target.click(); } },
    B.avatar(a.id, a.label, "", a.avatarUrl), h("div", { class: "grow" }, h("b", {}, a.label), h("div", { class: "muted small" }, "@" + a.name)),
    a.active ? h("span", { class: "ok" }, "✓ actif") : (a.status !== "ok" ? h("span", { class: "warn small" }, "à reconnecter") : null))));
  if (!list.length) body.append(h("div", { class: "empty" }, "Aucun compte pour le moment."));
  await B.modal({ title: "Changer de compte", body, ready: (c) => { closeModal = c; }, buttons: [{ label: "➕ Ajouter un compte", action: () => { B.addAccount(); return true; } }, { label: "Fermer", value: true }] });
};

B.addAccount = async () => {
  const name = h("input", { type: "text", placeholder: "Ex. : Mon compte principal", maxlength: 40, "aria-label": "Nom du profil" });
  const ok = await B.modal({
    title: "Ajouter un compte",
    body: h("div", {},
      h("label", { class: "small muted" }, "Nom du profil"), name,
      h("p", { class: "small muted", style: "margin-top:12px" }, "Authentification : une fenêtre Roblox s'ouvre pour te connecter. Batblox ne voit jamais ton mot de passe ; la session est chiffrée par Windows et n'est jamais exportée ni envoyée ailleurs."),
      h("p", { class: "small muted" }, "Avatar : récupéré automatiquement.")),
    buttons: [{ label: "Annuler", value: false }, { label: "Se connecter", cls: "pri", value: true }]
  });
  if (!ok) return;
  const wait = h("div", { class: "toast" }, "Connexion en cours… termine-la dans la fenêtre Roblox.");
  B.$("#toasts").append(wait);
  const r = await B.run(() => B.call("accounts:add", { label: name.value }));
  wait.remove();
  if (r) B.toast("Compte « " + r.label + " » ajouté.", "ok");
};

// ---------- Événements du processus principal ----------
B.onEvent = (evt, payload) => {
  if (evt === "monitor") { B.S.snap = payload; B.renderStatus(); const p = B.pages[B.page]; if (p && p.onMonitor && !document.querySelector(".scrim")) p.onMonitor(payload); }
  else if (evt === "history") { if (!(B.page === "activity" && B.pages.activity.tab === "history")) B.S.unread = (B.S.unread || 0) + payload; B.renderNav(); const p = B.pages[B.page]; if (p && p.onHistory) p.onHistory(); }
  else if (evt === "accounts") { B.S.accounts = payload; const p = B.pages[B.page]; if (p && p.onAccounts) p.onAccounts(); }
  else if (evt === "account") { B.S.active = payload; B.S.chatUnread = 0; B.renderNav(); B.renderAccount(); B.renderPage(); B.pollChat(); }
  else if (evt === "settings") { B.S.settings = payload; B.applyAppearance(); }
  else if (evt === "navigate") B.go(payload);
  else if (evt === "launch") { B.go("home"); if (B.S.active && B.pages.home.launch) B.pages.home.launch(); }
  else if (evt === "update") { B.S.update = payload; if (payload && payload.latest) B.toast("Mise à jour disponible : Batblox v" + payload.latest.version + ". Va dans Réglages → Mises à jour.", "ok"); }
  else if (evt === "rpc") { const p = B.pages[B.page]; if (B.page === "discord" && p && p.state) p.state(); }
};

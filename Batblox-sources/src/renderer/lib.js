"use strict";
// Outils communs de l'interface (tout est en français).
const B = (window.B = { pages: {}, S: { settings: null, accounts: [], active: null, snap: null }, page: "home", avatarCache: new Map(), pending: new Map() });

B.call = (name, payload) => {
  if (name === "roblox:launch" || name === "roblox:join") B.toast("Ouverture de Roblox… cela peut prendre quelques secondes.");
  return window.batblox.call(name, payload);
};

B.h = function (tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "value") el.value = v;
    else if (k === "checked" || k === "disabled" || k === "selected") el[k] = !!v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  const add = (c) => { if (c == null || c === false) return; if (Array.isArray(c)) c.forEach(add); else el.append(c.nodeType ? c : document.createTextNode(String(c))); };
  kids.forEach(add);
  return el;
};
const h = B.h;
B.$ = (s, r = document) => r.querySelector(s);
B.clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

// ---------- Formats ----------
const pad = (n) => String(n).padStart(2, "0");
B.time = (ts) => { const d = new Date(ts); return pad(d.getHours()) + ":" + pad(d.getMinutes()); };
B.dateLabel = (ts) => {
  const d = new Date(ts), t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((t - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Hier";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: d.getFullYear() === t.getFullYear() ? undefined : "numeric" });
};
B.ago = (ts) => {
  if (!ts) return "jamais";
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86400)} j`;
};
B.dur = (sec) => { sec = Math.round(sec); if (sec < 60) return sec + " s"; if (sec < 3600) return Math.round(sec / 60) + " min"; return Math.floor(sec / 3600) + " h " + pad(Math.round((sec % 3600) / 60)) + " min"; };
B.bytes = (n) => { n = Number(n) || 0; const fr = (v, d) => v.toFixed(d).replace(".", ","); return n < 1024 ? n + " o" : n < 1048576 ? fr(n / 1024, 0) + " Ko" : n < 1073741824 ? fr(n / 1048576, 1) + " Mo" : fr(n / 1073741824, 2) + " Go"; };
B.num = (n) => (n == null ? "—" : Number(n).toLocaleString("fr-FR"));
// Grand nombre lisible dans une petite tuile : 1 234 567 → « 1,23 M », 123 456 → « 123 k » (la valeur exacte reste dans l'infobulle).
B.numShort = (n) => { if (n == null) return "—"; n = Number(n); const f = (v, d) => v.toLocaleString("fr-FR", { maximumFractionDigits: d }); return n >= 1e6 ? f(n / 1e6, 2) + "\u00a0M" : n >= 1e5 ? f(n / 1e3, 0) + "\u00a0k" : B.num(n); };
// Initiale d'un nom : première lettre ou chiffre (accents compris) ; saute les crochets et emojis de tête sans couper un emoji en deux.
B.initial = (name) => { const t = String(name == null ? "" : name).trim(); const m = t.match(/[\p{L}\p{N}]/u); return (m ? m[0] : Array.from(t)[0] || "?").toUpperCase(); };
const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
B.DAYS = DAYS;
B.DAYS_LONG = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

B.head = (title, sub, actions, embedded) => {
  const act = actions && actions.length ? h("div", { class: "actions" }, actions) : null;
  return embedded ? h("header", { class: "sub" }, h("div", { class: "muted grow" }, sub), act) : h("header", {}, h("div", {}, h("h1", {}, title), h("div", { class: "muted" }, sub)), act);
};
B.countUp = (el, n, ms = 650) => {
  const end = Number(n);
  if (!isFinite(end) || document.documentElement.dataset.anim === "0" || document.documentElement.dataset.potato === "1" || end < 2) { el.textContent = B.num(n); return; }
  const t0 = performance.now();
  const step = (t) => { const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3); el.textContent = B.num(Math.round(end * e)); if (k < 1 && el.isConnected) requestAnimationFrame(step); else el.textContent = B.num(n); };
  requestAnimationFrame(step);
};
B.greet = () => { const hr = new Date().getHours(); return hr < 5 ? "Bonsoir" : hr < 18 ? "Bonjour" : "Bonsoir"; };
B.skeleton = (n = 6) => h("div", { class: "tiles", "aria-busy": "true", "aria-label": "Chargement" }, Array.from({ length: n }, () => h("div", { class: "tile sk-tile" }, h("div", { class: "sk sk-cover" }), h("div", { class: "sk sk-line" }), h("div", { class: "sk sk-line short" }))));

// ---------- Messages ----------
B.toast = (msg, kind) => {
  const t = h("div", { class: "toast " + (kind || ""), role: "status" }, h("span", { class: "t-ico", "aria-hidden": "true" }, kind === "bad" ? "!" : kind === "ok" ? "✓" : "i"), h("span", { class: "t-msg" }, msg));
  B.$("#toasts").append(t);
  setTimeout(() => t.remove(), kind === "bad" ? 7000 : 3800);
};
B.fail = (e) => B.toast((e && e.message ? e.message : String(e)).replace(/^Error invoking remote method 'api': Error: /, ""), "bad");
B.run = async (fn) => { try { return await fn(); } catch (e) { B.fail(e); return undefined; } };

// Mise à jour de Roblox : la lance, puis suit l'avancement (jusqu'à 5 min) en vérifiant la version installée.
B.updateRoblox = async (running, onState, onStart) => {
  if (running > 0 && !(await B.confirm("Roblox est ouvert. Le fermer puis le mettre à jour ? Le jeu en cours sera interrompu.", "Fermer et mettre à jour", true))) return null;
  if (onStart) onStart();
  const r = await B.run(() => B.call("roblox:update", { closeFirst: running > 0 }));
  if (!r) return null;
  if (r.already) { B.toast("Roblox est déjà à jour.", "ok"); return true; }
  B.toast("Mise à jour de Roblox lancée…", "ok");
  const end = Date.now() + 5 * 60 * 1000;
  while (Date.now() < end) {
    await new Promise((res) => setTimeout(res, 3000));
    const u = await B.call("roblox:updateCheck", {}).catch(() => null);
    if (onState) onState(u);
    if (u && u.upToDate) { B.toast("Roblox est à jour ✓ (il s'est ouvert : tu peux le fermer).", "ok"); return true; }
    if (u && !u.updating) break;
  }
  B.toast("La mise à jour n'a pas pu être confirmée. Regarde la fenêtre de Roblox (ou un canal bêta / autre lanceur peut expliquer la différence de version).", "bad");
  return false;
};

B.modal = ({ title, body, buttons, wide, onClose, ready }) => new Promise((resolve) => {
  const layer = B.$("#layer");
  const close = (v) => { scrim.remove(); document.removeEventListener("keydown", onKey); if (onClose) onClose(); resolve(v); };
  const onKey = (e) => { if (e.key !== "Escape") return; const all = layer.querySelectorAll(".scrim"); if (all[all.length - 1] === scrim) close(undefined); };
  const foot = h("div", { class: "foot" }, (buttons || [{ label: "Fermer", value: true }]).map((b) =>
    h("button", { class: "btn " + (b.cls || ""), onclick: async () => { if (b.action) { const r = await b.action(); if (r === false) return; close(r === undefined ? b.value : r); } else close(b.value); } }, b.label)));
  const scrim = h("div", { class: "scrim", onmousedown: (e) => { if (e.target === scrim) close(undefined); } },
    h("div", { class: "modal" + (wide ? " wide" : ""), role: "dialog", "aria-modal": "true", "aria-label": title }, title ? h("h2", {}, title) : null, h("button", { class: "x", "aria-label": "Fermer", title: "Fermer", onclick: () => close(undefined) }, "✕"), body, foot));
  layer.append(scrim);
  document.addEventListener("keydown", onKey);
  const first = scrim.querySelector("input, button.pri, button");
  if (first) first.focus();
  if (ready) ready(close);
});
B.confirm = (message, okLabel = "Confirmer", danger = false) =>
  B.modal({ title: "Confirmation", body: h("p", {}, message), buttons: [{ label: "Annuler", value: false }, { label: okLabel, value: true, cls: danger ? "bad" : "pri" }] });

B.menu = (anchor, items) => {
  const layer = B.$("#layer");
  if (B._closeMenu) B._closeMenu();
  const r = anchor.getBoundingClientRect();
  const m = h("div", { class: "menu", role: "menu" }, items.map((it) =>
    it === "-" ? h("div", { class: "sep" }) : it.node ? it.node : h("button", { role: "menuitem", onclick: () => { close(); it.action(); } }, it.label)));
  const close = () => { m.remove(); document.removeEventListener("mousedown", away, true); document.removeEventListener("keydown", esc); if (B._closeMenu === close) B._closeMenu = null; };
  const away = (e) => { if (!m.contains(e.target) && !anchor.contains(e.target)) close(); };
  const esc = (e) => { if (e.key === "Escape") close(); };
  layer.append(m);
  const below = r.bottom + 6, mh = m.offsetHeight;
  let top = below;
  if (below + mh > window.innerHeight - 8) { top = r.top - 6 - mh; if (top < 8) top = Math.max(8, window.innerHeight - mh - 8); }
  m.style.top = top + "px";
  m.style.left = Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth)) + "px";
  setTimeout(() => { document.addEventListener("mousedown", away, true); document.addEventListener("keydown", esc); }, 0);
  B._closeMenu = close;
  return close;
};

// ---------- Composants ----------
B.switch = (checked, onChange, label) => {
  const i = h("input", { type: "checkbox", checked: !!checked, "aria-label": label || null, onchange: (e) => onChange(e.target.checked) });
  return h("label", { class: "switch" }, i, h("i"));
};
B.row = (label, desc, control) => h("div", { class: "field-row" }, h("div", { class: "lbl" }, label, desc ? h("small", {}, desc) : null), control);
B.dot = (status) => h("span", { class: "dot " + ({ en_ligne: "s-on", jeu: "s-game", studio: "s-game", hors_ligne: "s-off" }[status] || "s-off"), title: B.statusLabel(status) });
B.statusLabel = (s) => ({ en_ligne: "En ligne", jeu: "En jeu", studio: "Dans Studio", hors_ligne: "Hors ligne", inconnu: "Inconnu" }[s] || "Inconnu");

B.avatar = (id, name, cls, url) => {
  const el = h("span", { class: "av " + (cls || "") }, B.initial(name));
  const set = (u) => { if (u) { el.textContent = ""; el.append(h("img", { src: u, alt: "", style: "width:100%;height:100%;object-fit:cover" })); } };
  if (url) { set(url); return el; }
  if (!id) return el;
  id = String(id);
  if (B.avatarCache.has(id)) { set(B.avatarCache.get(id)); return el; }
  (B.pending.get(id) || B.pending.set(id, []).get(id)).push(set);
  if (!B.avatarTimer) B.avatarTimer = setTimeout(B.flushAvatars, 60);
  return el;
};
B.flushAvatars = async () => {
  B.avatarTimer = null;
  const ids = [...B.pending.keys()];
  const jobs = new Map(B.pending); B.pending.clear();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    try {
      const map = await B.call("avatars", chunk);
      for (const id of chunk) { const u = map[id] || null; if (u) B.avatarCache.set(id, u); (jobs.get(id) || []).forEach((f) => f(u)); }
    } catch (_) {}
  }
};

// ---------- Graphiques (SVG, sans bibliothèque) ----------
B.svg = (tag, attrs, ...kids) => {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
  kids.forEach((c) => c && el.append(c.nodeType ? c : document.createTextNode(c)));
  return el;
};
// Graduations « rondes » (1, 2, 5, 10…) ; entières si int.
B.niceTicks = (lo, hi, n = 4, int = false) => {
  const span = hi - lo || 1;
  let step = Math.pow(10, Math.floor(Math.log10(span / n)));
  const err = span / n / step;
  step *= err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1;
  if (int) step = Math.max(1, Math.round(step));
  const out = [];
  for (let v = Math.floor(lo / step) * step; v <= Math.ceil(hi / step) * step + step / 2; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
};
// Courbe lissée monotone (pas de dépassement entre deux points).
B.smoothPath = (P) => {
  const n = P.length, f = (v) => v.toFixed(1);
  if (n < 3) return P.map((p, i) => (i ? "L" : "M") + f(p[0]) + " " + f(p[1])).join(" ");
  const dx = [], m = [], t = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = P[i + 1][0] - P[i][0]; m[i] = (P[i + 1][1] - P[i][1]) / (dx[i] || 1); }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = "M" + f(P[0][0]) + " " + f(P[0][1]);
  for (let i = 0; i < n - 1; i++) d += ` C${f(P[i][0] + dx[i] / 3)} ${f(P[i][1] + (t[i] * dx[i]) / 3)} ${f(P[i + 1][0] - dx[i] / 3)} ${f(P[i + 1][1] - (t[i + 1] * dx[i]) / 3)} ${f(P[i + 1][0])} ${f(P[i + 1][1])}`;
  return d;
};
B._chartTip = () => h("div", { class: "chart-tip", role: "presentation" });
B._placeTip = (tip, xPct, yPct, html) => {
  tip.replaceChildren(...html);
  tip.style.left = Math.min(86, Math.max(14, xPct)) + "%";
  tip.style.top = yPct + "%";
  tip.classList.add("on");
};
// ---------- Préférences des graphiques (mémorisées par section) ----------
B.prefs = {
  get(key, def) { try { return Object.assign({}, def, JSON.parse(localStorage.getItem("bb.chart." + key) || "{}")); } catch (_) { return Object.assign({}, def); } },
  set(key, patch) { try { localStorage.setItem("bb.chart." + key, JSON.stringify(Object.assign(this.get(key, {}), patch))); } catch (_) {} },
  reset(key) { try { localStorage.removeItem("bb.chart." + key); } catch (_) {} }
};
B.downloadCSV = (name, rows) => {
  const csv = "\ufeff" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const a = h("a", { href: URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })), download: name + "-" + new Date().toISOString().slice(0, 10) + ".csv" });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  B.toast("Export enregistré : " + a.download, "ok");
};
// Barre d'outils d'une section : légende à gauche, bouton « Options » à droite, panneau déroulant.
// defs : [{ k, label, desc?, choices:[[valeur, libellé]…] }  ou  { k, label, desc?, sw:true }]
B.sectionTools = (key, defs, o, { rebuild, exportCsv, legend }) => {
  const open = B._reopen === key; B._reopen = null;
  const panel = h("div", { class: "opt-panel", hidden: !open });
  const btn = h("button", { class: "btn sm opt-btn", "aria-expanded": open ? "true" : "false", onclick: () => { const on = panel.hidden; panel.hidden = !on; btn.setAttribute("aria-expanded", on ? "true" : "false"); btn.classList.toggle("on", on); } }, "⚙", " Options");
  if (open) btn.classList.add("on");
  const change = (patch) => { B.prefs.set(key, patch); rebuild(true); };
  for (const d of defs) {
    const ctl = d.sw ? B.switch(o[d.k], (v) => change({ [d.k]: v }), d.label)
      : h("div", { class: "chips" }, d.choices.map(([v, l]) => h("button", { class: "chip" + (o[d.k] === v ? " on" : ""), "aria-pressed": o[d.k] === v ? "true" : "false", onclick: () => change({ [d.k]: v }) }, l)));
    panel.append(B.row(d.label, d.desc, ctl));
  }
  const foot = h("div", { class: "row wrap", style: "padding-top:10px" }, exportCsv ? h("button", { class: "btn sm", onclick: exportCsv }, "⬇ Exporter en CSV") : null, h("span", { class: "grow" }), h("button", { class: "btn sm", onclick: () => { B.prefs.reset(key); rebuild(true); } }, "Réinitialiser"));
  panel.append(foot);
  return { bar: h("div", { class: "chart-tools" }, legend || h("span"), btn), panel };
};
B.lineChart = (points, { label = "", color = "var(--acc2)", width = 640, height = 270, key = "line", name = "valeur" } = {}) => {
  const s = B.svg;
  const pts = points.filter((p) => p.v != null);
  if (pts.length < 2) return h("div", { class: "empty" }, "Pas encore assez de données. Les points apparaissent au fil des vérifications.");
  const o = B.prefs.get(key, { type: "smooth", area: true, points: false, zero: false, extremes: true });
  const wrap = h("div", { class: "chart" });
  const rebuild = (keepOpen) => { B._reopen = keepOpen ? key : null; const n = B.lineChart(points, { label, color, width, height, key, name }); B._reopen = null; wrap.replaceWith(n); };
  const L = 46, R = 16, T = 16, Bt = 28, base = height - Bt;
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t > t0 ? pts[pts.length - 1].t : t0 + 1;
  let lo = Math.min(...pts.map((p) => p.v)), hi = Math.max(...pts.map((p) => p.v));
  if (o.zero && lo > 0) lo = 0;
  if (lo === hi) { lo -= 1; hi += 1; }
  const ticks = B.niceTicks(lo, hi, 4, true), yMin = o.zero ? Math.min(0, ticks[0]) : ticks[0], yMax = ticks[ticks.length - 1];
  const x = (t) => L + ((t - t0) / (t1 - t0)) * (width - L - R);
  const y = (v) => T + (1 - (v - yMin) / (yMax - yMin || 1)) * (base - T);
  const gid = "lg" + (B._gid = (B._gid || 0) + 1);
  const svg = s("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": label });
  svg.append(s("defs", {}, s("linearGradient", { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 },
    s("stop", { offset: "0%", style: `stop-color:${color};stop-opacity:.32` }), s("stop", { offset: "100%", style: `stop-color:${color};stop-opacity:0` }))));
  for (const v of ticks) { const yy = y(v); svg.append(s("line", { x1: L, x2: width - R, y1: yy, y2: yy, class: "grid" }), s("text", { x: L - 8, y: yy + 3.5, "text-anchor": "end" }, Math.round(v).toLocaleString("fr-FR"))); }
  const span = t1 - t0, long = span > 2 * 86400000;
  const fmt = (t) => new Date(t).toLocaleString("fr-FR", long ? { day: "numeric", month: "short" } : { day: "numeric", hour: "2-digit", minute: "2-digit" });
  for (let i = 0; i <= 4; i++) svg.append(s("text", { x: L + ((width - L - R) * i) / 4, y: height - 8, "text-anchor": i === 0 ? "start" : i === 4 ? "end" : "middle" }, fmt(t0 + (span * i) / 4)));
  const P = pts.map((p) => [x(p.t), y(p.v)]), f = (v) => v.toFixed(1);
  const line = o.type === "smooth" ? B.smoothPath(P)
    : o.type === "step" ? P.map((q, i) => (i ? `H${f(q[0])} V${f(q[1])}` : `M${f(q[0])} ${f(q[1])}`)).join(" ")
    : P.map((q, i) => (i ? "L" : "M") + f(q[0]) + " " + f(q[1])).join(" ");
  if (o.area) svg.append(s("path", { d: `${line} L${f(P[P.length - 1][0])} ${base} L${f(P[0][0])} ${base} Z`, fill: `url(#${gid})` }));
  svg.append(s("path", { d: line, fill: "none", stroke: color, "stroke-width": 2.4, "stroke-linecap": "round", "stroke-linejoin": "round" }));
  if (o.points && pts.length <= 120) for (const q of P) svg.append(s("circle", { cx: q[0], cy: q[1], r: 3, class: "pt", style: `stroke:${color}` }));
  const lastI = pts.length - 1;
  if (o.extremes) for (const [i, up] of [[pts.findIndex((p) => p.v === Math.max(...pts.map((z) => z.v))), true], [pts.findIndex((p) => p.v === Math.min(...pts.map((z) => z.v))), false]]) {
    if (i === lastI || i === 0) continue;
    const q = P[i], tx = Math.min(width - R - 14, Math.max(L + 14, q[0]));
    svg.append(s("circle", { cx: q[0], cy: q[1], r: 3.2, class: "pt", style: `stroke:${color}` }), s("text", { x: tx, y: up ? q[1] - 10 : q[1] + 17, "text-anchor": "middle", class: "mk" }, pts[i].v.toLocaleString("fr-FR")));
  }
  const last = P[lastI];
  svg.append(s("circle", { cx: last[0], cy: last[1], r: 7, fill: color, opacity: ".18" }), s("circle", { cx: last[0], cy: last[1], r: 4, class: "pt", style: `stroke:${color};stroke-width:2.4` }));
  const cross = s("line", { y1: T, y2: base, class: "cross", opacity: 0 }), dot = s("circle", { r: 5, class: "pt hot", style: `stroke:${color}`, opacity: 0 });
  svg.append(cross, dot);
  const tip = B._chartTip(), body = h("div", { class: "chart-body" }, svg, tip);
  svg.addEventListener("pointermove", (e) => {
    const r = svg.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * width;
    let k = 0, best = Infinity;
    P.forEach((q, i) => { const d = Math.abs(q[0] - px); if (d < best) { best = d; k = i; } });
    const q = P[k];
    cross.setAttribute("x1", q[0]); cross.setAttribute("x2", q[0]); cross.setAttribute("opacity", 1);
    dot.setAttribute("cx", q[0]); dot.setAttribute("cy", q[1]); dot.setAttribute("opacity", 1);
    B._placeTip(tip, (q[0] / width) * 100, (q[1] / height) * 100, [h("div", { class: "d" }, new Date(pts[k].t).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })), h("b", {}, pts[k].v.toLocaleString("fr-FR"))]);
  });
  svg.addEventListener("pointerleave", () => { cross.setAttribute("opacity", 0); dot.setAttribute("opacity", 0); tip.classList.remove("on"); });
  const tools = B.sectionTools(key, [
    { k: "type", label: "Style de courbe", choices: [["smooth", "Lissée"], ["line", "Droite"], ["step", "Escalier"]] },
    { k: "area", label: "Zone colorée", desc: "Dégradé sous la courbe.", sw: true },
    { k: "points", label: "Afficher les points", desc: "Un repère à chaque mesure.", sw: true },
    { k: "extremes", label: "Afficher le pic et le creux", sw: true },
    { k: "zero", label: "Échelle depuis zéro", desc: "Évite d'exagérer les petites variations.", sw: true }
  ], o, { rebuild, exportCsv: () => B.downloadCSV(name, [["Date", "Valeur"], ...pts.map((p) => [new Date(p.t).toISOString(), p.v])]) });
  wrap.append(tools.bar, tools.panel, body);
  return wrap;
};
B.barChart = (rows, { height = 220, width = 640, key = "bars" } = {}) => {
  const s = B.svg;
  if (!rows.length) return h("div", { class: "empty" }, "Aucun ajout ni retrait sur cette période.");
  const o = B.prefs.get(key, { mode: "group", add: true, rem: true });
  const wrap = h("div", { class: "chart" });
  const rebuild = (keepOpen) => { B._reopen = keepOpen ? key : null; const nw = B.barChart(rows, { height, width, key }); B._reopen = null; wrap.replaceWith(nw); };
  const A = (r) => (o.add ? r.added : 0), D = (r) => (o.rem ? r.removed : 0), mode = o.mode;
  const vals = rows.map((r) => (mode === "net" ? [A(r) - D(r)] : mode === "stack" ? [A(r) + D(r)] : [A(r), D(r)])).flat();
  const L = 34, R = 10, T = 14, Bt = 28, base = height - Bt, n = rows.length;
  const ticks = B.niceTicks(Math.min(0, ...vals), Math.max(1, ...vals), 4, true), yMin = ticks[0], yMax = ticks[ticks.length - 1];
  const y = (v) => T + (1 - (v - yMin) / (yMax - yMin || 1)) * (base - T);
  const gap = (width - L - R) / n, bw = mode === "group" ? Math.min(20, gap * 0.34) : Math.min(34, gap * 0.55);
  const svg = s("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": "Ajouts et retraits par semaine" });
  for (const v of ticks) svg.append(s("line", { x1: L, x2: width - R, y1: y(v), y2: y(v), class: v === 0 ? "axis" : "grid" }), s("text", { x: L - 8, y: y(v) + 3.5, "text-anchor": "end" }, String(v)));
  // Barre de vFrom à vTo, extrémité arrondie côté vTo (rnd = false pour un segment intérieur)
  const bar = (bx, vFrom, vTo, cls, rnd = true) => {
    if (vFrom === vTo) return s("g", {});
    const ya = y(vFrom), yb = y(vTo), top = Math.min(ya, yb), bot = Math.max(ya, yb), r = rnd ? Math.min(5, bw / 2, bot - top) : 0, up = vTo > vFrom, x2 = bx + bw;
    const d = up ? `M${bx} ${bot} V${top + r} Q${bx} ${top} ${bx + r} ${top} H${x2 - r} Q${x2} ${top} ${x2} ${top + r} V${bot} Z`
      : `M${bx} ${top} V${bot - r} Q${bx} ${bot} ${bx + r} ${bot} H${x2 - r} Q${x2} ${bot} ${x2} ${bot - r} V${top} Z`;
    return s("path", { d, class: cls });
  };
  const tip = B._chartTip(), step = Math.ceil(n / 8);
  rows.forEach((r, i) => {
    const gx = L + gap * i, cx = gx + gap / 2, a = A(r), d = D(r);
    const hl = s("rect", { x: gx + 1, y: T, width: gap - 2, height: base - T, rx: 6, class: "hl" });
    const hit = s("rect", { x: gx, y: T, width: gap, height: base - T + Bt - 6, fill: "transparent" });
    svg.append(hl);
    let topY, info;
    if (mode === "net") { const v = a - d; svg.append(bar(cx - bw / 2, 0, v, v >= 0 ? "b-add" : "b-rem")); topY = y(Math.max(0, v)); info = [h("b", { class: v >= 0 ? "ok" : "bad" }, (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v)), " solde"]; }
    else if (mode === "stack") { svg.append(bar(cx - bw / 2, 0, a, "b-add", !d), bar(cx - bw / 2, a, a + d, "b-rem")); topY = y(a + d); info = [h("b", { class: "ok" }, "+" + a), " · ", h("b", { class: "bad" }, "−" + d)]; }
    else { svg.append(bar(cx - bw - 1.5, 0, a, "b-add"), bar(cx + 1.5, 0, d, "b-rem")); topY = y(Math.max(a, d)); info = [h("b", { class: "ok" }, "+" + a), " · ", h("b", { class: "bad" }, "−" + d)]; }
    if (i % step === 0) svg.append(s("text", { x: cx, y: height - 8, "text-anchor": "middle" }, new Date(r.w).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })));
    hit.addEventListener("pointerenter", () => { hl.classList.add("on"); B._placeTip(tip, (cx / width) * 100, (topY / height) * 100, [h("div", { class: "d" }, "Semaine du " + new Date(r.w).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })), ...info]); });
    hit.addEventListener("pointerleave", () => { hl.classList.remove("on"); tip.classList.remove("on"); });
    svg.append(hit);
  });
  const legend = h("div", { class: "chart-legend" }, mode === "net" ? [h("span", {}, h("i", { class: "b-add" }), "Solde positif"), h("span", {}, h("i", { class: "b-rem" }), "Solde négatif")]
    : [o.add ? h("span", {}, h("i", { class: "b-add" }), "Ajouts") : null, o.rem ? h("span", {}, h("i", { class: "b-rem" }), "Retraits") : null]);
  const tools = B.sectionTools(key, [
    { k: "mode", label: "Affichage", choices: [["group", "Côte à côte"], ["stack", "Empilé"], ["net", "Solde net"]] },
    { k: "add", label: "Montrer les ajouts", sw: true },
    { k: "rem", label: "Montrer les retraits", sw: true }
  ], o, { rebuild, legend, exportCsv: () => B.downloadCSV("ajouts-retraits", [["Semaine", "Ajouts", "Retraits", "Solde"], ...rows.map((r) => [new Date(r.w).toISOString().slice(0, 10), r.added, r.removed, r.added - r.removed])]) });
  wrap.append(tools.bar, tools.panel, o.add || o.rem ? h("div", { class: "chart-body" }, svg, tip) : h("div", { class: "empty" }, "Active au moins une série (ajouts ou retraits)."));
  return wrap;
};
// Mini courbe (cartes de chiffres)
B.sparkline = (vals, { color = "var(--acc2)", width = 120, height = 34 } = {}) => {
  const s = B.svg, v = vals.filter((x) => x != null);
  if (v.length < 2) return null;
  let lo = Math.min(...v), hi = Math.max(...v);
  if (lo === hi) { lo -= 1; hi += 1; }
  const P = v.map((x, i) => [(i / (v.length - 1)) * width, 3 + (1 - (x - lo) / (hi - lo)) * (height - 8)]);
  const gid = "sp" + (B._gid = (B._gid || 0) + 1), d = B.smoothPath(P), e = P[P.length - 1];
  return s("svg", { viewBox: `0 0 ${width} ${height}`, class: "spark", "aria-hidden": "true", preserveAspectRatio: "none" },
    s("defs", {}, s("linearGradient", { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, s("stop", { offset: "0%", style: `stop-color:${color};stop-opacity:.28` }), s("stop", { offset: "100%", style: `stop-color:${color};stop-opacity:0` }))),
    s("path", { d: `${d} L${width} ${height} L0 ${height} Z`, fill: `url(#${gid})` }),
    s("path", { d, fill: "none", stroke: color, "stroke-width": 2, "stroke-linecap": "round", "vector-effect": "non-scaling-stroke" }));
};
// Badge de variation (▲ +4 / ▼ −2 / = stable)
B.delta = (diff, unit = "") => h("span", { class: "delta " + (diff > 0 ? "up" : diff < 0 ? "down" : "flat") }, (diff > 0 ? "▲ +" : diff < 0 ? "▼ −" : "＝ ") + (diff === 0 ? "stable" : Math.abs(diff).toLocaleString("fr-FR") + unit));
// En-tête d'un graphique : grosse valeur actuelle + variation sur la période
B.chartSummary = (pts, name) => {
  if (!pts || pts.length < 2) return null;
  const first = pts[0], last = pts[pts.length - 1], diff = last.v - first.v;
  return h("div", { class: "chart-sum" }, h("div", { class: "big" }, last.v.toLocaleString("fr-FR"), h("span", {}, name)), B.delta(diff), h("span", { class: "muted small" }, "depuis le " + new Date(first.t).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })));
};
// Bandeau min / max / moyenne
B.statStrip = (vals) => {
  const avg = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  return h("div", { class: "strip" }, [["Début", vals[0]], ["Minimum", Math.min(...vals)], ["Moyenne", avg], ["Maximum", Math.max(...vals)]].map(([l, v]) => h("div", {}, h("b", {}, B.num(v)), h("span", {}, l))));
};
// Bilan sous le graphique ajouts / retraits
B.weeklySummary = (rows) => {
  const add = rows.reduce((a, r) => a + r.added, 0), rem = rows.reduce((a, r) => a + r.removed, 0), net = add - rem;
  return h("div", { class: "strip" }, [["Ajouts", "+" + add, "ok"], ["Retraits", "−" + rem, "bad"], ["Solde", (net > 0 ? "+" : net < 0 ? "−" : "") + Math.abs(net), net > 0 ? "ok" : net < 0 ? "bad" : ""]].map(([l, v, c]) => h("div", {}, h("b", { class: c }, v), h("span", {}, l))));
};
B.heatColor = (pct) => (pct == null ? "var(--card2)" : `color-mix(in srgb, var(--acc2) ${Math.round(14 + Math.min(100, pct) * 0.86)}%, var(--card2))`);
B.heatmap = (cells, obs, { key = "heat" } = {}) => {
  const o = B.prefs.get(key, { values: false, peak: true, hours: "all" });
  const wrap = h("div", { class: "heatwrap" });
  const rebuild = (keepOpen) => { B._reopen = keepOpen ? key : null; const nw = B.heatmap(cells, obs, { key }); B._reopen = null; wrap.replaceWith(nw); };
  const hrs = o.hours === "day" ? [...Array(16).keys()].map((i) => i + 8) : [...Array(24).keys()];
  const known = cells.filter((v) => v != null), max = known.length ? Math.max(...known) : null;
  const peakIdx = o.peak && max != null && max > 0 ? cells.indexOf(max) : -1;
  const g = h("div", { class: "heat" + (o.values ? " vals" : ""), role: "img", "aria-label": "Carte de présence par jour et par heure", style: `grid-template-columns: 38px repeat(${hrs.length}, 1fr)` });
  g.append(h("div"));
  for (const hr of hrs) g.append(h("div", { class: "l hh" }, hr % (o.hours === "day" ? 2 : 3) === 0 ? String(hr) : ""));
  for (let d = 0; d < 7; d++) {
    g.append(h("div", { class: "l" }, B.DAYS[d]));
    for (const hr of hrs) {
      const i = d * 24 + hr, v = cells[i];
      g.append(h("div", { class: "c" + (v == null ? " n" : "") + (i === peakIdx ? " peak" : ""), style: `background:${B.heatColor(v)}${v != null && v > 55 ? ";color:#fff" : ""}`,
        title: v == null ? `${B.DAYS[d]} ${hr} h — pas encore observé` : `${B.DAYS[d]} ${hr} h — en ligne ${v} % (observé ${Math.round((obs[i] || 0) / 60)} min)` }, o.values && v != null ? String(v) : null));
    }
  }
  const tools = B.sectionTools(key, [
    { k: "hours", label: "Plage horaire", choices: [["all", "24 h"], ["day", "8 h – 23 h"]] },
    { k: "values", label: "Afficher les pourcentages", desc: "Le chiffre dans chaque case.", sw: true },
    { k: "peak", label: "Entourer le meilleur créneau", sw: true }
  ], o, { rebuild, exportCsv: () => B.downloadCSV("presence", [["Jour", "Heure", "En ligne %", "Observé (min)"], ...cells.map((v, i) => [B.DAYS[Math.floor(i / 24)], i % 24, v == null ? "" : v, Math.round((obs[i] || 0) / 60)])]) });
  wrap.append(tools.bar, tools.panel, g, h("div", { class: "heat-legend" }, "Moins", h("i"), "Plus"));
  return wrap;
};

// ---------- Libellés des événements ----------
B.EVENT = {
  added: ["➕", "Ajout"], removed: ["➖", "Retrait"], renamed: ["✏️", "Pseudo"], online: ["🟢", "Connexion"], offline: ["⚪", "Déconnexion"],
  ingame: ["🎮", "Jeu lancé"], leftgame: ["🚪", "Jeu quitté"], req_in: ["📨", "Demande reçue"], req_accepted: ["🤝", "Demande acceptée"], req_gone: ["📪", "Demande disparue"],
  followers: ["👥", "Abonnés"], followings: ["👤", "Abonnements"]
};
B.describe = (e) => {
  const who = e.friendName || "Joueur " + e.friendId;
  const owner = e.target !== "me" ? ` · chez ${e.targetName}` : "";
  switch (e.type) {
    case "added": return `${who} est devenu ami${owner}`;
    case "removed": return `${who} n'est plus ami${owner}${e.reason === "banned" ? " (compte banni)" : e.reason === "deleted" ? " (compte supprimé)" : ""}`;
    case "renamed": return `${e.oldName || "Un joueur"} → ${who}${owner}`;
    case "online": return `${who} s'est connecté`;
    case "offline": return `${who} s'est déconnecté`;
    case "ingame": return `${who} joue à ${e.place || "une expérience"}`;
    case "leftgame": return `${who} a quitté ${e.place || "le jeu"}${e.dur != null ? " (" + B.dur(e.dur) + ")" : ""}`;
    case "req_in": return `${who} t'a envoyé une demande d'ami`;
    case "req_accepted": return `Demande de ${who} acceptée`;
    case "req_gone": return `La demande de ${who} a disparu`;
    case "followers": return `Abonnés : ${e.from} → ${e.to}${owner}`;
    case "followings": return `Abonnements : ${e.from} → ${e.to}${owner}`;
    default: return who;
  }
};
B.eventRow = (e) => h("div", { class: "ev " + e.type }, h("span", { class: "t" }, B.time(e.ts)), h("span", {}, (B.EVENT[e.type] || ["•"])[0] + " " + B.describe(e)));

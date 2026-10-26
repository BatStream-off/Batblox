"use strict";
// Langue de l'interface (Réglages → Apparence → Langue). Le français est la langue du code ; l'anglais est appliqué
// au moment où l'interface fabrique ses éléments (B.h) : textes, infobulles (title), textes d'aide (placeholder) et
// libellés d'accessibilité (aria-label). Les pseudos, noms de jeux, notes et messages ne sont jamais traduits.
// Changer de langue recharge la fenêtre (main.js → app:reloadUI).

(function () {
  const tr = window.BatbloxI18n.makeTranslator(B.I18N_EN);
  B.lang = () => (B.S && B.S.settings && B.S.settings.appearance && B.S.settings.appearance.lang) || "fr";
  B.loc = () => (B.lang() === "en" ? "en-GB" : "fr-FR");
  B.tr = (s) => (B.lang() === "en" ? tr(s) : s);

  // Éléments dont le contenu vient de Roblox ou de l'utilisateur : jamais traduits.
  const SKIP = /(?:^|\s)(pii|tile-name|rc-gname|rc-name|nm|fnote|gchip|txt|desc|who|bk-dir|log|digest-prev|report-pre)(?:\s|$)/;
  const ATTRS = ["title", "placeholder", "aria-label"];
  const trKid = (k) => (typeof k === "string" ? tr(k) : Array.isArray(k) ? k.map(trKid) : k);

  const raw = B.h;
  B.h = function (tag, attrs, ...kids) {
    if (B.lang() !== "en") return raw.apply(this, arguments);
    if (attrs) {
      let a2 = null;
      for (const k of ATTRS) if (typeof attrs[k] === "string") { a2 = a2 || Object.assign({}, attrs); a2[k] = tr(attrs[k]); }
      if (a2) attrs = a2;
    }
    if (!SKIP.test(" " + ((attrs && attrs.class) || "") + " ")) kids = kids.map(trKid);
    return raw.call(this, tag, attrs, ...kids);
  };
  const rawLabel = B.label;
  B.label = (el, text) => rawLabel(el, B.tr(text));

  /** Traduit le HTML statique (barre du haut, intro…) une fois les réglages connus. */
  B.trDom = (root) => {
    if (B.lang() !== "en") return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) { const t = tr(n.data); if (t !== n.data) n.data = t; }
    root.querySelectorAll("[title],[placeholder],[aria-label]").forEach((el) => { for (const a of ATTRS) if (el.hasAttribute(a)) el.setAttribute(a, tr(el.getAttribute(a))); });
  };

  /** Formats propres à la langue (jours, durées relatives, tailles). Appelé au démarrage. */
  B.applyLang = () => {
    const en = B.lang() === "en";
    document.documentElement.lang = en ? "en" : "fr";
    if (!en) return;
    B.DAYS.splice(0, 7, "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun");
    B.DAYS_LONG.splice(0, 7, "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday");
    B.ago = (ts) => {
      if (!ts) return "never";
      const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
      if (s < 60) return "just now";
      if (s < 3600) return Math.floor(s / 60) + " min ago";
      if (s < 86400) return Math.floor(s / 3600) + " h ago";
      const d = Math.floor(s / 86400); return d + (d > 1 ? " days ago" : " day ago");
    };
    B.bytes = (n) => { n = Number(n) || 0; return n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(0) + " KB" : n < 1073741824 ? (n / 1048576).toFixed(1) + " MB" : (n / 1073741824).toFixed(2) + " GB"; };
    B.trDom(document.body);
    document.title = "Batblox";
  };
})();

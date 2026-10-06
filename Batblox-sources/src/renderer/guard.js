"use strict";
// Protection du contenu : empêche la sélection, le copier / couper / coller et le glisser-déposer de l'interface.
// Les champs de saisie (texte, recherche, mot de passe, nombre, heure, zone de texte) restent utilisables normalement.
// Un bloc marqué data-allow-copy échappe à la protection (aucun par défaut).
// Honnêteté : c'est un frein, pas une barrière absolue (captures d'écran, outils de développement F12, etc.).
(function () {
  const TEXT_TYPES = /^(text|search|password|number|time|date|datetime-local|email|url|tel|month|week)$/i;
  const asElement = (t) => (t && t.nodeType === 3 ? t.parentElement : t) || null;

  /** Vrai si l'élément est un champ dans lequel on saisit (ou un bloc explicitement autorisé). */
  function isEditable(node) {
    const el = asElement(node);
    if (!el || typeof el.closest !== "function") return false;
    if (el.closest("[data-allow-copy]")) return true;
    const f = el.closest("input, textarea, [contenteditable]");
    if (!f) return false;
    const tag = String(f.tagName || "").toUpperCase();
    if (tag === "TEXTAREA") return true;
    if (tag === "INPUT") return TEXT_TYPES.test(f.type || "text");
    return f.isContentEditable === true || f.getAttribute("contenteditable") === "" || f.getAttribute("contenteditable") === "true";
  }

  /** Touches de raccourci à bloquer hors champ : Ctrl/Cmd + A, C, X, V ; Ctrl+Inser, Maj+Inser, Maj+Suppr. */
  function isClipboardKey(e) {
    const k = String(e.key || "").toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey && (k === "a" || k === "c" || k === "x" || k === "v")) return true;
    if (mod && k === "insert") return true;
    if (e.shiftKey && (k === "insert" || k === "delete")) return true;
    return false;
  }

  function install(doc) {
    const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
    const guardOutsideFields = (e) => { if (!isEditable(e.target)) stop(e); };
    const opts = true; // phase de capture : passe avant tout autre gestionnaire
    for (const t of ["copy", "cut", "paste", "contextmenu", "selectstart", "dragstart"]) doc.addEventListener(t, guardOutsideFields, opts);
    // Un fichier déposé sur la fenêtre ne doit jamais la faire naviguer ; le texte glissé dans un champ reste possible.
    doc.addEventListener("dragover", (e) => { if (!isEditable(e.target)) e.preventDefault(); }, opts);
    doc.addEventListener("drop", (e) => {
      const files = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length;
      if (!isEditable(e.target) || files) e.preventDefault();
    }, opts);
    doc.addEventListener("keydown", (e) => { if (isClipboardKey(e) && !isEditable(e.target)) stop(e); }, opts);
    // Si une sélection a quand même été créée (programmatiquement ou via un champ qui perd le focus), on la retire.
    doc.addEventListener("selectionchange", () => {
      const sel = doc.getSelection && doc.getSelection();
      if (!sel || sel.isCollapsed) return;
      const n = sel.anchorNode, active = doc.activeElement;
      if (isEditable(n) || isEditable(active)) return;
      sel.removeAllRanges();
    });
  }

  if (typeof document !== "undefined" && typeof window !== "undefined") install(document);
  if (typeof module !== "undefined" && module.exports) module.exports = { isEditable, isClipboardKey, install };
})();

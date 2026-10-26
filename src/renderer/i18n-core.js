"use strict";
// Moteur de traduction partagé (interface + processus principal). Aucun texte ici : seulement la méthode.
//  1. texte complet connu → traduction directe ;
//  2. même texte entouré d'espaces → traduction en gardant les espaces ;
//  3. emoji ou symbole en tête (« 🔄 Actualiser ») → on traduit le reste ;
//  4. sinon : on remplace les morceaux de phrase connus (« Profil « » + nom + « » ajouté. »), du plus long au plus court.
// Un texte inconnu reste en français : rien ne casse, il manque juste une traduction (voir tools/i18n-couverture.js).
(function (root) {
  function makeTranslator(D) {
    const full = (D && D.full) || {}, frag = (D && D.frag) || {};
    const fragKeys = Object.keys(frag).sort((a, b) => b.length - a.length);
    const cache = new Map();
    const LEAD = /^((?:\p{Extended_Pictographic}|[✓✕✗⚠⏳⏸▶◀●←→⬆⬇↑↓•])️?)(\s+)([\s\S]+)$/u;
    const LETTERS = /[A-Za-zÀ-ÿ]{2}/;
    function tr(s) {
      if (typeof s !== "string" || !s || !LETTERS.test(s)) return s;
      const hit = cache.get(s);
      if (hit !== undefined) return hit;
      let out = full[s];
      if (out === undefined) {
        const t = s.trim();
        if (t && t !== s && full[t] !== undefined) { const i = s.indexOf(t); out = s.slice(0, i) + full[t] + s.slice(i + t.length); }
      }
      if (out === undefined) {
        const m = LEAD.exec(s);
        if (m) { const r = tr(m[3]); if (r !== m[3]) out = m[1] + m[2] + r; }
      }
      if (out === undefined) {
        let x = s;
        for (const k of fragKeys) if (x.indexOf(k) !== -1) x = x.split(k).join(frag[k]);
        out = x;
      }
      if (cache.size < 8000) cache.set(s, out);
      return out;
    }
    return tr;
  }
  if (typeof module !== "undefined" && module.exports) module.exports = { makeTranslator };
  else root.BatbloxI18n = { makeTranslator };
})(typeof window !== "undefined" ? window : globalThis);

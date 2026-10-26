"use strict";
// Liste les textes français de l'interface qui n'ont pas encore de traduction anglaise.
// Usage : node tools/i18n-couverture.js     (à lancer après avoir ajouté des textes ; complète ensuite src/renderer/i18n-en.js)
// Heuristique : chaînes entre guillemets contenant une lettre accentuée ou « », hors commentaires et journaux.
const fs = require("fs");
const path = require("path");
const { makeTranslator } = require("../src/renderer/i18n-core");
const D = require("../src/renderer/i18n-en");
const tr = makeTranslator(D);
const dirs = [path.join(__dirname, "../src/renderer"), path.join(__dirname, "../src/main"), path.join(__dirname, "../src/main/core")];
const ACC = /[àâçéèêëîïôûùüÿœÀÂÇÉÈÊÎÔÛ«»]/;
const missing = new Map();
for (const dir of dirs) for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".js") && !x.startsWith("i18n"))) {
  const src = fs.readFileSync(path.join(dir, f), "utf8").split("\n").filter((l) => !/^\s*\/\/|logger\.|this\.log\.|console\./.test(l)).join("\n");
  const re = /"((?:[^"\\\n]|\\.){3,})"/g; let m;
  while ((m = re.exec(src))) {
    const s = m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
    if (!ACC.test(s) || /^[\w.:-]+$/.test(s) || s.includes("<svg") || !/[A-Za-zÀ-ÿ]{2}/.test(s)) continue; // ponctuation seule (« » .) : rien à traduire
    if (tr(s) === s && !missing.has(s)) missing.set(s, f);
  }
}
for (const [s, f] of missing) console.log(f.padEnd(18), JSON.stringify(s));
console.log(`\n${missing.size} texte(s) sans traduction anglaise.`);

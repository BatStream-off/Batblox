"use strict";
// Coffre pour les secrets (cookie de session Roblox). Le chiffrement est délégué à Windows (DPAPI) via
// Electron safeStorage : seul le texte chiffré est écrit sur le disque. Aucun secret n'est journalisé ni exporté.

class Vault {
  constructor(safeStorage) { this.ss = safeStorage; }
  available() { try { return !!this.ss && this.ss.isEncryptionAvailable(); } catch (_) { return false; } }
  seal(plain) {
    if (!this.available()) throw new Error("Le chiffrement Windows n'est pas disponible : le compte ne peut pas être enregistré.");
    return this.ss.encryptString(String(plain)).toString("base64");
  }
  open(b64) {
    if (!b64 || !this.available()) return null;
    try { return this.ss.decryptString(Buffer.from(b64, "base64")); } catch (_) { return null; }
  }
}

// Retire tout ce qui ressemble à un secret avant d'écrire dans un journal ou un message d'erreur.
function scrub(text) {
  return String(text == null ? "" : text)
    .replace(/_\|WARNING:[^\s"';]+/g, "[secret masqué]")
    .replace(/\.ROBLOSECURITY=[^;\s"']+/gi, ".ROBLOSECURITY=[masqué]")
    .replace(/rbx-authentication-ticket[^\s"']*/gi, "[ticket masqué]");
}

module.exports = { Vault, scrub };

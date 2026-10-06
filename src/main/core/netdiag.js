"use strict";
// Test de connexion : vérifie, un par un, tout ce que Batblox demande à Internet (Roblox, Discord, ntfy)
// et explique le résultat en français. Ne publie rien (le test Discord ne fait que LIRE le webhook).
const { DISCORD_RE, NTFY_TOPIC_RE } = require("./defaults");

const TIMEOUT = 15000;

function explain(e) {
  const s = e && e.status;
  const m = String((e && (e.message || (e.cause && e.cause.message))) || e || "");
  if (!s && m.includes(" | ")) return "toutes les méthodes ont échoué → " + m; // détail méthode par méthode
  if (s === 401) return "session refusée : reconnecte le compte";
  if (s === 403) return "accès refusé (403) : Roblox/Discord bloque la requête (VPN, proxy ou compte limité ?)";
  if (s === 404) return "introuvable (404)";
  if (s === 429) return "Roblox limite les requêtes (429) : réessaie dans " + (e.retryAfter > 90 ? Math.round(e.retryAfter / 60) + " min" : (e.retryAfter || 60) + " s") + " (VPN, IP partagée ou autre outil Roblox ouvert ?)";
  if (s >= 500) return "le service est en panne (" + s + ")";
  if (s) return "réponse inattendue (" + s + ")";
  if (/ERR_BLOCKED_BY_CLIENT/i.test(m)) return "requête bloquée côté application ou par une extension/antivirus (Batblox essaie une autre méthode)";
  if (/ERR_NAME_NOT_RESOLVED|ENOTFOUND/i.test(m)) return "adresse introuvable : pas d'Internet ou DNS bloqué";
  if (/ERR_INTERNET_DISCONNECTED/i.test(m)) return "pas de connexion Internet";
  if (/ERR_PROXY|ERR_TUNNEL/i.test(m)) return "proxy ou VPN qui bloque la connexion";
  if (/ERR_CERT|CERT_|SSL/i.test(m)) return "certificat refusé : antivirus qui inspecte le HTTPS, ou date/heure du PC fausse";
  if (/ERR_CONNECTION|ECONNRESET|ECONNREFUSED|ERR_TIMED_OUT|ETIMEDOUT|abort|timeout/i.test(m)) return "connexion coupée ou trop lente : pare-feu, antivirus ou VPN ?";
  return m.slice(0, 500) || "erreur réseau";
}

async function timed(fn) {
  const t = Date.now();
  try { const detail = await fn(); return { ok: true, detail: detail || "", ms: Date.now() - t }; }
  catch (e) { return { ok: false, detail: explain(e), ms: Date.now() - t }; }
}

async function runDiagnostics({ accounts, getSettings, fetch }) {
  const out = [];
  const add = async (label, fn) => out.push(Object.assign({ label }, await timed(fn)));
  const get = async (url) => {
    const r = await fetch(url, { method: "GET", signal: AbortSignal.timeout(TIMEOUT) });
    if (!r.ok) throw Object.assign(new Error("HTTP " + r.status), { status: r.status });
    return r;
  };

  await add("Roblox : accès à Internet", async () => { await get("https://users.roblox.com/v1/users/1"); });

  const acc = accounts.active();
  const client = acc ? accounts.client(acc.id) : null;
  if (client && client.resetBackoff) client.resetBackoff(); // le test repart d'une page blanche : il doit voir la vraie réponse de Roblox
  if (!acc) out.push({ label: "Roblox : compte", ok: false, detail: "aucun compte actif : ajoute-en un dans « Comptes »", ms: 0 });
  else {
    await add("Roblox : session du compte « " + acc.label + " »", async () => { const me = await client.authenticated(); return "connecté en tant que " + me.name; });
    await add("Roblox : liste d'amis", async () => { const f = await client.friends(acc.id); return Object.keys(f).length + " ami(s)"; });
    await add("Roblox : statuts en ligne", async () => { await client.presence([acc.id]); });
    await add("Roblox : ticket de lancement", async () => { await client.authTicket(); });
  }

  const N = getSettings().notifications;
  if (!N.discord.enabled || !N.discord.url) out.push({ label: "Discord", ok: null, detail: "non configuré (Réglages → Discord)", ms: 0 });
  else if (!DISCORD_RE.test(N.discord.url)) out.push({ label: "Discord : webhook", ok: false, detail: "adresse du webhook invalide", ms: 0 });
  else await add("Discord : webhook", async () => { await get(N.discord.url); return "webhook valide"; });

  if (!N.ntfy.enabled) out.push({ label: "ntfy", ok: null, detail: "non configuré", ms: 0 });
  else if (!NTFY_TOPIC_RE.test(N.ntfy.topic || "")) out.push({ label: "ntfy : sujet", ok: false, detail: "sujet invalide", ms: 0 });
  else await add("ntfy : serveur", async () => { await get(String(N.ntfy.server || "https://ntfy.sh").replace(/\/+$/, "") + "/v1/health"); });

  return out;
}

module.exports = { runDiagnostics, explain };

"use strict";
// Deuxième chemin réseau : requêtes SANS session pour les données publiques (profils suivis).
// - jamais de cookie ni d'en-tête d'identification, même si l'appelant en fournit ;
// - uniquement quelques services Roblox publics (liste blanche) ;
// - relais optionnel (un domaine, ex. « roproxy.com ») : friends.roblox.com -> friends.roproxy.com ;
//   si le relais est injoignable ou en panne (5xx), repli direct vers Roblox.

const PUBLIC_HOSTS = new Set(["friends.roblox.com", "users.roblox.com", "thumbnails.roblox.com", "games.roblox.com", "clientsettings.roblox.com"]);
const FORBIDDEN_HEADERS = new Set(["cookie", "authorization", "x-batblox-referer"]);

function cleanInit(init) {
  const out = Object.assign({}, init, { credentials: "omit" });
  const h = {};
  for (const [k, v] of Object.entries((init && init.headers) || {})) if (!FORBIDDEN_HEADERS.has(k.toLowerCase())) h[k] = v;
  out.headers = h;
  return out;
}

function assertPublic(url) {
  let u;
  try { u = new URL(url); } catch (_) { throw new Error("Adresse invalide."); }
  if (u.protocol !== "https:" || !PUBLIC_HOSTS.has(u.hostname)) throw new Error("Service non public : " + u.hostname);
  return u;
}

/** friends.roblox.com -> friends.<domaine> (le domaine a déjà été validé par les réglages). */
function viaProxy(url, domain) {
  const u = assertPublic(url);
  u.hostname = u.hostname.replace(/roblox\.com$/, domain);
  return u.toString();
}

/**
 * @param {object} o
 *  rawFetch(url, init) : fetch d'une session SANS cookie
 *  getProxy() : domaine du relais ("" = direct)
 */
function makePublicFetch({ rawFetch, getProxy }) {
  return async (url, init) => {
    assertPublic(url);
    const safe = cleanInit(init);
    const domain = String((getProxy && getProxy()) || "").trim();
    if (!domain) return rawFetch(url, safe);
    try {
      const res = await rawFetch(viaProxy(url, domain), safe);
      if (res.status < 500) return res;
    } catch (_) { /* relais injoignable : repli direct */ }
    return rawFetch(url, safe);
  };
}

module.exports = { makePublicFetch, viaProxy, assertPublic, PUBLIC_HOSTS };

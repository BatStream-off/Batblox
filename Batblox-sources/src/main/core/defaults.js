"use strict";
// Réglages par défaut de Batblox (français uniquement).
const SCHEMA_VERSION = 1;

const DEFAULT_SETTINGS = {
  schemaVersion: SCHEMA_VERSION,
  appearance: { theme: "auto", potato: false, animations: true, shadows: true, effects: true, clickSound: true, clickVolume: 40 },
  monitoring: {
    enabled: true,
    intervalSec: 60,
    friends: true,
    presence: true,
    names: true,
    follows: true,
    requests: true,
    presenceMode: "all", // "favorites" | "all"
    favorites: [],
    gameOnly: [],
    presenceStats: false,
    idleDays: 30,
    showMyStatus: true
  },
  notifications: {
    enabled: true,
    sound: true,
    events: { added: true, removed: true, renamed: true, online: true, offline: true, ingame: true, req_in: true, followers: false, followings: false },
    quiet: { enabled: false, from: "23:00", to: "07:00" },
    discord: { enabled: false, url: "" },
    ntfy: { enabled: false, server: "https://ntfy.sh", topic: "" }
  },
  network: { publicProxy: "" }, // domaine d'un relais pour les données publiques des profils suivis (vide = direct, sans session)
  system: { trayOnClose: true, startMinimized: false, launchAtStartup: false },
  launcher: { favorites: [], autoReapplyCustom: true, client: "auto", customExe: "" }, // client : auto | roblox | bloxstrap | fishstrap | voidstrap | custom
  maintenance: { autoClean: false, autoCleanMb: 500 },
  discordRpc: { enabled: false, clientId: "" },
  updates: { checkOnStart: true } // vérification des mises à jour GitHub au démarrage
};

function isObj(x) { return x && typeof x === "object" && !Array.isArray(x); }

// Fusion profonde : les valeurs de `src` écrasent `base`, les clés manquantes gardent leur défaut.
// Le résultat ne partage jamais d'objet avec `base` (sinon modifier un réglage altérerait les valeurs par défaut).
function clone(x) { return JSON.parse(JSON.stringify(x)); }
function merge(base, src) {
  const out = clone(base);
  if (!isObj(src)) return out;
  for (const k of Object.keys(src)) {
    if (isObj(base[k]) && isObj(src[k])) out[k] = merge(base[k], src[k]);
    else if (src[k] !== undefined) out[k] = Array.isArray(src[k]) || isObj(src[k]) ? clone(src[k]) : src[k];
  }
  return out;
}

// Bascule le suivi du statut d'un ami. En mode « tous mes amis », on passe en « amis sélectionnés » :
// tous les amis actuels restent suivis, sauf celui qu'on vient de retirer (ou on ajoute celui demandé).
function trackPatch(mon, friendIds, id, on) {
  const all = mon.presenceMode === "all";
  const fav = new Set((all ? friendIds : mon.favorites || []).map(String));
  if (on) fav.add(String(id)); else fav.delete(String(id));
  return { presenceMode: "favorites", favorites: [...fav], converted: all };
}

const DISCORD_RE = /^https:\/\/(?:[\w-]+\.)?discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/\d+\/[\w-]+$/;
// Domaine seul (ex. roproxy.com) : jamais d'adresse complète, de port ni de chemin.
const PROXY_DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/i;
const NTFY_TOPIC_RE = /^[A-Za-z0-9_-]{1,64}$/;

const HISTORY_TYPES = ["added", "removed", "renamed", "online", "offline", "ingame", "leftgame", "req_in", "req_accepted", "req_gone", "followers", "followings"];

module.exports = { SCHEMA_VERSION, DEFAULT_SETTINGS, merge, isObj, DISCORD_RE, NTFY_TOPIC_RE, PROXY_DOMAIN_RE, HISTORY_TYPES, trackPatch };

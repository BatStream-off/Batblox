"use strict";
// Bilan du mois : temps de jeu, amis gagnés et perdus, pseudos changés, jeux préférés (les miens et ceux de mes amis).
// Calculé à la demande à partir de l'historique et du temps de jeu déjà enregistrés : rien de plus n'est collecté.

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const pad = (n) => String(n).padStart(2, "0");
const monthKey = (y, m) => y + "-" + pad(m + 1); // m : 0 à 11

/** Mois disponibles (le plus récent d'abord), d'après l'historique et le temps de jeu. */
function monthsWithData(entries, playDays, now = Date.now()) {
  const set = new Set([monthKey(new Date(now).getFullYear(), new Date(now).getMonth())]);
  for (const e of entries || []) { const d = new Date(e.ts); set.add(monthKey(d.getFullYear(), d.getMonth())); }
  for (const k of Object.keys(playDays || {})) set.add(k.slice(0, 7));
  return [...set].sort().reverse().slice(0, 24);
}

/**
 * entries : historique ; playDays : { "AAAA-MM-JJ": { s, g: { id: { n, s } } } } ; y, m : année et mois (0 à 11) ; accId : compte.
 */
function buildRecap({ entries, playDays, y, m, accId }) {
  const key = monthKey(y, m);
  const from = new Date(y, m, 1).getTime(), to = new Date(y, m + 1, 1).getTime();
  const mine = (entries || []).filter((e) => e.ts >= from && e.ts < to && (e.target === "me" || e.target == null) && (!accId || !e.acc || e.acc === accId));
  // Gagné = absent au début du mois et présent à la fin ; perdu = l'inverse. Un ami retiré puis rajouté (ou l'inverse)
  // dans le même mois ne compte donc ni comme gagné ni comme perdu.
  const seq = new Map();
  for (const e of mine.slice().sort((a, b) => a.ts - b.ts)) {
    if (e.type !== "added" && e.type !== "req_accepted" && e.type !== "removed") continue;
    const k = String(e.friendId), add = e.type !== "removed";
    const s = seq.get(k) || { start: !add, id: e.friendId, name: "", ts: e.ts, reason: undefined };
    s.end = add; s.ts = e.ts; s.name = e.friendName || s.name || "Joueur " + e.friendId; if (!add) s.reason = e.reason;
    seq.set(k, s);
  }
  const gained = [...seq.values()].filter((s) => !s.start && s.end).map((s) => ({ id: s.id, name: s.name, ts: s.ts }));
  const removed = [...seq.values()].filter((s) => s.start && !s.end).map((s) => ({ id: s.id, name: s.name, ts: s.ts, reason: s.reason }));
  const renamed = mine.filter((e) => e.type === "renamed").map((e) => ({ id: e.friendId, from: e.oldName || "", to: e.friendName || "", ts: e.ts }));
  const requests = mine.filter((e) => e.type === "req_in").length;

  // Jeux de mes amis : nombre de parties lancées et temps passé (quand « Jeu quitté » donne la durée)
  const fg = {};
  for (const e of mine) {
    if (e.type !== "ingame" && e.type !== "leftgame") continue;
    const k = e.pid || e.place; if (!k) continue;
    const g = fg[k] || (fg[k] = { id: String(e.pid || ""), name: e.place || "", plays: 0, s: 0, players: new Set() });
    if (e.type === "ingame") { g.plays++; g.players.add(String(e.friendId)); } else if (e.dur) g.s += e.dur;
    if (e.place) g.name = e.place;
  }
  const friendGames = Object.values(fg).map((g) => ({ id: g.id, name: g.name, plays: g.plays, s: g.s, players: g.players.size })).sort((a, b) => b.players - a.players || b.plays - a.plays).slice(0, 6);
  // Ami le plus actif : le plus de parties lancées
  const act = {};
  for (const e of mine) if (e.type === "ingame") { const a = act[e.friendId] || (act[e.friendId] = { id: String(e.friendId), name: e.friendName || "", plays: 0 }); a.plays++; if (e.friendName) a.name = e.friendName; }
  const topFriend = Object.values(act).sort((a, b) => b.plays - a.plays)[0] || null;

  // Mon temps de jeu
  let total = 0, days = 0, best = null;
  const games = {};
  for (const [k, d] of Object.entries(playDays || {})) {
    if (k.slice(0, 7) !== key || !d) continue;
    total += d.s || 0;
    if (d.s > 0) days++;
    if (!best || d.s > best.s) best = { day: k, s: d.s };
    for (const [id, g] of Object.entries(d.g || {})) { const t = games[id] || (games[id] = { id, name: g.n || "", s: 0 }); t.s += g.s; if (g.n) t.name = g.n; }
  }
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  return {
    key, y, m, label: MONTHS[m] + " " + y, daysInMonth,
    play: { total, days, avg: days ? Math.round(total / days) : 0, best: best && best.s > 0 ? best : null, top: Object.values(games).sort((a, b) => b.s - a.s).slice(0, 6) },
    friends: { gained, removed, net: gained.length - removed.length, renamed, requests },
    friendGames, topFriend, events: mine.length
  };
}

const fmtDur = (sec) => { sec = Math.round(sec || 0); const h = Math.floor(sec / 3600), mn = Math.round((sec % 3600) / 60); return !sec ? "0 min" : h ? h + " h " + pad(mn) : mn + " min"; };

/** Version texte du bilan (copier-coller, message Discord). */
function recapText(r) {
  const L = [`🦇 Mon bilan Batblox — ${r.label}`, ""];
  L.push(`🎮 Temps de jeu : ${fmtDur(r.play.total)} sur ${r.play.days} jour(s)` + (r.play.days ? ` (moyenne ${fmtDur(r.play.avg)})` : ""));
  if (r.play.top.length) L.push("   Mes jeux : " + r.play.top.slice(0, 3).map((g) => `${g.name || "Jeu " + g.id} (${fmtDur(g.s)})`).join(", "));
  L.push(`👥 Amis : +${r.friends.gained.length} / −${r.friends.removed.length}` + (r.friends.renamed.length ? ` · ${r.friends.renamed.length} pseudo(s) changé(s)` : "") + (r.friends.requests ? ` · ${r.friends.requests} demande(s) reçue(s)` : ""));
  if (r.friendGames.length) L.push("🔥 Jeux de mes amis : " + r.friendGames.slice(0, 3).map((g) => g.name || "Jeu " + g.id).join(", "));
  return L.join("\n");
}

/** Version CSV (une ligne par élément). */
function recapCsv(r) {
  const q = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
  const rows = [["section", "nom", "valeur", "date"]];
  rows.push(["temps de jeu", "total (min)", Math.round(r.play.total / 60), r.key], ["temps de jeu", "jours joués", r.play.days, r.key]);
  for (const g of r.play.top) rows.push(["mes jeux", g.name || g.id, Math.round(g.s / 60) + " min", ""]);
  for (const a of r.friends.gained) rows.push(["ami ajouté", a.name, "", new Date(a.ts).toISOString().slice(0, 10)]);
  for (const a of r.friends.removed) rows.push(["ami retiré", a.name, a.reason || "", new Date(a.ts).toISOString().slice(0, 10)]);
  for (const x of r.friends.renamed) rows.push(["pseudo changé", x.from + " → " + x.to, "", new Date(x.ts).toISOString().slice(0, 10)]);
  for (const g of r.friendGames) rows.push(["jeux de mes amis", g.name || g.id, g.players + " ami(s), " + g.plays + " partie(s)", ""]);
  return "﻿" + rows.map((x) => x.map(q).join(";")).join("\r\n");
}

module.exports = { buildRecap, monthsWithData, recapText, recapCsv, monthKey, MONTHS };

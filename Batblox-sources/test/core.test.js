"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { EventEmitter } = require("events");

const { Storage } = require("../src/main/core/storage");
const { DEFAULT_SETTINGS, merge } = require("../src/main/core/defaults");
const { Vault, scrub } = require("../src/main/core/security");
const { AccountManager } = require("../src/main/core/accounts");
const { Monitor, diffMaps, presenceTransition } = require("../src/main/core/monitoring");
const { Notifier, describe, inQuiet } = require("../src/main/core/notifier");
const { parsePlaceId, buildLaunchUri, parseTasklist, RobloxLauncher } = require("../src/main/core/launcher");
const { DataTools } = require("../src/main/core/datatools");
const { Customization } = require("../src/main/core/customization");
const { Maintenance } = require("../src/main/core/maintenance");
const { RobloxClient } = require("../src/main/core/roblox");
const { Executor, validPath } = require("../src/main/core/executor");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "batblox-"));
const logger = { info() {}, warn() {}, error() {} };
const fakeSafe = { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from("ENC:" + Buffer.from(s).toString("base64")), decryptString: (b) => Buffer.from(b.toString().slice(4), "base64").toString() };

test("stockage : écriture atomique, relecture, fichier corrompu mis de côté", () => {
  const dir = tmp();
  const s = new Storage(dir, { delay: 5 });
  s.set("a", { x: 1 });
  s.flush();
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "a.json"), "utf8")).schemaVersion, 1);
  assert.deepEqual(new Storage(dir).get("a").x, 1);
  fs.writeFileSync(path.join(dir, "b.json"), "{pas du json");
  assert.deepEqual(new Storage(dir).get("b", () => ({ ok: true })).ok, true);
  assert.ok(fs.readdirSync(dir).some((f) => f.startsWith("b.json.corrompu-")));
});

test("réglages : fusion profonde conserve les valeurs par défaut", () => {
  const m = merge(DEFAULT_SETTINGS, { appearance: { theme: "bat" }, notifications: { quiet: { enabled: true } } });
  assert.equal(m.appearance.theme, "bat");
  assert.equal(m.appearance.potato, false);
  assert.equal(m.notifications.quiet.from, "23:00");
  assert.equal(m.notifications.events.added, true);
  m.monitoring.enabled = false; // ne doit jamais altérer les valeurs par défaut
  assert.equal(DEFAULT_SETTINGS.monitoring.enabled, true);
  assert.equal(merge(DEFAULT_SETTINGS, {}).monitoring.enabled, true);
});

test("sécurité : le coffre chiffre et scrub masque les secrets", () => {
  const v = new Vault(fakeSafe);
  const enc = v.seal("_|WARNING:-DO-NOT-SHARE-secret");
  assert.ok(!enc.includes("secret"));
  assert.equal(v.open(enc), "_|WARNING:-DO-NOT-SHARE-secret");
  assert.ok(!scrub("cookie .ROBLOSECURITY=_|WARNING:abc123 fin").includes("abc123"));
  assert.throws(() => new Vault({ isEncryptionAvailable: () => false }).seal("x"));
});

test("monitoring : diff des amis (ajout, retrait, pseudo, nom découvert)", () => {
  const d = diffMaps({ 1: "A", 2: "B", 3: "" }, { 1: "A2", 3: "C", 4: "D" });
  assert.deepEqual(d.added, ["4"]);
  assert.deepEqual(d.removed, ["2"]);
  assert.deepEqual(d.renamed, ["1"]);
  assert.deepEqual(d.fill, ["3"]);
});

test("présence : états, 2 vérifications hors ligne d'affilée, sortie de jeu", () => {
  const T = 1000;
  assert.deepEqual(presenceTransition(null, { type: 1 }, T).events, []); // départ : aucun événement
  assert.deepEqual(presenceTransition({ c: "off", off: 0 }, { type: 1 }, T).events.map((e) => e.type), ["online"]);
  let r = presenceTransition({ c: "on", off: 0 }, { type: 0 }, T);
  assert.deepEqual(r.events, []); assert.equal(r.next.off, 1);
  r = presenceTransition(r.next, { type: 0 }, T);
  assert.deepEqual(r.events.map((e) => e.type), ["offline"]);
  r = presenceTransition({ c: "on", off: 0 }, { type: 2, place: "Brookhaven", pid: "1" }, T);
  assert.deepEqual(r.events.map((e) => e.type), ["ingame"]);
  r = presenceTransition({ c: "game", off: 0, place: "Brookhaven", pid: "1", gs: 1000 }, { type: 2, place: "Brookhaven", pid: "1" }, T + 5000);
  assert.deepEqual(r.events, []); // même jeu : la session continue
  r = presenceTransition({ c: "game", off: 0, place: "Brookhaven", pid: "1", gs: 1000 }, { type: 1 }, T + 120000);
  assert.deepEqual(r.events.map((e) => e.type), ["leftgame"]); assert.equal(r.events[0].dur, 120);
});

test("notifications : plage « ne pas déranger » (passe minuit) et textes français", () => {
  const q = { enabled: true, from: "23:00", to: "07:00" };
  const at = (h, m) => new Date(2026, 0, 1, h, m);
  assert.equal(inQuiet(q, at(23, 30)), true);
  assert.equal(inQuiet(q, at(3, 0)), true);
  assert.equal(inQuiet(q, at(12, 0)), false);
  assert.equal(inQuiet({ enabled: false, from: "23:00", to: "07:00" }, at(23, 30)), false);
  assert.match(describe({ type: "ingame", friendName: "Bob", place: "Adopt Me", target: "me" }).text, /Bob joue à Adopt Me/);
  assert.match(describe({ type: "removed", friendName: "Eve", reason: "banned", target: "me" }).text, /banni/);
});

test("notifier : filtre par type, regroupement, silence en plage calme, webhook invalide refusé", async () => {
  const sent = [];
  const settings = merge(DEFAULT_SETTINGS, {});
  settings.notifications.events.offline = false;
  const n = new Notifier({ getSettings: () => settings, desktop: (t, b) => sent.push([t, b]), logger, fetchImpl: async () => ({ ok: true }) });
  const ev = (type, i) => ({ type, friendName: "P" + i, friendId: String(i), target: "me", targetName: "Moi" });
  assert.equal(n.notify([ev("added", 1), ev("offline", 2)]), 1);
  assert.equal(sent.length, 1);
  sent.length = 0;
  assert.equal(n.notify([1, 2, 3, 4, 5, 6, 7].map((i) => ev("added", i))), 1); // regroupé
  settings.notifications.quiet = { enabled: true, from: "00:00", to: "23:59" };
  assert.equal(n.notify([ev("added", 9)], new Date(2026, 0, 1, 12, 0)), 0);
  await assert.rejects(() => n.sendDiscord("http://evil.example/hook", { icon: "", title: "", text: "" }));
});

test("lanceur : lecture des identifiants, URI de lancement, tasklist", () => {
  assert.equal(parsePlaceId("https://www.roblox.com/games/920587237/Adopt-Me"), "920587237");
  assert.equal(parsePlaceId(" 12345 "), "12345");
  assert.equal(parsePlaceId("n'importe quoi"), null);
  const u = buildLaunchUri({ ticket: "TICKET", placeId: "1", jobId: "abc-123", trackerId: "9", now: 5, uuid: "u" });
  assert.match(u, /^roblox-player:1\+launchmode:play\+gameinfo:TICKET\+launchtime:5\+placelauncherurl:/);
  assert.ok(decodeURIComponent(u).includes("request=RequestGameJob") && decodeURIComponent(u).includes("gameId=abc-123"));
  const out = '"RobloxPlayerBeta.exe","4242","Console","1","512 344 Ko"\r\n"Autre.exe","1","Console","1","10 Ko"\r\n';
  assert.deepEqual(parseTasklist(out), [{ pid: 4242, memKb: 512344 }]);
});

// ---- Faux client Roblox pour les tests d'intégration
function fakeWorld() {
  const w = { friends: { 1: "Alice", 2: "Bob" }, presence: { 1: { type: 1 }, 2: { type: 0 } }, requests: {}, counts: { fo: 5, fg: 3 }, calls: 0 };
  const client = {
    limited: false, nameCache: new Map(),
    async friends() { w.calls++; return { ...w.friends }; },
    async counts() { return w.counts; },
    async requests() { return { ...w.requests }; },
    async presence(ids) { const o = {}; for (const id of ids) if (w.presence[id]) o[id] = { place: "", pid: "", pl: "", gid: "", ...w.presence[id] }; return o; },
    async userById(id) { return { id, name: "U" + id, isBanned: false }; },
    async lookupNames() { return {}; },
    async findByUsername(n) { return { id: "77", name: n, displayName: n }; },
    async avatars() { return {}; }
  };
  return { w, client };
}
function makeApp(settingsPatch) {
  const dir = tmp();
  const storage = new Storage(dir, { delay: 5 });
  const settings = merge(DEFAULT_SETTINGS, settingsPatch || {});
  const { w, client } = fakeWorld();
  const acc = { id: "10", label: "Moi", name: "moi", displayName: "Moi", status: "ok" };
  const accounts = Object.assign(new EventEmitter(), { active: () => acc, activeId: () => "10", activeClient: () => client, client: () => client });
  const sent = [];
  const notifier = { notify: (e) => sent.push(...e) };
  const monitor = new Monitor({ storage, accounts, notifier, logger, getSettings: () => settings });
  return { monitor, w, sent, storage, settings, accounts, dir };
}

test("monitor : premier passage sans événement, puis détection ajout / retrait / connexion / demande", async () => {
  const { monitor, w, sent } = makeApp({ monitoring: { presenceMode: "all", presenceStats: true } });
  await monitor.checkAll();
  assert.equal(monitor.history.entries.length, 0);
  assert.equal(monitor.snapshot().friends, 2);
  w.friends = { 1: "Alice", 3: "Carl" };                   // Bob retiré, Carl ajouté
  w.presence = { 1: { type: 2, place: "Brookhaven", pid: "5" }, 3: { type: 1 } };
  w.requests = { 9: "Zed" };
  monitor.lastChecked = {};
  await monitor.checkAll();
  const types = monitor.history.entries.map((e) => e.type).sort();
  assert.ok(types.includes("added") && types.includes("removed") && types.includes("ingame") && types.includes("req_in"), types.join());
  assert.ok(sent.length >= 4);
  assert.ok(monitor.history.entries.every((e) => e.acc === "10"));
  assert.equal(monitor.snapshot().requests, 1);
  assert.ok(monitor.friendsView().some((f) => f.name === "Alice" && f.status === "jeu"));
});

test("monitor : pause globale respectée, vérification forcée possible", async () => {
  const { monitor, w, settings } = makeApp();
  settings.monitoring.enabled = false;
  assert.deepEqual(await monitor.checkAll(), { paused: true });
  assert.equal(w.calls, 0);
  await monitor.checkAll({ force: true });
  assert.equal(w.calls, 1);
});

test("monitor : profils suivis (ajout par pseudo, détection de changement)", async () => {
  const { monitor, w, sent } = makeApp({ monitoring: { friends: false, presence: false, requests: false, follows: false } });
  const added = await monitor.addWatched("Batman");
  assert.equal(added.id, "77");
  await monitor.checkAll();
  w.friends = { 1: "Alice", 2: "Bob", 5: "Nouveau" };
  monitor.lastChecked = {};
  await monitor.checkAll();
  assert.ok(monitor.history.entries.some((e) => e.type === "added" && e.target === "77"));
  monitor.updateWatched("77", { paused: true });
  assert.equal(monitor.watched.profiles["77"].paused, true);
  monitor.removeWatched("77");
  assert.equal(Object.keys(monitor.watched.profiles).length, 0);
});

test("monitor : un profil suivi alimente courbe et présence, même réglages globaux coupés et liste d'amis privée", async () => {
  const { monitor, w, accounts, settings } = makeApp({ monitoring: { friends: false, presence: false, requests: false, follows: false, presenceStats: false } });
  const c = accounts.activeClient(), orig = c.friends;
  c.friends = async (id) => { if (id === "77") throw Object.assign(new Error("privé"), { status: 403 }); return orig.call(c); };
  w.presence = { 77: { type: 1 } };
  await monitor.addWatched("Batman", { friends: true, status: true, conn: true });
  await monitor.checkAll();
  const key = "77";
  assert.equal(monitor.stats.series[key].length, 1, "premier point de courbe dès la première vérification");
  assert.equal(monitor.stats.series[key][0].fo, 5);
  assert.equal(monitor.watched.profiles[key].error, "Liste d'amis privée");
  monitor.lastChecked = {}; monitor.stats.pstats.t -= 60000;
  await monitor.checkAll();
  assert.ok(monitor.stats.pstats.d[key], "présence collectée pour la personne suivie");
  // deuxième point au bout de 30 min
  const arr = monitor.stats.series[key]; arr[0].t -= 31 * 60 * 1000; monitor.lastChecked = {};
  await monitor.checkAll();
  assert.equal(monitor.stats.series[key].length, 2);
  // l'option « conn » décochée n'appelle plus les abonnés mais garde la courbe des amis
  monitor.updateWatched(key, { conn: false });
  assert.equal(settings.monitoring.presenceStats, false);
});

test("suivi unique : les anciens 🔔 deviennent des profils suivis complets, le bouton 🔔 passe par le même suivi", async () => {
  const { monitor, settings } = makeApp({ monitoring: { presenceMode: "favorites", favorites: ["1"] } });
  let migrated = 0; monitor.on("favorites-migrated", () => migrated++);
  await monitor.checkAll();
  const w = monitor.watched.profiles["1"];
  assert.ok(w && w.friends && w.status && w.conn, "ami 🔔 migré en profil suivi complet");
  assert.deepEqual(settings.monitoring.favorites, []);
  assert.equal(migrated, 1);
  assert.equal(monitor.friendsView().find((f) => f.id === "1").tracked, true);
  assert.equal(monitor.friendsView().find((f) => f.id === "2").tracked, false);
  assert.ok(monitor.stats.series["1"], "courbe dès la première vérification");
  monitor.lastChecked = {}; monitor.stats.pstats.t -= 60000;
  await monitor.checkAll();
  assert.ok(monitor.stats.pstats.d["1"], "présence collectée");
});

test("monitor : les profils suivis sont étalés (3 par passage, un toutes les 4 min) pour éviter les 429", async () => {
  const { monitor, w } = makeApp({ monitoring: { friends: false, presence: false, requests: false, follows: false } });
  for (const id of ["11", "12", "13", "14", "15"]) await monitor.addWatched(id, { friends: true, status: false, conn: false });
  await monitor.checkAll();
  assert.equal(w.calls, 3, "3 profils au premier passage");
  await monitor.checkAll();
  assert.equal(w.calls, 5, "les 2 autres au passage suivant");
  await monitor.checkAll();
  assert.equal(w.calls, 5, "rien de plus avant 4 min");
});

test("suivre quelqu'un reste possible quand Roblox ralentit (ajout par identifiant, message clair par pseudo)", async () => {
  const { monitor, accounts } = makeApp({ monitoring: { friends: false, presence: false, requests: false, follows: false } });
  const c = accounts.activeClient();
  c.userById = async () => { throw Object.assign(new Error("429"), { status: 429, retryAfter: 120 }); };
  c.findByUsername = async () => { throw Object.assign(new Error("429"), { status: 429, retryAfter: 120 }); };
  const r = await monitor.addWatched("123456");
  assert.equal(r.id, "123456");
  assert.match(monitor.watched.profiles["123456"].name, /^Joueur 123456$/);
  await assert.rejects(() => monitor.addWatched("Batman"), /ralentir : réessaie dans 2 min/);
  // le nom se résout au passage suivant, une fois Roblox revenu
  c.userById = async (id) => ({ id, name: "Vrai" + id, displayName: "Vrai" + id, isBanned: false });
  monitor.lastChecked = {};
  await monitor.checkAll();
  assert.equal(monitor.watched.profiles["123456"].name, "Vrai123456");
});

test("client Roblox : pause par service, espacement renforcé après un 429", async () => {
  const { RobloxClient } = require("../src/main/core/roblox");
  const hdr = (o) => ({ get: (k) => o[k.toLowerCase()] || null });
  const c = new RobloxClient(async (url) => url.includes("friends.") ? { status: 429, ok: false, headers: hdr({ "retry-after": "90" }), json: async () => ({}) } : { status: 200, ok: true, headers: hdr({}), json: async () => ({}) });
  await assert.rejects(() => c.getJson("https://friends.roblox.com/x"), (e) => e.status === 429);
  assert.equal(c.isLimited("friends.roblox.com"), true);
  assert.equal(c.isLimited("users.roblox.com"), false, "un 429 « amis » ne bloque pas « utilisateurs »");
  assert.ok(c.waitSec("friends.roblox.com") > 80 && c.waitSec("users.roblox.com") === 0);
  assert.ok(c.gapMult > 1, "espacement renforcé");
  c.resetBackoff();
});

test("comptes : ajout chiffré, aucun secret exposé à l'interface, actif / défaut / suppression", async () => {
  const storage = new Storage(tmp(), { delay: 5 });
  const jar = {};
  const sessions = {
    async setCookie(id, v) { jar[id] = v; }, async getCookie(id) { return jar[id] || null; }, async clear(id) { delete jar[id]; },
    fetchFor: (id) => async (url) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => (/authenticated/.test(url) ? { id: id === "tmp" ? 0 : (jar[id] || "").includes("AAAA") ? 111 : 222, name: "n" + (jar[id] || "").length, displayName: "D" } : { data: [] }) })
  };
  const am = new AccountManager({ storage, vault: new Vault(fakeSafe), sessions, logger });
  await am.init();
  const a = await am.addFromCookie("Principal", "_|WARNING:AAAA-secret-cookie");
  assert.equal(a.id, "111");
  assert.equal(a.label, "Principal");
  assert.ok(!JSON.stringify(am.list()).includes("secret-cookie"));
  assert.ok(!JSON.stringify(storage.get("accounts")).includes("secret-cookie")); // chiffré sur disque
  assert.ok(am.active().active && am.active().isDefault);
  const b = await am.addFromCookie("Second", "_|WARNING:BBBB");
  assert.equal(am.activeId(), "111");
  am.setActive(b.id);
  assert.equal(am.activeId(), b.id);
  am.rename(b.id, "Autre");
  assert.equal(am.get(b.id).label, "Autre");
  await am.remove(b.id);
  assert.equal(am.activeId(), "111");
  await am.logout("111");
  assert.equal(am.get("111").status, "deconnecte");
  assert.equal(jar["111"], undefined);
});

test("import : sauvegarde de l'ancienne extension (me → compte, nettoyage, fusion sans doublon)", () => {
  const { monitor, storage, settings, accounts } = makeApp();
  const data = new DataTools({ storage, monitor, accounts, getSettings: () => settings, setSettings: () => {}, logger });
  const ext = { app: "roblox-friends-notifier", version: 1, data: {
    userId: 10,
    history: [{ ts: 1, target: "me", targetId: "10", targetName: "Moi", type: "added", friendId: "1", friendName: "Alice" }, { ts: 2, target: "me", type: "bidon", friendId: "1" }],
    watched: { 77: { name: "Batman", friends: { 1: "A" }, paused: false } },
    series: { me: [{ t: 1, f: 2 }] }, counts: { me: { fo: 1, fg: 1 } }, pstats: { t: 0, d: {} } } };
  const r = data.importData(ext, "merge");
  assert.equal(r.history, 1); assert.equal(r.source, "extension");
  assert.equal(monitor.history.entries[0].acc, "10");
  assert.ok(monitor.stats.series["me:10"]);
  assert.equal(monitor.watched.profiles["77"].snapshot["1"], "A");
  data.importData(ext, "merge");
  assert.equal(monitor.history.entries.length, 1);
  assert.throws(() => data.importData({ app: "autre", data: {} }, "merge"));
  const exp = data.exportAll();
  assert.ok(!JSON.stringify(exp).includes("webhooks"));
  assert.match(data.historyCsv(), /Ajout/);
});

test("personnalisation : sauvegarde, application, restauration, réapplication après mise à jour", () => {
  const dir = tmp();
  const make = (ver) => { const d = path.join(dir, "Versions", ver); fs.mkdirSync(path.join(d, "content", "sounds"), { recursive: true }); fs.writeFileSync(path.join(d, "RobloxPlayerBeta.exe"), "x"); fs.writeFileSync(path.join(d, "content", "sounds", "ouch.ogg"), "ORIGINAL"); return d; };
  const v1 = make("version-1");
  const launcher = new RobloxLauncher({ env: { LOCALAPPDATA: dir }, platform: "win32", execFile() {}, openExternal() {}, accounts: {}, monitor: {}, logger });
  launcher.roots = () => [path.join(dir, "Versions")];
  const custom = new Customization({ storage: new Storage(tmp(), { delay: 5 }), launcher, logger, dataDir: tmp() });
  const mine = path.join(tmp(), "mon.ogg"); fs.writeFileSync(mine, "MIEN");
  assert.throws(() => custom.apply("sound", [path.join(dir, "x.mp3")]));
  custom.apply("sound", [mine]);
  assert.equal(fs.readFileSync(path.join(v1, "content/sounds/ouch.ogg"), "utf8"), "MIEN");
  assert.equal(custom.status().items.sound.active, true);
  custom.restore("sound");
  assert.equal(fs.readFileSync(path.join(v1, "content/sounds/ouch.ogg"), "utf8"), "ORIGINAL");
  assert.equal(custom.status().items.sound.active, false);
  custom.apply("sound", [mine]);
  const v2 = make("version-2"); const t = Date.now() / 1000 + 100; fs.utimesSync(v2, t, t); // mise à jour de Roblox
  assert.deepEqual(custom.reapplyIfNeeded(), ["sound"]);
  assert.equal(fs.readFileSync(path.join(v2, "content/sounds/ouch.ogg"), "utf8"), "MIEN");
});

test("maintenance : cache mesuré / nettoyé, intégrité sans faux 100 %", async () => {
  const local = tmp();
  fs.mkdirSync(path.join(local, "Roblox", "logs"), { recursive: true });
  fs.writeFileSync(path.join(local, "Roblox", "logs", "a.log"), "x".repeat(2048));
  const launcher = { processes: async () => [], install: () => null };
  const m = new Maintenance({ env: { LOCALAPPDATA: local }, launcher, accounts: { active: () => null }, logger, getSettings: () => DEFAULT_SETTINGS });
  assert.equal(m.cacheInfo().total, 2048);
  const r = await m.clean(["logs"]);
  assert.equal(r.freed, 2048);
  assert.equal(m.cacheInfo().total, 0);
  const i = await m.integrity(null);
  assert.equal(i.state, "Fichier manquant");
  assert.notEqual(i.percent, 100);
  const busy = new Maintenance({ env: { LOCALAPPDATA: local }, launcher: { processes: async () => [{ pid: 1 }], install: () => null }, accounts: {}, logger, getSettings: () => DEFAULT_SETTINGS });
  await assert.rejects(() => busy.clean(null), /Ferme d'abord Roblox/);
});

test("client Roblox : jeton CSRF renouvelé, pause après un 429", async () => {
  let n = 0;
  const fetchFn = async (url, init) => {
    n++;
    const h = (k) => (k === "x-csrf-token" ? "tok" : null);
    if (n === 1) return { ok: false, status: 403, headers: { get: h } };
    if (url.includes("limit")) return { ok: false, status: 429, headers: { get: () => null } };
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ userPresences: [{ userId: 1, userPresenceType: 2, lastLocation: "Jeu", rootPlaceId: 5, placeId: 6, gameId: "g" }] }) };
  };
  const c = new RobloxClient(fetchFn);
  const p = await c.presence(["1"]);
  assert.equal(p["1"].type, 2); assert.equal(p["1"].gid, "g"); assert.equal(c.csrf, "tok");
  await assert.rejects(() => c.getJson("https://x/limit"), (e) => e.status === 429);
  assert.equal(c.limited, true);
});

test("test de connexion : explique chaque échec en français", async () => {
  const { runDiagnostics, explain } = require("../src/main/core/netdiag");
  assert.match(explain({ status: 401 }), /reconnecte/);
  assert.match(explain(new Error("net::ERR_NAME_NOT_RESOLVED")), /Internet/);
  assert.match(explain(new Error("net::ERR_CERT_AUTHORITY_INVALID")), /certificat/);
  const client = { authenticated: async () => ({ name: "bat" }), friends: async () => ({ 1: "a", 2: "b" }), presence: async () => ({}), authTicket: async () => { throw Object.assign(new Error("x"), { status: 403 }); } };
  const accounts = { active: () => ({ id: "9", label: "Moi" }), client: () => client };
  const getSettings = () => ({ notifications: { discord: { enabled: false, url: "" }, ntfy: { enabled: false } } });
  const r = await runDiagnostics({ accounts, getSettings, fetch: async () => ({ ok: true, status: 200 }) });
  assert.equal(r.find((x) => /ticket/.test(x.label)).ok, false);
  assert.equal(r.find((x) => /liste d'amis/.test(x.label)).detail, "2 ami(s)");
  assert.equal(r.find((x) => x.label === "Discord").ok, null);
});

test("lanceur : rejoindre un ami sans identifiant de serveur utilise RequestFollowUser", () => {
  const u = decodeURIComponent(buildLaunchUri({ ticket: "T", userId: "42", trackerId: "1", now: 1, uuid: "u" }));
  assert.match(u, /request=RequestFollowUser/);
  assert.match(u, /userId=42/);
});

test("Roblox : un 429 ne bloque que le service concerné et respecte Retry-After", async () => {
  const { RobloxClient } = require("../src/main/core/roblox");
  const hdr = (o) => ({ get: (k) => o[k.toLowerCase()] || null });
  const fetchFn = async (url) => url.includes("presence.")
    ? { status: 429, ok: false, headers: hdr({ "retry-after": "120" }), json: async () => ({}) }
    : { status: 200, ok: true, headers: hdr({}), json: async () => ({ data: [] }) };
  const c = new RobloxClient(fetchFn);
  await assert.rejects(() => c.presence(["1"]), (e) => e.status === 429 && e.retryAfter === 120);
  await assert.rejects(() => c.presence(["1"]), (e) => e.status === 429 && e.backoff);          // pause locale, aucune requête
  const j = await c.getJson("https://friends.roblox.com/v1/users/1/friends");                      // autre service : non bloqué
  assert.deepEqual(j, { data: [] });
  c.resetBackoff();
  assert.equal(c.limited, false);
});

test("ticket de lancement : Referer neutre converti par la session, bascule si une méthode échoue", async () => {
  const { RobloxClient } = require("../src/main/core/roblox");
  const ok = (ticket) => ({ status: 200, ok: true, headers: { get: (k) => (k.toLowerCase() === "rbx-authentication-ticket" ? ticket : null) } });
  let seen;
  const failing = async () => { throw new Error("net::ERR_BLOCKED_BY_CLIENT"); };
  const c1 = new RobloxClient(async (u, i) => { seen = i; return ok("T1"); });
  assert.equal(await c1.authTicket("https://www.roblox.com/games/920587237"), "T1");
  assert.equal(seen.headers["X-Batblox-Referer"], "https://www.roblox.com/games/920587237");
  assert.equal(seen.referrer, undefined);
  const c2 = new RobloxClient(failing, failing, async () => ({ status: 200, ticket: "T3", csrf: null }));
  assert.equal(await c2.authTicket(), "T3");
});

test("derniers jeux : sans doublon, le plus récent d'abord, nom mis à jour", () => {
  const { monitor } = makeApp();
  monitor.noteGame("10", { pid: "1", name: "Alpha", ts: 100 });
  monitor.noteGame("10", { pid: "2", name: "Beta", ts: 200 });
  monitor.noteGame("10", { pid: "1", ts: 300 });
  monitor.noteGame("10", { pid: "abc", ts: 400 });   // identifiant invalide : ignoré
  const l = monitor.snapshot().recentGames;
  assert.deepEqual(l.map((g) => g.pid), ["1", "2"]);
  assert.equal(l[0].name, "Alpha");
});

test("lanceur choisi : Bloxstrap démarré avec le lien de lancement, introuvable → erreur claire", async () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, "Bloxstrap"), { recursive: true });
  fs.writeFileSync(path.join(dir, "Bloxstrap", "Bloxstrap.exe"), "x");
  const calls = [];
  const acc = { id: "1", name: "n", status: "ok" };
  const accounts = { active: () => acc, client: () => ({ authTicket: async () => "TICKET" }) };
  const mk = (client) => new RobloxLauncher({ env: { LOCALAPPDATA: dir }, platform: "linux", execFile() {}, openExternal() { throw new Error("ne doit pas servir"); },
    spawn: (exe, args) => { calls.push([exe, args]); return { unref() {}, on() {} }; }, accounts, monitor: {}, logger, getSettings: () => ({ launcher: { client } }) });
  await mk("bloxstrap").launch({ placeId: "920587237" });
  assert.equal(calls.length, 1);
  assert.ok(calls[0][0].endsWith("Bloxstrap.exe"));
  assert.match(calls[0][1][0], /^roblox-player:1\+launchmode:play\+gameinfo:TICKET/);
  await assert.rejects(() => mk("fishstrap").launch({ placeId: "920587237" }), /Fishstrap est introuvable/);
});

test("découverte de jeux : normalisation, repli sur l'ancien format d'URL, jeux incomplets ignorés", async () => {
  const calls = [];
  const fake = async (url) => {
    calls.push(url);
    const ok = (o) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => o });
    if (url.includes("/games/sorts?gameSortsContext")) return { ok: false, status: 400, headers: { get: () => null } };
    if (url.includes("/games/sorts?model.")) return ok({ sorts: [{ token: "T1", name: "Popular", displayName: "Popular" }, { name: "sans-jeton" }] });
    if (url.includes("/games/list?sortToken")) return { ok: false, status: 400, headers: { get: () => null } };
    if (url.includes("/games/list?model.sortToken=T1")) return ok({ games: [{ placeId: 1, universeId: 10, name: "Jeu A", playerCount: 1200, totalUpVotes: 90, totalDownVotes: 10 }, { placeId: 2, name: "Peu de votes", totalUpVotes: 3, totalDownVotes: 0 }, { name: "Sans placeId" }] });
    if (url.includes("/universes/v1/places/5/universe")) return ok({ universeId: 55 });
    if (url.includes("/recommendations/game/55")) return ok({ games: [{ rootPlaceId: 9, universeId: 90, name: "Proche", playerCount: 7 }] });
    throw new Error("URL inattendue " + url);
  };
  const c = new RobloxClient(fake);
  c.nextSlot = 0;
  const sorts = await c.gameSorts();
  assert.deepEqual(sorts.map((s) => s.token), ["T1"]);
  const games = await c.gamesBySort("T1", 5);
  assert.equal(games.length, 2);
  assert.deepEqual([games[0].pid, games[0].players, games[0].likes], ["1", 1200, 90]);
  assert.equal(games[1].likes, null);
  assert.equal(await c.universeOf("5"), "55");
  const sim = await c.similarGames("55");
  assert.deepEqual([sim[0].pid, sim[0].name], ["9", "Proche"]);
});

test("découverte de jeux : nouvelle API explore (sections avec jeux intégrés ou à charger)", async () => {
  const ok = (o) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => o });
  const fake = async (url) => {
    if (url.includes("explore-api/v1/get-sorts")) return ok({ sorts: [
      { sortId: "top-playing", sortDisplayName: "Top Playing", contentType: "Games", games: [{ universeId: 1, rootPlaceId: 11, name: "Inclus", playerCount: 5 }] },
      { sortId: "vide", sortDisplayName: "À charger", contentType: "Games" },
      { sortId: "pub", sortDisplayName: "Pub", contentType: "Ads" }] });
    if (url.includes("get-sort-content") && url.includes("sortId=vide")) return ok({ games: [{ universeId: 2, rootPlaceId: 22, name: "Chargé", playerCount: 9 }] });
    throw new Error("URL inattendue " + url);
  };
  const c = new RobloxClient(fake);
  const sorts = await c.gameSorts();
  assert.deepEqual(sorts.map((x) => x.token), ["top-playing", "vide"]);
  assert.equal((await c.gamesBySort(sorts[0]))[0].pid, "11");
  assert.equal((await c.gamesBySort(sorts[1]))[0].name, "Chargé");
});

test("découverte de jeux : « Tout voir » paginé et recherche", async () => {
  const urls = [];
  const ok = (o) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => o });
  const c = new RobloxClient(async (url) => {
    urls.push(url);
    if (url.includes("get-sort-content")) return ok({ games: [{ rootPlaceId: 7, name: "Page", playerCount: 3 }], nextPageToken: url.includes("pageToken=P2") ? "" : "P2" });
    if (url.includes("omni-search")) return ok({ searchResults: [{ contentGroupType: "Game", contents: [{ contentId: 5, rootPlaceId: 50, name: "Trouvé", playerCount: 12 }, { contentId: 6, name: "sans place" }] }, { contentGroupType: "User", contents: [{ name: "x" }] }], nextPageToken: "S2" });
    throw new Error("inattendu");
  });
  const a = await c.sortContent("top", ""); assert.equal(a.next, "P2");
  const b = await c.sortContent("top", "P2"); assert.equal(b.next, "");
  assert.ok(urls[1].includes("pageToken=P2"));
  const s = await c.searchGames("obby", ""); assert.deepEqual([s.games.length, s.games[0].pid, s.next], [1, "50", "S2"]);
});

test("le son des clics est activé par défaut et reste modifiable", () => {
  assert.equal(DEFAULT_SETTINGS.appearance.clickSound, true);
  const off = merge(DEFAULT_SETTINGS, { appearance: { clickSound: false } });
  assert.equal(off.appearance.clickSound, false);
  assert.equal(off.appearance.theme, "auto");
  assert.equal(merge(DEFAULT_SETTINGS, { appearance: { theme: "bat" } }).appearance.clickSound, true);
});

test("le volume du son des clics a une valeur par défaut discrète", () => {
  assert.equal(DEFAULT_SETTINGS.appearance.clickVolume, 40);
  assert.equal(merge(DEFAULT_SETTINGS, { appearance: { clickVolume: 0 } }).appearance.clickVolume, 0);
});

test("profil : listes d'abonnés / demandes paginées et réponse aux demandes", async () => {
  const urls = [];
  const json = (body) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => body });
  const fetchFn = async (u, init) => {
    urls.push([init && init.method, u]);
    if (u.includes("/followers?")) return json({ data: [{ id: 7, name: "a", displayName: "Alpha", hasVerifiedBadge: true }, { id: 8, name: "b" }], nextPageCursor: "NEXT" });
    if (u.includes("/followings?")) return json({ data: [{ id: 55 }], nextPageCursor: null });
    if (u.endsWith("/v1/users")) return json({ data: [{ id: 55, name: "named", displayName: "Named D" }] });
    if (u.includes("/friends/requests")) return json({ data: [{ id: 9, name: "c", displayName: "Charlie", friendRequest: { sentAt: "2026-01-01T00:00:00Z" }, mutualFriendsList: [1, 2] }], nextPageCursor: null });
    if (u.endsWith("/v1/users/42")) return json({ id: 42, name: "bat", displayName: "Bat", description: "x".repeat(2000), created: "2016-01-01T00:00:00Z", isBanned: false, hasVerifiedBadge: true });
    if (u.includes("/currency")) return json({ robux: 99 });
    if (u.includes("validate-membership")) return json(true);
    return json({});
  };
  const c = new RobloxClient(fetchFn);
  c.nextSlot = 0;
  const f = await c.userPage("followers", "42", "");
  assert.equal(f.items.length, 2);
  assert.deepEqual(f.items[0], { id: "7", name: "a", display: "Alpha", verified: true });
  assert.equal(f.items[1].display, "b");
  assert.equal(f.next, "NEXT");
  await c.userPage("followers", "42", "a b");
  assert.ok(urls.some(([, u]) => u.includes("cursor=a%20b")));
  await assert.rejects(() => c.userPage("friends", "42", ""), /inconnue/);
  const fg = await c.userPage("following", "42", ""); // l'onglet « Abonnements » envoie « following »
  assert.ok(urls.some(([, u]) => u.includes("/users/42/followings?")));
  assert.equal(fg.items.length, 1);
  assert.equal(fg.items[0].name, "named", "noms manquants complétés par identifiant");
  assert.equal(fg.items[0].display, "Named D");
  const r = await c.requestPage("");
  assert.equal(r.items[0].mutual, 2);
  assert.equal(r.items[0].sent, "2026-01-01T00:00:00Z");
  assert.equal(r.next, "");
  const p = await c.profile("42");
  assert.equal(p.displayName, "Bat");
  assert.equal(p.description.length, 1000);
  assert.equal(await c.robux("42"), 99);
  assert.equal(await c.premium("42"), true);
  await c.answerRequest("9", true);
  await c.answerRequest("10", false);
  assert.ok(urls.some(([m, u]) => m === "POST" && u.endsWith("/users/9/accept-friend-request")));
  assert.ok(urls.some(([m, u]) => m === "POST" && u.endsWith("/users/10/decline-friend-request")));
  await assert.rejects(() => c.answerRequest("9/../x", true), /invalide/);
});

test("suivi d'un ami : en mode « tous », on bascule sans perdre les autres amis", () => {
  const { trackPatch } = require("../src/main/core/defaults");
  const all = { presenceMode: "all", favorites: [] };
  const off = trackPatch(all, ["1", "2", "3"], "2", false);
  assert.equal(off.presenceMode, "favorites");
  assert.deepEqual(off.favorites, ["1", "3"]);
  assert.equal(off.converted, true);
  const sel = { presenceMode: "favorites", favorites: ["1"] };
  assert.deepEqual(trackPatch(sel, ["1", "2"], "2", true).favorites, ["1", "2"]);
  assert.equal(trackPatch(sel, ["1", "2"], "2", true).converted, false);
  assert.deepEqual(trackPatch(sel, ["1", "2"], "1", false).favorites, []);
});

// ---------------------------------------------------------------- Deuxième client (sans session) pour les profils suivis
const { makePublicFetch, viaProxy } = require("../src/main/core/publicnet");
const { PROXY_DOMAIN_RE } = require("../src/main/core/defaults");

test("public : jamais de cookie, uniquement des services publics, relais puis repli direct", async () => {
  const seen = [];
  const mk = (proxy, impl) => makePublicFetch({ getProxy: () => proxy, rawFetch: async (url, init) => { seen.push({ url, init }); return impl(url, init); } });
  const ok = { status: 200 };

  // aucun en-tête d'identification, credentials omis
  await mk("", () => ok)("https://friends.roblox.com/v1/users/1/friends", { headers: { Cookie: "x", Authorization: "y", "X-Batblox-Referer": "z", Accept: "application/json" }, credentials: "include" });
  assert.equal(seen[0].init.credentials, "omit");
  assert.deepEqual(Object.keys(seen[0].init.headers), ["Accept"]);

  // liste blanche : pas d'authentification, pas de ticket, pas d'autre site
  await assert.rejects(mk("", () => ok)("https://auth.roblox.com/v1/authentication-ticket", {}));
  await assert.rejects(mk("", () => ok)("https://evil.example/x", {}));
  await assert.rejects(mk("", () => ok)("http://friends.roblox.com/x", {}));

  // relais : réécriture du domaine, et si 5xx ou panne -> repli direct
  assert.equal(viaProxy("https://friends.roblox.com/v1/users/1/friends?a=1", "roproxy.com"), "https://friends.roproxy.com/v1/users/1/friends?a=1");
  seen.length = 0;
  const r = await mk("roproxy.com", (u) => (u.includes("roproxy") ? { status: 503 } : ok))("https://users.roblox.com/v1/users/5", {});
  assert.equal(r.status, 200);
  assert.deepEqual(seen.map((x) => new URL(x.url).hostname), ["users.roproxy.com", "users.roblox.com"]);
  seen.length = 0;
  const r2 = await mk("roproxy.com", (u) => { if (u.includes("roproxy")) throw new Error("réseau"); return ok; })("https://users.roblox.com/v1/users/5", {});
  assert.equal(r2.status, 200);
  // un 429 du relais est transmis tel quel (le client gère sa propre pause)
  const r3 = await mk("roproxy.com", () => ({ status: 429 }))("https://users.roblox.com/v1/users/5", {});
  assert.equal(r3.status, 429);
});

test("public : le domaine du relais est validé (pas d'adresse complète, de port ni de chemin)", () => {
  for (const good of ["roproxy.com", "relais.exemple.fr"]) assert.ok(PROXY_DOMAIN_RE.test(good), good);
  for (const bad of ["", "https://roproxy.com", "roproxy.com/x", "roproxy.com:8080", "localhost", "a b.com", "evil.com@x.com"]) assert.ok(!PROXY_DOMAIN_RE.test(bad), bad);
});

test("monitor : les profils suivis passent par le client public, le compte garde son quota", async () => {
  const { monitor, w, accounts } = makeApp({ monitoring: { friends: false, presence: false, requests: false, follows: false } });
  const auth = accounts.activeClient();
  const calls = { auth: [], pub: [] };
  const wrap = (c, tag) => Object.assign(Object.create(c), {
    friends: async (id) => { calls[tag].push("friends:" + id); return { ...w.friends }; },
    counts: async (id) => { calls[tag].push("counts:" + id); return { fo: 1, fg: 1 }; }
  });
  const pub = wrap(auth, "pub");
  accounts.publicClient = () => pub;
  accounts.client = accounts.activeClient = () => wrap(auth, "auth");
  await monitor.addWatched("Batman", { friends: true, status: false, conn: true });
  calls.auth.length = 0; calls.pub.length = 0; monitor.lastChecked = {};
  await monitor.checkAll();
  assert.ok(calls.pub.includes("friends:77") && calls.pub.includes("counts:77"), "profil suivi lu par le client public : " + calls.pub);
  assert.ok(!calls.auth.some((c) => c.endsWith(":77")), "le compte n'est pas sollicité pour le profil suivi : " + calls.auth);
});

test("public : le client public a sa propre pause (un 429 du compte ne le bloque pas, et inversement)", () => {
  const am = new AccountManager({ storage: new Storage(tmp(), { delay: 5 }), vault: new Vault(fakeSafe), sessions: { fetchFor: () => async () => ({}), publicFetch: () => async () => ({}) }, logger });
  const a = am.client("1"), p = am.publicClient("1");
  assert.notEqual(a, p);
  a._strike("https://friends.roblox.com/x", 60);
  assert.ok(a.isLimited("friends.roblox.com"));
  assert.ok(!p.isLimited("friends.roblox.com"));
  assert.equal(am.publicClient("1"), p, "un seul client public partagé");
});

// ---------------------------------------------------------------- Mise à jour de Roblox depuis le lanceur
const { APP_URI } = require("../src/main/core/launcher");
const GUID_OLD = "version-aaaaaaaaaaaaaaaa", GUID_NEW = "version-bbbbbbbbbbbbbbbb";

function updateRig({ client = "auto", running = [], latest = GUID_NEW, bloxstrap = false } = {}) {
  const dir = tmp();
  const mkv = (root, g) => { const d = path.join(root, g); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, "RobloxPlayerBeta.exe"), "x"); return d; };
  const roots = path.join(dir, "Roblox", "Versions");
  mkv(roots, GUID_OLD);
  if (bloxstrap) { fs.mkdirSync(path.join(dir, "Bloxstrap"), { recursive: true }); fs.writeFileSync(path.join(dir, "Bloxstrap", "Bloxstrap.exe"), "x"); }
  const log = { opened: [], spawned: [], exec: [], procs: running.slice() };
  const execFile = (cmd, args, o, cb) => {
    log.exec.push([cmd, ...args]);
    if (cmd === "tasklist") return cb(null, log.procs.map((pid) => `"RobloxPlayerBeta.exe","${pid}","Console","1","50,000 K"`).join("\n"));
    if (cmd === "taskkill") log.procs.length = 0;
    cb(null, "");
  };
  let calls = 0;
  const accounts = { publicClient: () => ({ clientVersion: async () => { calls++; return { guid: latest, version: "0.700.0.1" }; } }) };
  const l = new RobloxLauncher({ env: { LOCALAPPDATA: dir }, platform: "win32", execFile, openExternal: async (u) => { log.opened.push(u); }, accounts, monitor: {}, logger,
    spawn: (exe, args) => { log.spawned.push([exe, args]); return { unref() {}, on() {} }; }, getSettings: () => ({ launcher: { client } }) });
  l.roots = () => [roots];
  return { l, dir, roots, mkv, log, calls: () => calls };
}

test("mise à jour : détecte une version plus ancienne, puis à jour quand le dossier de la dernière version existe", async () => {
  const { l, roots, mkv } = updateRig();
  let u = await l.updateCheck(true);
  assert.equal(u.upToDate, false);
  assert.deepEqual([u.installed.guid, u.latest.guid, u.latest.version], [GUID_OLD, GUID_NEW, "0.700.0.1"]);
  mkv(roots, GUID_NEW);
  u = await l.updateCheck();
  assert.equal(u.upToDate, true);
  assert.equal((await new RobloxLauncher({ env: {}, platform: "linux", execFile() {}, openExternal() {}, accounts: {}, monitor: {}, logger }).updateCheck()).supported, false);
});

test("mise à jour : la dernière version est mémorisée (pas de requête à chaque vérification)", async () => {
  const { l, calls } = updateRig();
  await l.updateCheck(); await l.updateCheck(); await l.updateCheck();
  assert.equal(calls(), 1);
  await l.updateCheck(true);
  assert.equal(calls(), 2);
});

test("mise à jour : lance le lien officiel, refuse si Roblox est ouvert, le ferme sur demande", async () => {
  const a = updateRig({ running: [4242] });
  await assert.rejects(() => a.l.update(), /ferme-le avant/);
  assert.equal(a.log.opened.length, 0);
  const r = await a.l.update({ closeFirst: true });
  assert.ok(r.started);
  assert.ok(a.log.exec.some((c) => c[0] === "taskkill" && c.includes("4242") && !c.includes("/F")), "fermeture douce, jamais forcée");
  assert.deepEqual(a.log.opened, [APP_URI]);
  assert.equal(APP_URI, "roblox-player:1+launchmode:app");
  await assert.rejects(() => a.l.update(), /déjà en cours/);

  const b = updateRig({ latest: GUID_OLD }); // déjà à jour : on ne lance rien
  const rb = await b.l.update();
  assert.ok(rb.already);
  assert.equal(b.log.opened.length + b.log.spawned.length, 0);
});

test("mise à jour : avec un lanceur alternatif, c'est lui qui est démarré (il met Roblox à jour) ; introuvable = erreur claire", async () => {
  const a = updateRig({ client: "bloxstrap", bloxstrap: true });
  await a.l.update();
  assert.equal(a.log.opened.length, 0);
  assert.ok(a.log.spawned[0][0].endsWith("Bloxstrap.exe"));
  assert.deepEqual(a.log.spawned[0][1], [APP_URI]);
  const b = updateRig({ client: "fishstrap" });
  await assert.rejects(() => b.l.update(), /Fishstrap est introuvable/);
  assert.equal(b.l._updating, null, "aucune mise à jour « en cours » après un échec");
});

test("mise à jour : fin confirmée seulement quand Roblox s'ouvre (ou après 20 s), pas dès que le dossier apparaît", async () => {
  const a = updateRig();
  await a.l.update();
  a.mkv(a.roots, GUID_NEW); // le dossier apparaît pendant l'installation
  let u = await a.l.updateCheck();
  assert.equal(u.upToDate, false);
  assert.ok(u.finishing && u.updating);
  a.log.procs.push(777); // Roblox s'ouvre : installation terminée
  u = await a.l.updateCheck();
  assert.equal(u.upToDate, true);
  assert.equal(u.updating, false);
  assert.equal(a.l._updating, null);
});

test("mise à jour : réponse de version invalide refusée ; échec réseau = message clair, pas de plantage", async () => {
  const bad = async (o) => new RobloxClient(async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => o }));
  await assert.rejects(async () => (await bad({ clientVersionUpload: "../../x" })).clientVersion(), /inattendue/);
  const good = await (await bad({ clientVersionUpload: GUID_NEW, version: "0.1.2.3" })).clientVersion();
  assert.deepEqual(good, { guid: GUID_NEW, version: "0.1.2.3" });
  await assert.rejects(async () => (await bad({})).clientVersion("../x"), /invalide/);
  const { l } = updateRig();
  l.accounts = { publicClient: () => ({ clientVersion: async () => { const e = new Error("x"); e.status = 429; throw e; } }) };
  const u = await l.updateCheck(true);
  assert.equal(u.latest, null);
  assert.match(u.error, /limite les demandes/);
  await assert.rejects(() => l.update(), /limite les demandes/);
});

test("public : le service des versions est autorisé sans cookie", async () => {
  let seen;
  const f = makePublicFetch({ getProxy: () => "", rawFetch: async (url, init) => { seen = { url, init }; return { status: 200 }; } });
  await f("https://clientsettings.roblox.com/v2/client-version/WindowsPlayer", { headers: { Cookie: "x" } });
  assert.equal(seen.init.credentials, "omit");
  assert.ok(!("Cookie" in seen.init.headers));
});

// ---------- Discord Rich Presence ----------
const { RichPresence, explain: explainRpc } = require("../src/main/core/rpc");

function rpcRig({ failFirst = 0, closeCode = null, hang = false } = {}) {
  let attempts = 0;
  const calls = [];
  class FakeClient extends EventEmitter {
    constructor() { super(); this.transport = new EventEmitter(); }
    async login() {
      attempts++;
      if (attempts <= failFirst) {
        if (closeCode) { this.transport.emit("close", { code: closeCode, message: "Invalid Client ID" }); throw new Error("connection closed"); }
        throw new Error("Could not connect");
      }
      setImmediate(() => this.emit("ready"));
      return this;
    }
    setActivity(a) { calls.push(a); return hang ? new Promise(() => {}) : Promise.resolve(); }
    clearActivity() { return hang ? new Promise(() => {}) : Promise.resolve(); }
    destroy() { return hang ? new Promise(() => {}) : Promise.resolve(); }
  }
  const S = { discordRpc: { enabled: true, clientId: "123456789012345678" } };
  const r = new RichPresence({ retryMs: 30, getSettings: () => S, launcher: { processes: async () => [{ pid: 1 }] },
    monitor: { snapshot: () => ({ me: { status: "jeu", place: "Adopt Me" } }) }, accounts: {}, logger: { info() {}, warn() {} }, load: () => ({ Client: FakeClient }) });
  return { r, S, calls, attempts: () => attempts };
}
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));

test("rpc : se connecte et affiche le jeu en cours", async () => {
  const { r, calls } = rpcRig();
  const st = await r.sync(); await wait(20);
  assert.equal(st.error, null);
  assert.equal(r.state().ready, true);
  assert.equal(calls[0].details, "Joue à Adopt Me");
  await r.disable();
});

test("rpc : Discord lancé après Batblox → reconnexion automatique", async () => {
  const { r, attempts } = rpcRig({ failFirst: 2 });
  const st = await r.sync();
  assert.match(st.error, /Discord est introuvable/);
  await wait(250);
  assert.equal(r.state().ready, true);
  assert.equal(r.state().error, null);
  assert.ok(attempts() >= 3);
  await r.disable();
});

test("rpc : mauvais identifiant → message précis, pas de boucle de tentatives", async () => {
  const { r, attempts } = rpcRig({ failFirst: 99, closeCode: 4000 });
  const st = await r.sync();
  assert.match(st.error, /refuse cet identifiant/);
  await wait(150);
  assert.equal(attempts(), 1);
  await r.disable();
});

test("rpc : identifiant vide ou non numérique expliqué sans se connecter", async () => {
  const { r, S, attempts } = rpcRig();
  S.discordRpc.clientId = "";
  assert.match((await r.sync()).error, /Colle l'identifiant/);
  S.discordRpc.clientId = "abc";
  assert.match((await r.sync()).error, /Identifiant invalide/);
  assert.equal(attempts(), 0);
});

test("rpc : désactiver ne bloque jamais, même si Discord ne répond plus", async () => {
  const { r } = rpcRig({ hang: true });
  await r.sync(); await wait(20);
  const t = Date.now();
  await r.disable();
  assert.ok(Date.now() - t < 4000);
  assert.equal(r.state().active, false);
});

test("rpc : explain distingue Discord fermé, délai dépassé et identifiant refusé", () => {
  assert.equal(explainRpc(new Error("Could not connect")).retry, true);
  assert.match(explainRpc(new Error("RPC_CONNECTION_TIMEOUT")).text, /ne répond pas/);
  assert.equal(explainRpc(new Error("connection closed"), { code: 4000 }).retry, false);
});

// ---------------------------------------------------------------- Exécuteur
const exeRig = (dir = tmp(), over = {}) => {
  const opened = [];
  const st = new Storage(dir, { delay: 5 });
  const ex = new Executor({ storage: st, logger, exists: () => true, openPath: async (p) => { opened.push(p); return over.err || ""; }, ...over.opts });
  return { ex, st, dir, opened };
};

test("exécuteur : vide par défaut, rien n'est ajouté par Batblox", async () => {
  const { ex } = exeRig();
  assert.deepEqual(await ex.list(), []);
});

test("exécuteur : n'accepte que des chemins absolus Windows vers .exe/.lnk/.bat/.cmd", () => {
  assert.equal(validPath("C:\\Windows\\System32\\calc.exe"), true);
  assert.equal(validPath("D:\\Mes outils\\Notes.LNK"), true);
  assert.equal(validPath("\\\\serveur\\partage\\outil.cmd"), true);
  for (const bad of ["calc.exe", "C:\\docs\\lettre.docx", "C:\\x\\..\\y.exe", "https://exemple.com/a.exe", "", null, "C:\\a.exe\0.txt", "C:\\dossier\\"]) assert.equal(validPath(bad), false, String(bad));
});

test("exécuteur : ajout, nom par défaut, doublons et fichiers refusés expliqués", async () => {
  const { ex } = exeRig();
  const r = ex.add(["C:\\Windows\\System32\\calc.exe", "c:\\windows\\system32\\CALC.EXE", "C:\\a\\notes.txt"]);
  assert.equal(r.added.length, 1);
  assert.equal(r.skipped.length, 2);
  assert.match(r.skipped[0], /déjà/);
  assert.match(r.skipped[1], /seuls les programmes/);
  const l = await ex.list();
  assert.equal(l.length, 1);
  assert.equal(l[0].name, "calc");
  assert.equal(l[0].found, true);
});

test("exécuteur : lancement par identifiant, jamais par chemin venu de l'interface", async () => {
  const { ex, opened } = exeRig();
  const id = ex.add(["C:\\Outils\\bloc.exe"]).added[0];
  assert.equal(await ex.launch(id), "bloc");
  assert.deepEqual(opened, ["C:\\Outils\\bloc.exe"]);
  await assert.rejects(() => ex.launch("C:\\Windows\\System32\\cmd.exe"), /plus dans la liste/);
  assert.equal(opened.length, 1);
});

test("exécuteur : fichier disparu ou refus de Windows = message clair", async () => {
  const gone = exeRig(tmp(), { opts: { exists: () => false } });
  const id = gone.ex.add(["C:\\Outils\\perdu.exe"]).added[0];
  await assert.rejects(() => gone.ex.launch(id), /introuvable/);
  assert.equal((await gone.ex.list())[0].found, false);
  const bad = exeRig(tmp(), { err: "Accès refusé" });
  const id2 = bad.ex.add(["C:\\Outils\\x.exe"]).added[0];
  await assert.rejects(() => bad.ex.launch(id2), /Impossible de lancer « x » : Accès refusé/);
});

test("exécuteur : renommer, déplacer, retirer, et la liste survit au redémarrage", async () => {
  const { ex, st, dir } = exeRig();
  const [a, b, c] = ex.add(["C:\\a.exe", "C:\\b.exe", "C:\\c.exe"]).added;
  assert.equal(ex.rename(b, "  Mon B  "), "Mon B");
  assert.equal(ex.rename(a, "   "), "a");
  ex.move(c, -1); ex.move(c, -1); ex.move(c, -1);
  assert.deepEqual((await ex.list()).map((i) => i.name), ["c", "a", "Mon B"]);
  ex.remove(a);
  st.flush();
  const again = new Executor({ storage: new Storage(dir), logger, exists: () => true, openPath: async () => "" });
  assert.deepEqual((await again.list()).map((i) => i.name), ["c", "Mon B"]);
  assert.throws(() => again.remove(a), /plus dans la liste/);
});

test("exécuteur : un fichier de données abîmé ou trafiqué est nettoyé, la limite est respectée", async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, "executor.json"), JSON.stringify({ items: [{ id: "x", name: "ok", path: "C:\\ok.exe" }, { path: "javascript:alert(1)" }, null, { path: "C:\\ok.exe" }] }));
  const ex = new Executor({ storage: new Storage(dir), logger, exists: () => true, openPath: async () => "" });
  const l = await ex.list();
  assert.equal(l.length, 1);
  assert.match(l[0].id, /^[a-f0-9]{16}$/);
  const many = ex.add(Array.from({ length: 150 }, (_, i) => `C:\\p\\app${i}.exe`));
  assert.equal((await ex.list()).length, 100);
  assert.match(many.skipped.join(" "), /Limite de 100/);
});

test("chat Roblox : conversations, messages et envoi (formes d'URL, normalisation, CSRF)", async () => {
  const calls = [];
  const json = (body) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => body });
  let first = true;
  const fetchFn = async (u, init) => {
    calls.push([init && init.method, u, init && init.body]);
    if (u.endsWith("/get-conversation-metadata")) return json({ global_unread_count: 3, global_unread_message_count: 5 });
    if (u.includes("/get-user-conversations")) return json({ next_cursor: "NXT", conversations: [
      { id: "10", type: "one_to_one", name: "", is_default_name: true, participant_user_ids: [42, 7], user_data: { "7": { name: "alice", display_name: "Alice", is_verified: true }, "42": { name: "moi", display_name: "Moi" } },
        unread_message_count: 2, updated_at: "2026-10-05T10:00:00Z", preview_message: { content: "salut", sender_user_id: 7, created_at: "2026-10-05T10:00:00Z" } },
      { id: "11", type: "group", name: "Les amis", is_default_name: false, participant_user_ids: [42, 7, 8], user_data: {}, unread_message_count: 0, updated_at: "2026-10-06T10:00:00Z", preview_message: { content: "ok", sender_user_id: 42, created_at: "2026-10-06T10:00:00Z" } },
      { type: "group" }
    ] });
    if (u.includes("/get-conversation-messages")) return json({ next_cursor: "OLD", messages: [
      { id: "b", content: "deux", sender_user_id: 42, created_at: "2026-10-05T10:01:00Z" },
      { id: "a", content: "un", sender_user_id: 7, created_at: "2026-10-05T10:00:00Z" },
      { id: "c", content: "secret", sender_user_id: 7, is_deleted: true, created_at: "2026-10-05T10:02:00Z" }
    ] });
    if (u.endsWith("/send-messages")) {
      if (first) { first = false; return { ok: false, status: 403, headers: { get: (k) => (k === "x-csrf-token" ? "tok" : null) } }; }
      return json({ messages: [{ id: "d", content: JSON.parse(init.body).messages[0].content, sender_user_id: 42, created_at: "2026-10-05T10:03:00Z" }] });
    }
    return json({ results: [] });
  };
  const c = new RobloxClient(fetchFn);
  c.slots = new Map(); c.nextSlot = 0;
  assert.equal(await c.chatUnread(), 3);
  const l = await c.chatConversations("42", "");
  assert.equal(l.items.length, 2);
  assert.equal(l.next, "NXT");
  assert.equal(l.items[0].title, "Les amis");               // la plus récente d'abord, groupe nommé
  assert.equal(l.items[0].previewMine, true);
  assert.equal(l.items[1].title, "Alice");                  // conversation privée : nom de l'autre personne
  assert.equal(l.items[1].other, "7"); assert.equal(l.items[1].unread, 2); assert.equal(l.items[1].previewMine, false);
  const m = await c.chatMessages("42", "10", "");
  assert.deepEqual(m.items.map((x) => x.id), ["a", "b", "c"]); // ordre chronologique
  assert.equal(m.items[1].mine, true); assert.equal(m.items[2].deleted, true); assert.equal(m.items[2].text, "");
  assert.equal(m.next, "OLD");
  assert.ok(calls.some(([, u]) => u.includes("conversation_id=10") && u.includes("pageSize=30")));
  const s = await c.chatSend("42", "10", "  coucou  ");
  assert.equal(s.items[0].text, "coucou"); assert.equal(c.csrf, "tok");
  const sent = calls.filter(([, u]) => u.endsWith("/send-messages")).pop();
  assert.deepEqual(JSON.parse(sent[2]), { conversation_id: "10", messages: [{ content: "coucou" }] });
  await assert.rejects(() => c.chatSend("42", "10", "   "), /vide/);
  await assert.rejects(() => c.chatSend("42", "10", "x".repeat(501)), /trop long/);
  await assert.rejects(() => c.chatMessages("42", "../evil", ""), /invalide/);
  await c.chatMarkRead("10");
  const mark = calls.filter(([, u]) => u.endsWith("/mark-conversations")).pop();
  assert.deepEqual(JSON.parse(mark[2]), { conversation_ids: ["10"] });
});

// ---------------------------------------------------------------- Mise à jour GitHub
const { Updater, parseVersion, compareVersions, pickInstaller } = require("../src/main/core/updater");
const crypto = require("crypto");

test("mise à jour : comparaison des versions", () => {
  assert.deepEqual(parseVersion("v1.5.0"), [1, 5, 0]);
  assert.equal(compareVersions("v1.5.1", "1.5.0"), 1);
  assert.equal(compareVersions("1.5.0", "v1.5.0"), 0);
  assert.equal(compareVersions("1.10.0", "1.9.9"), 1);
  assert.equal(compareVersions("1.4.9", "1.5.0"), -1);
  assert.equal(compareVersions("n'importe quoi", "1.5.0"), null);
});

test("mise à jour : seul l'installeur du dépôt officiel est choisi (jamais le portable)", () => {
  const base = "https://github.com/BatStream-off/Batblox/releases/download/v1.6.0/";
  const a = pickInstaller([{ name: "Batblox-Portable-1.6.0.exe", browser_download_url: base + "p.exe" }, { name: "Batblox-Setup-1.6.0.exe.blockmap", browser_download_url: base + "b" }, { name: "Batblox-Setup-1.6.0.exe", browser_download_url: base + "s.exe" }]);
  assert.equal(a.name, "Batblox-Setup-1.6.0.exe");
  assert.equal(pickInstaller([{ name: "Batblox-Setup.exe", browser_download_url: "https://evil.example/Batblox-Setup.exe" }]), null);
  assert.equal(pickInstaller(null), null);
});

function makeUpdater(release, over = {}) {
  const dir = tmp(), launched = [], pages = [];
  const u = new Updater(Object.assign({
    currentVersion: "1.5.0", windows: true, portable: false, dir, logger,
    getJson: async () => { if (release instanceof Error) throw release; return release; },
    download: async (url, dest) => { fs.writeFileSync(dest, "contenu-installeur"); return { bytes: 18 }; },
    launch: async (f) => { launched.push(f); }, openPage: (p) => pages.push(p)
  }, over));
  return { u, launched, pages };
}
const REL = (tag, extra = {}) => ({ tag_name: tag, html_url: "https://github.com/BatStream-off/Batblox/releases/tag/" + tag, body: "## Nouveautés\n- **Correctifs**", assets: [Object.assign({ name: "Batblox-Setup-9.exe", size: 18, browser_download_url: "https://github.com/BatStream-off/Batblox/releases/download/" + tag + "/Batblox-Setup-9.exe" }, extra)] });

test("mise à jour : détecte une version plus récente, ignore une version égale ou plus ancienne", async () => {
  assert.equal((await makeUpdater(REL("v1.6.0")).u.check()).available, true);
  assert.equal((await makeUpdater(REL("v1.5.0")).u.check()).available, false);
  assert.equal((await makeUpdater(REL("v1.4.0")).u.check()).available, false);
  const st = await makeUpdater(REL("v1.6.0")).u.check();
  assert.equal(st.latest.version, "1.6.0");
  assert.ok(!/[#*]/.test(st.latest.notes));
});

test("mise à jour : erreurs GitHub expliquées sans planter", async () => {
  const e404 = Object.assign(new Error("x"), { status: 404 }), e403 = Object.assign(new Error("x"), { status: 403 });
  assert.match((await makeUpdater(e404).u.check()).error, /Aucune version publiée/);
  assert.match((await makeUpdater(e403).u.check()).error, /limite/);
  assert.match((await makeUpdater({ tag_name: "bizarre" }).u.check()).error, /inattendu/);
  assert.match((await makeUpdater({ tag_name: "v2.0.0", prerelease: true }).u.check()).error, /Aucune version/);
});

test("mise à jour : télécharge, vérifie l'empreinte SHA-256 puis lance l'installeur", async () => {
  const digest = "sha256:" + crypto.createHash("sha256").update("contenu-installeur").digest("hex");
  const ok = makeUpdater(REL("v1.6.0", { digest }));
  const r = await ok.u.install();
  assert.equal(r.launched, true);
  assert.equal(ok.launched.length, 1);
  assert.ok(fs.existsSync(ok.launched[0]));
  const bad = makeUpdater(REL("v1.6.0", { digest: "sha256:" + "0".repeat(64) }));
  await assert.rejects(() => bad.u.install(), /empreinte/);
  assert.equal(bad.launched.length, 0);
  const short = makeUpdater(REL("v1.6.0", { size: 999 }));
  await assert.rejects(() => short.u.install(), /incomplet/);
  assert.equal(short.u.state().busy, false);
});

test("mise à jour : version portable → page de la release, rien n'est lancé ; déjà à jour → rien à faire", async () => {
  const p = makeUpdater(REL("v1.6.0"), { portable: true });
  const r = await p.u.install();
  assert.equal(r.manual, true);
  assert.equal(p.pages.length, 1);
  assert.equal(p.launched.length, 0);
  assert.equal((await makeUpdater(REL("v1.5.0")).u.install()).already, true);
});

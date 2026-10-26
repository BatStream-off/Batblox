"use strict";
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");
const crypto = require("crypto");
const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, dialog, shell, session, safeStorage, nativeImage, nativeTheme, net, clipboard } = require("electron");

const { Storage } = require("./core/storage");
const { DEFAULT_SETTINGS, merge, DISCORD_RE, NTFY_TOPIC_RE, PROXY_DOMAIN_RE, trackPatch, START_PAGES, ACCENTS } = require("./core/defaults");
const { makePublicFetch } = require("./core/publicnet");
const { Vault, scrub } = require("./core/security");
const { Logger } = require("./core/logger");
const { AccountManager } = require("./core/accounts");
const { Notifier } = require("./core/notifier");
const { Monitor } = require("./core/monitoring");
const { RobloxLauncher, CLIENT_IDS } = require("./core/launcher");
const { Maintenance } = require("./core/maintenance");
const { Customization } = require("./core/customization");
const { DataTools } = require("./core/datatools");
const { RichPresence } = require("./core/rpc");
const { runDiagnostics } = require("./core/netdiag");
const { Executor } = require("./core/executor");
const { Updater } = require("./core/updater");
const { PlayTime } = require("./core/playtime");
const { Scheduler } = require("./core/scheduler");
const { People } = require("./core/people");
const { Cache } = require("./core/cache");
const { makeTranslator } = require("../renderer/i18n-core");
const trEN = makeTranslator(require("../renderer/i18n-en"));
// Textes affichés par le processus principal (notifications Windows, zone de notification, boîtes de dialogue) dans la langue choisie.
const T = (s) => (settings && settings.appearance && settings.appearance.lang === "en" ? trEN(s) : s);
const { buildRecap, monthsWithData, recapText, recapCsv } = require("./core/recap");
const os = require("os");

const APP_ID = "app.batblox.desktop";
const ROOT_URL = "https://www.roblox.com";
const ICON = path.join(__dirname, "..", "assets", "icon.png");
const INDEX = path.join(__dirname, "..", "renderer", "index.html");

app.setAppUserModelId(APP_ID);
if (!app.requestSingleInstanceLock()) { app.quit(); }

let win = null, mini = null, tray = null, quitting = false;
let storage, logger, settings, accounts, notifier, monitor, launcher, maintenance, custom, data, rpc, vault, executor, updater, playtime, scheduler, people, cache;

// ---------------------------------------------------------------- Réglages
function getSettings() { return settings; }
function setSettings(next) { settings = merge(DEFAULT_SETTINGS, next); storage.set("settings", settings); }
function sanitize(next) {
  const s = merge(DEFAULT_SETTINGS, next);
  s.monitoring.intervalSec = Math.min(3600, Math.max(15, Math.round(Number(s.monitoring.intervalSec) || 60)));
  s.monitoring.idleDays = Math.min(365, Math.max(1, Math.round(Number(s.monitoring.idleDays) || 30)));
  if (!["auto", "light", "dark", "bat", "joker", "batman", "inde"].includes(s.appearance.theme)) s.appearance.theme = "auto";
  s.appearance.clickSound = s.appearance.clickSound !== false;
  s.appearance.lightning = s.appearance.lightning !== false;
  s.appearance.clickVolume = Math.min(100, Math.max(0, Math.round(Number(s.appearance.clickVolume)))) || (Number(s.appearance.clickVolume) === 0 ? 0 : 40);
  if (!["favorites", "all"].includes(s.monitoring.presenceMode)) s.monitoring.presenceMode = "favorites";
  s.notifications.discord.url = String(s.notifications.discord.url || "").trim().replace(/[?#].*$/, "").replace(/\/+$/, "");
  if (s.notifications.discord.url && !DISCORD_RE.test(s.notifications.discord.url)) s.notifications.discord.url = "";
  if (s.notifications.ntfy.topic && !NTFY_TOPIC_RE.test(s.notifications.ntfy.topic)) s.notifications.ntfy.topic = "";
  s.notifications.ntfy.server = /^https:\/\//i.test(s.notifications.ntfy.server) ? s.notifications.ntfy.server : "https://ntfy.sh";
  s.maintenance.autoCleanMb = Math.min(20000, Math.max(50, Math.round(Number(s.maintenance.autoCleanMb) || 500)));
  s.monitoring.favorites = [...new Set((s.monitoring.favorites || []).map(String).filter((x) => /^\d+$/.test(x)))];
  s.monitoring.gameOnly = [...new Set((s.monitoring.gameOnly || []).map(String).filter((x) => /^\d+$/.test(x)))];
  s.network.publicProxy = PROXY_DOMAIN_RE.test(String(s.network.publicProxy || "").trim()) ? String(s.network.publicProxy).trim().toLowerCase() : "";
  s.updates.checkOnStart = s.updates.checkOnStart !== false;
  if (!CLIENT_IDS.includes(s.launcher.client)) s.launcher.client = "auto";
  s.launcher.customExe = /^[A-Za-z]:\\[^\0]{1,250}\.exe$/i.test(String(s.launcher.customExe || "")) ? String(s.launcher.customExe) : "";
  // v1.6.0 : options d'affichage, notifications, temps de jeu, sauvegarde
  s.appearance.intro = s.appearance.intro !== false;
  s.appearance.zoom = Math.min(130, Math.max(80, Math.round((Number(s.appearance.zoom) || 100) / 10) * 10));
  if (!START_PAGES.includes(s.appearance.startPage)) s.appearance.startPage = "home";
  if (!ACCENTS.includes(s.appearance.accent)) s.appearance.accent = "bleu";
  s.notifications.quietInGame = !!s.notifications.quietInGame;
  s.notifications.groupConnOnly = !!s.notifications.groupConnOnly;
  s.appearance.streamer = !!s.appearance.streamer;
  if (!["fr", "en"].includes(s.appearance.lang)) s.appearance.lang = "fr";
  s.system.miniOnTop = s.system.miniOnTop !== false;
  s.ui.seenVersion = /^\d+\.\d+\.\d+$/.test(String(s.ui.seenVersion || "")) ? String(s.ui.seenVersion) : "";
  s.ui.onboarded = !!s.ui.onboarded;
  { const seen = new Set(); // sans doublon, majuscules ignorées
    s.notifications.gameAlerts = (Array.isArray(s.notifications.gameAlerts) ? s.notifications.gameAlerts : [])
      .map((x) => String(x == null ? "" : x).replace(/[\u0000-\u001f]/g, "").trim().slice(0, 60))
      .filter((x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase())).slice(0, 30); }
  s.notifications.digest.enabled = !!s.notifications.digest.enabled;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(s.notifications.digest.time || ""))) s.notifications.digest.time = "21:00";
  s.playtime.dailyLimitMin = Math.min(1440, Math.max(0, Math.round(Number(s.playtime.dailyLimitMin) || 0)));
  s.backup.enabled = !!s.backup.enabled;
  s.backup.dir = /^(?:[A-Za-z]:\\|\\\\|\/)[^\0]{0,400}$/.test(String(s.backup.dir || "")) ? String(s.backup.dir) : "";
  s.backup.keep = Math.min(52, Math.max(1, Math.round(Number(s.backup.keep) || 8)));
  s.launcher.favorites = (s.launcher.favorites || []).filter((f) => f && /^\d{1,19}$/.test(String(f.placeId))).slice(0, 50).map((f) => ({ placeId: String(f.placeId), name: String(f.name || f.placeId).slice(0, 60) }));
  return s;
}

// ---------------------------------------------------------------- Sessions Roblox (une par compte, en mémoire)
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const NET_TIMEOUT = 20000; // sans délai maximal, une connexion bloquée laisserait « Vérification… » tourner indéfiniment
const withTimeout = (init) => Object.assign({}, init, { signal: (init && init.signal) || AbortSignal.timeout(NET_TIMEOUT) });
const uaSet = new Set();
const sessionFor = (id) => { // sans « persist: » : rien n'est écrit en clair sur le disque
  const s = session.fromPartition("batblox-acc-" + id);
  if (!uaSet.has(id)) {
    uaSet.add(id);
    try { s.setUserAgent(UA); } catch (_) {}
    // Chromium refuse de fixer Referer/Origin depuis le processus principal : on les ajoute ici, juste avant l'envoi.
    try {
      s.webRequest.onBeforeSendHeaders({ urls: ["https://auth.roblox.com/*"] }, (details, cb) => {
        const hd = details.requestHeaders;
        for (const k of Object.keys(hd)) if (k.toLowerCase() === "x-batblox-referer") { hd.Referer = hd[k]; hd.Origin = "https://www.roblox.com"; delete hd[k]; }
        cb({ requestHeaders: hd });
      });
    } catch (_) {}
  }
  return s;
};
const sessions = {
  async setCookie(id, value) {
    await sessionFor(id).cookies.set({ url: ROOT_URL, name: ".ROBLOSECURITY", value, domain: ".roblox.com", path: "/", secure: true, httpOnly: true, expirationDate: Math.floor(Date.now() / 1000) + 31536000 });
  },
  async getCookie(id) {
    const list = await sessionFor(id).cookies.get({ name: ".ROBLOSECURITY" });
    const c = list.find((x) => /roblox\.com$/.test(x.domain)) || list[0];
    return c ? c.value : null;
  },
  async clear(id) {
    const ses = sessionFor(id);
    try { for (const c of await ses.cookies.get({})) await ses.cookies.remove(ROOT_URL, c.name); } catch (_) {}
    try { await ses.clearStorageData(); } catch (_) {}
  },
  fetchFor(id) { return (url, init) => sessionFor(id).fetch(url, withTimeout(init)); },
  // Deuxième client : session anonyme (aucun cookie, jamais) pour les données publiques des profils suivis.
  publicFetch() {
    const anon = session.fromPartition("batblox-public");
    try { anon.setUserAgent(UA); } catch (_) {}
    return makePublicFetch({ rawFetch: (url, init) => anon.fetch(url, withTimeout(init)), getProxy: () => (settings && settings.network && settings.network.publicProxy) || "" });
  },
  // Repli : exécute la demande de ticket depuis une page roblox.com cachée (même origine que le site).
  pageFor(id) {
    return async ({ url }) => {
      const w = new BrowserWindow({ show: false, width: 400, height: 300, webPreferences: { session: sessionFor(id), sandbox: true, contextIsolation: true, nodeIntegration: false } });
      try {
        try { await w.loadURL("https://www.roblox.com/robots.txt"); } catch (e) { return { error: "page roblox.com non chargée : " + e.message }; }
        return await w.webContents.executeJavaScript(`(async () => {
          try {
            const call = async (csrf) => { const r = await fetch(${JSON.stringify(url)}, { method: "POST", credentials: "include", headers: Object.assign({ "Content-Type": "application/json" }, csrf ? { "X-CSRF-TOKEN": csrf } : {}), body: "{}" });
              return { status: r.status, csrf: r.headers.get("x-csrf-token"), ticket: r.headers.get("rbx-authentication-ticket"), retry: r.headers.get("retry-after") }; };
            let r = await call(null); if (r.status === 403 && r.csrf) r = await call(r.csrf); return r;
          } catch (e) { return { error: "fetch depuis " + location.origin + " : " + e.message }; }
        })()`);
      } finally { if (!w.isDestroyed()) w.destroy(); }
    };
  },
  rawFor(id) {
    return ({ url, method, headers, body }) => new Promise((resolve, reject) => {
      const req = net.request({ url, method, session: sessionFor(id), useSessionCookies: true });
      for (const [k, v] of Object.entries(headers || {})) { try { req.setHeader(k, v); } catch (_) {} }
      req.on("response", (res) => {
        const h = {};
        for (const [k, v] of Object.entries(res.headers)) h[k.toLowerCase()] = Array.isArray(v) ? v[0] : v;
        res.on("data", () => {});
        res.on("end", () => resolve({ status: res.statusCode, headers: h }));
        res.on("error", reject);
      });
      req.on("error", reject);
      const timer = setTimeout(() => { try { req.abort(); } catch (_) {} reject(new Error("délai dépassé")); }, NET_TIMEOUT);
      req.on("close", () => clearTimeout(timer));
      if (body) req.write(body);
      req.end();
    });
  }
};

// ---------------------------------------------------------------- Fenêtre de connexion Roblox
function loginViaWindow() {
  return new Promise((resolve, reject) => {
    const partition = "batblox-login-" + crypto.randomBytes(4).toString("hex");
    const ses = session.fromPartition(partition);
    const w = new BrowserWindow({
      width: 520, height: 720, parent: win || undefined, modal: !!win, title: "Connexion à Roblox", icon: ICON, autoHideMenuBar: true,
      webPreferences: { partition, sandbox: true, contextIsolation: true, nodeIntegration: false }
    });
    let done = false;
    const finish = async (err, cookie) => {
      if (done) return;
      done = true;
      clearInterval(poll);
      try { await ses.clearStorageData(); } catch (_) {}
      if (!w.isDestroyed()) w.destroy();
      err ? reject(err) : resolve(cookie);
    };
    const poll = setInterval(async () => {
      try {
        const list = await ses.cookies.get({ name: ".ROBLOSECURITY" });
        const c = list.find((x) => /roblox\.com$/.test(x.domain));
        if (c && c.value) finish(null, c.value);
      } catch (_) {}
    }, 1500);
    w.on("closed", () => finish(new Error("Connexion annulée.")));
    w.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    w.loadURL(ROOT_URL + "/login");
  });
}

// ---------------------------------------------------------------- Notifications Windows
function desktopNotify(title, body, { sound, join, page } = {}) {
  if (!Notification.isSupported()) return;
  // Mode streamer : la notification s'affiche à l'écran (donc dans le live) : aucun pseudo ni nom de jeu, seulement le type d'alerte.
  if (settings.appearance.streamer) { title = "🦇 Batblox : nouvelle alerte"; body = "Ouvre Batblox pour voir le détail (mode streamer actif)."; }
  title = T(title); body = T(body);
  const n = new Notification({ title, body, icon: ICON, silent: !sound });
  // join : alerte « jeu surveillé » → un clic rejoint l'ami dans son jeu (même chemin que le bouton « Rejoindre »).
  n.on("click", () => {
    showWindow();
    if (join && /^\d+$/.test(String(join))) launcher.join(String(join)).catch((e) => send("toast", { text: "Impossible de rejoindre : " + e.message, kind: "bad" }));
    else send("navigate", page || "history");
  });
  n.show();
}

// ---------------------------------------------------------------- Fenêtre principale
// Couleur de fond de la fenêtre avant que l'interface ne s'affiche : celle du thème choisi (évite un flash sombre avec un thème clair).
const THEME_BG = { light: "#E4E8FA", dark: "#161930", bat: "#0D0A1E", joker: "#0F0720", batman: "#0A0B0D", inde: "#FFF6E8" };
function windowBg() {
  let t = settings.appearance && settings.appearance.theme;
  if (t === "auto" || !THEME_BG[t]) t = nativeTheme.shouldUseDarkColors ? "dark" : "light";
  return THEME_BG[t];
}

// Intro vidéo : jouée une seule fois, au lancement de l'application. Pas en démarrage réduit (fenêtre cachée : on n'allait pas jouer du son dans le vide),
// ni quand la fenêtre est recréée plus tard depuis la zone de notification. Le fond de la fenêtre prend le bleu de la vidéo (images de début et de fin
// en aplat) : aucun flash de la couleur du thème avant la première image.
const INTRO_BG = "#0F5FFD";
let introPlayed = false;

function createWindow(hidden) {
  const intro = !hidden && !introPlayed && settings.appearance.intro !== false;
  introPlayed = true;
  win = new BrowserWindow({
    width: 1180, height: 780, minWidth: 900, minHeight: 600, show: !hidden, title: "Batblox", icon: ICON, backgroundColor: intro ? INTRO_BG : windowBg(), autoHideMenuBar: true, frame: false,
    // autoplayPolicy : sans cela, Chromium refuse de lancer une vidéo AVEC son sans geste de l'utilisateur.
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false, autoplayPolicy: "no-user-gesture-required" }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(INDEX, intro ? { query: { intro: "1" } } : undefined);
  // F12 ou Ctrl+Maj+I : outils de développement (console de l'interface)
  win.webContents.on("before-input-event", (e, input) => {
    if (input.type !== "keyDown") return;
    if (input.key === "F12" || (input.control && input.shift && input.key.toLowerCase() === "i")) { e.preventDefault(); win.webContents.toggleDevTools(); return; }
    // Raccourcis clavier (interceptés ici : ils passent avant ceux du menu caché d'Electron, ex. Ctrl+R = recharger).
    if (input.key === "F5" && !input.control && !input.alt) { e.preventDefault(); send("shortcut", "check"); return; }
    if (!input.control || input.alt || input.meta) return;
    const k = String(input.key || "").toLowerCase();
    if (/^[1-9]$/.test(k) && !input.shift) { e.preventDefault(); send("shortcut", "nav" + k); }
    else if (k === "l" && !input.shift) { e.preventDefault(); send("shortcut", "launch"); }
    else if (k === "k" && !input.shift) { e.preventDefault(); send("shortcut", "search"); }
    else if (k === "s" && input.shift) { e.preventDefault(); api["settings:set"]({ appearance: { streamer: !settings.appearance.streamer } }); }
    else if (k === "m" && input.shift) { e.preventDefault(); toggleMini(); }
    else if (k === "r") { e.preventDefault(); send("shortcut", "check"); }
    else if (k === ",") { e.preventDefault(); send("shortcut", "settings"); }
    else if (k === "=" || k === "+" || k === "add") { e.preventDefault(); setZoom(settings.appearance.zoom + 10); }
    else if (k === "-" || k === "subtract") { e.preventDefault(); setZoom(settings.appearance.zoom - 10); }
    else if (k === "0" && !input.shift) { e.preventDefault(); setZoom(100); }
  });
  win.webContents.on("did-finish-load", applyZoom);
  win.webContents.setWindowOpenHandler(({ url }) => { openSafe(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith("file://")) { e.preventDefault(); openSafe(url); } });
  win.on("close", (e) => {
    if (!quitting && settings.system.trayOnClose) { e.preventDefault(); win.hide(); }
  });
  // Barre de titre personnalisée : l'interface affiche l'état agrandi / restauré
  const winState = () => send("winstate", { maximized: !!(win && !win.isDestroyed() && (win.isMaximized() || win.isFullScreen())) });
  ["maximize", "unmaximize", "enter-full-screen", "leave-full-screen", "restore"].forEach((ev) => win.on(ev, winState));
  win.on("closed", () => { win = null; });
}
// Taille de l'interface (zoom de la page) : 80 à 130 %.
function applyZoom() { if (win && !win.isDestroyed()) win.webContents.setZoomFactor((settings.appearance.zoom || 100) / 100); }
function setZoom(z) {
  z = Math.min(130, Math.max(80, Math.round(z / 10) * 10));
  if (z === settings.appearance.zoom) return;
  api["settings:set"]({ appearance: { zoom: z } });
}
function showWindow() { if (!win) createWindow(false); if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
function send(evt, payload) {
  if (win && !win.isDestroyed()) win.webContents.send("evt", evt, payload);
  if (mini && !mini.isDestroyed()) mini.webContents.send("evt", evt, payload); // la mini-fenêtre suit les mêmes événements
}

// ---------------------------------------------------------------- Mini-fenêtre « Amis en ligne »
// Petite fenêtre compacte (toujours au premier plan par défaut) : amis en ligne + bouton Rejoindre. Position et taille mémorisées.
function toggleMini(force) {
  if (mini && !mini.isDestroyed()) { if (force === true) { mini.show(); mini.focus(); return true; } mini.close(); return false; }
  if (force === false) return false;
  const saved = storage.get("ui-state", () => ({})) || {};
  const b = saved.mini || {};
  mini = new BrowserWindow({
    width: b.width || 320, height: b.height || 480, x: b.x, y: b.y, minWidth: 260, minHeight: 300, show: false, frame: false, resizable: true, maximizable: false, fullscreenable: false,
    title: "Batblox — Amis en ligne", icon: ICON, backgroundColor: windowBg(), alwaysOnTop: settings.system.miniOnTop,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false }
  });
  mini.setMenuBarVisibility(false);
  mini.loadFile(INDEX, { query: { mini: "1" } });
  mini.once("ready-to-show", () => { if (mini && !mini.isDestroyed()) mini.show(); });
  mini.webContents.on("did-finish-load", () => { if (mini && !mini.isDestroyed()) mini.webContents.setZoomFactor((settings.appearance.zoom || 100) / 100); });
  mini.webContents.setWindowOpenHandler(({ url }) => { openSafe(url); return { action: "deny" }; });
  mini.webContents.on("will-navigate", (e, url) => { if (!url.startsWith("file://")) { e.preventDefault(); openSafe(url); } });
  const remember = () => { if (!mini || mini.isDestroyed()) return; const st = storage.get("ui-state", () => ({})) || {}; st.mini = mini.getBounds(); storage.set("ui-state", st); };
  mini.on("moved", remember); mini.on("resized", remember);
  mini.on("closed", () => { mini = null; refreshTray(); });
  refreshTray();
  return true;
}
function openSafe(url) { if (/^https:\/\/([\w-]+\.)?(roblox\.com|discord\.com|ntfy\.sh|github\.com)\//i.test(url)) shell.openExternal(url); }

// ---------------------------------------------------------------- Rapport « Signaler un problème »
// Ne contient JAMAIS : session Roblox, adresse de webhook, sujet ntfy, dossier de sauvegarde, pseudos des comptes, notes d'amis.
function buildReport() {
  const home = os.homedir();
  const clean = (t) => scrub(String(t == null ? "" : t)).split(home).join("%USERPROFILE%").replace(/https:\/\/(?:[\w-]+\.)?discord(?:app)?\.com\/api\/webhooks\/\S+/gi, "[webhook masqué]");
  const s = JSON.parse(JSON.stringify(settings));
  s.notifications.discord.url = s.notifications.discord.url ? "[configuré]" : "";
  s.notifications.ntfy.topic = s.notifications.ntfy.topic ? "[configuré]" : "";
  s.backup.dir = s.backup.dir ? "[configuré]" : "";
  s.launcher.customExe = s.launcher.customExe ? "[configuré]" : "";
  s.discordRpc.clientId = s.discordRpc.clientId ? "[configuré]" : "";
  s.monitoring.favorites = (s.monitoring.favorites || []).length + " élément(s)";
  s.monitoring.gameOnly = (s.monitoring.gameOnly || []).length + " élément(s)";
  const snap = monitor.snapshot();
  const accs = accounts.list();
  const L = [];
  L.push("=== Rapport Batblox ===", "Créé le : " + new Date().toISOString(), "");
  L.push("Batblox " + app.getVersion() + (app.isPackaged ? "" : " (mode développement)") + (process.env.PORTABLE_EXECUTABLE_FILE ? " — portable" : ""));
  L.push(`Electron ${process.versions.electron} · Chromium ${process.versions.chrome} · Node ${process.versions.node}`);
  L.push(`Système : ${os.type()} ${os.release()} (${process.arch}) · ${Math.round(os.totalmem() / 1073741824)} Go de mémoire · langue ${app.getLocale()}`);
  L.push(`Chiffrement Windows : ${vault.available() ? "disponible" : "INDISPONIBLE"}`);
  L.push("", "--- État ---");
  L.push(`Comptes : ${accs.length} (états : ${accs.map((a) => a.status).join(", ") || "aucun"})`);
  L.push(`Monitoring : ${snap.paused ? "en pause" : "actif"} · dernière vérification ${snap.lastRun ? new Date(snap.lastRun).toISOString() : "jamais"}${snap.error ? " · erreur : " + clean(snap.error) : ""}`);
  L.push(`Amis : ${snap.friends == null ? "?" : snap.friends} · profils suivis : ${snap.watched} · historique : ${monitor.history.entries.length} événement(s)`);
  try { const u = updater.state(); L.push(`Mises à jour : ${u.latest ? "dernière " + u.latest.version : "non vérifiées"}${u.error ? " · erreur : " + clean(u.error) : ""}`); } catch (_) {}
  L.push("", "--- Réglages (secrets retirés) ---", clean(JSON.stringify(s, null, 1)));
  L.push("", "--- Journal (250 dernières lignes, nettoyées) ---", ...logger.tail(250).map(clean));
  return L.join("\n");
}

// ---------------------------------------------------------------- Zone de notification (System Tray)
function buildTrayMenu() {
  const snap = monitor.snapshot();
  const acc = accounts.active();
  const mon = T(snap.paused ? "⏸ Monitoring en pause" : snap.error ? "⚠ " + snap.error : "● Monitoring actif");
  const rob = T(snap.me ? (snap.me.status === "jeu" ? "Roblox : En jeu" : snap.me.status === "en_ligne" ? "Roblox : En ligne" : "Roblox : Hors ligne") : "Roblox : —");
  return Menu.buildFromTemplate([
    { label: T("🦇 Batblox"), enabled: false },
    { label: mon, enabled: false },
    { label: rob, enabled: false },
    { label: T("Compte : ") + (acc ? (settings.appearance.streamer ? T("masqué (mode streamer)") : acc.label) : T("aucun")), enabled: false },
    { label: snap.watched + T(" profil(s) suivi(s)"), enabled: false },
    { type: "separator" },
    { label: T("Ouvrir Batblox"), click: showWindow },
    { label: T(mini ? "Fermer la mini-fenêtre" : "Amis en ligne (mini-fenêtre)"), click: () => toggleMini() },
    { label: T("Mode streamer"), type: "checkbox", checked: !!settings.appearance.streamer, click: () => api["settings:set"]({ appearance: { streamer: !settings.appearance.streamer } }) },
    { label: T("Vérifier maintenant"), click: () => monitor.checkAll({ force: true }) },
    { label: T(snap.paused ? "Reprendre le monitoring" : "Mettre le monitoring en pause"), click: () => toggleMonitoring() },
    { label: T("Lancer Roblox"), click: () => { showWindow(); send("launch"); } },
    { type: "separator" },
    { label: T("Quitter"), click: () => { quitting = true; app.quit(); } }
  ]);
}
function createTray() {
  const img = nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.setToolTip("Batblox");
  tray.on("click", showWindow);
  refreshTray();
}
function refreshTray() { if (tray) { tray.setContextMenu(buildTrayMenu()); const s = monitor.snapshot(); tray.setToolTip(T(s.paused ? "Batblox — en pause" : "Batblox — monitoring actif")); } }
function toggleMonitoring() {
  const next = JSON.parse(JSON.stringify(settings));
  next.monitoring.enabled = !next.monitoring.enabled;
  setSettings(sanitize(next));
  if (settings.monitoring.enabled) monitor.kick(500);
  send("settings", settings); refreshTray();
}

// ---------------------------------------------------------------- Avatars
// Avatars : gardés sur le disque (une photo de profil change rarement). Frais 6 h, utilisables 7 jours (rafraîchis en arrière-plan) :
// au démarrage, tous les avatars déjà vus s'affichent sans aucune requête.
const AVATAR_TTL = 6 * 3600000, AVATAR_STALE = 7 * 86400000;
async function avatarsFor(ids) {
  const list = [...new Set(ids.map(String).filter((x) => /^\d+$/.test(x)))].slice(0, 200);
  const client = accounts.activeClient();
  const fetchMany = (need) => (client && !client.isLimited("thumbnails.roblox.com") ? client.avatars(need) : Promise.resolve({}));
  return cache.many("avatar:", list, fetchMany, { ttl: AVATAR_TTL, stale: AVATAR_STALE });
}

// Les 4 compteurs du compte, demandés à Roblox (à défaut : valeurs du monitoring).
async function fetchCounts(c, id) {
  limitedErr(c, "friends.roblox.com");
  const snap = monitor.snapshot() || {};
  const [friends, followers, following, requests] = await Promise.all([
    `https://friends.roblox.com/v1/users/${id}/friends/count`, `https://friends.roblox.com/v1/users/${id}/followers/count`,
    `https://friends.roblox.com/v1/users/${id}/followings/count`, "https://friends.roblox.com/v1/user/friend-requests/count"
  ].map((u) => c.countOf(u).catch(() => null)));
  return {
    friends: friends != null ? friends : snap.friends, followers: followers != null ? followers : snap.followers,
    following: following != null ? following : snap.following, requests: requests != null ? requests : snap.requests
  };
}

// ---------------------------------------------------------------- Données calculées pour l'interface
const WEEK = 7 * 86400000;
function weekStart(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }

function statsOverview(range) {
  const acc = accounts.active();
  if (!acc) return null;
  const key = "me:" + acc.id;
  const series = monitor.stats.series[key] || [];
  const since = range === "all" ? 0 : Date.now() - Number(range) * 86400000;
  const pts = series.filter((p) => p.t >= since);
  const weeks = {};
  for (const e of monitor.history.entries) {
    if (e.target !== "me" || (e.acc && e.acc !== acc.id) || e.ts < since) continue;
    if (e.type !== "added" && e.type !== "removed") continue;
    const w = weekStart(e.ts);
    const r = weeks[w] || (weeks[w] = { w, added: 0, removed: 0 });
    r[e.type]++;
  }
  const snap = monitor.snapshot();
  return {
    cards: { friends: snap.friends, followers: snap.followers, following: snap.following, requests: snap.requests },
    series: pts, weekly: Object.values(weeks).sort((a, b) => a.w - b.w), presenceStats: settings.monitoring.presenceStats
  };
}

function friendStats(id) {
  const rec = monitor.stats.pstats.d[id];
  if (!rec) return null;
  const hours = new Array(24).fill(0), hobs = new Array(24).fill(0), days = new Array(7).fill(0), dobs = new Array(7).fill(0);
  for (let b = 0; b < 168; b++) { hours[b % 24] += rec.o[b]; hobs[b % 24] += rec.s[b]; days[Math.floor(b / 24)] += rec.o[b]; dobs[Math.floor(b / 24)] += rec.s[b]; }
  const pct = (o, s) => (s > 0 ? Math.round((o / s) * 100) : null);
  const totalO = rec.o.reduce((a, b) => a + b, 0), totalS = rec.s.reduce((a, b) => a + b, 0);
  const hp = hours.map((o, i) => pct(o, hobs[i]));
  const dp = days.map((o, i) => pct(o, dobs[i]));
  const best = (arr, min) => { let bi = -1; arr.forEach((v, i) => { if (v != null && (bi < 0 || v > arr[bi])) bi = i; }); return bi >= 0 && arr[bi] >= min ? bi : -1; };
  const games = Object.values(rec.g || {}).sort((a, b) => b.s - a.s).slice(0, 8);
  return {
    online: pct(totalO, totalS), observedSec: totalS, byHour: hp, byDay: dp, week: rec.o.map((o, i) => pct(o, rec.s[i])), weekObs: rec.s,
    peakHour: best(hp, 1), bestDay: best(dp, 1), games
  };
}

// Personnes dont on peut voir les statistiques : profils suivis + amis suivis (🔔 ou « tous mes amis »).
function statsPeople() {
  const people = [];
  const seen = new Set();
  for (const [id, w] of Object.entries(monitor.watched.profiles)) {
    seen.add(id);
    const l = monitor.live[id];
    people.push({ id, kind: "watch", name: w.name, paused: !!w.paused, status: l ? (l.type === 2 ? "jeu" : l.type === 3 ? "studio" : l.type === 1 ? "en_ligne" : "hors_ligne") : null });
  }
  return people.slice(0, 600);
}

function personStats(id, range) {
  id = String(id);
  const w = monitor.watched.profiles[id] || null;
  const fr = !w ? monitor.friendsView().find((f) => f.id === id) : null;
  if (!w && !fr) throw new Error("Cette personne n'est plus suivie.");
  const since = range === "all" ? 0 : Date.now() - Number(range || 30) * 86400000;
  const series = (monitor.stats.series[id] || []).filter((p) => p.t >= since);
  const weeks = {};
  for (const e of monitor.history.entries) {
    if (String(e.target) !== id || e.ts < since || (e.type !== "added" && e.type !== "removed")) continue;
    const k = weekStart(e.ts);
    const r = weeks[k] || (weeks[k] = { w: k, added: 0, removed: 0 });
    r[e.type]++;
  }
  const cnt = monitor.stats.counts[id] || {};
  const l = monitor.live[id];
  const status = l ? (l.type === 2 ? "jeu" : l.type === 3 ? "studio" : l.type === 1 ? "en_ligne" : "hors_ligne") : fr && fr.status !== "inconnu" ? fr.status : null;
  return {
    id, kind: w ? "watch" : "friend", name: w ? w.name : fr.name, status, place: l ? l.place : fr ? fr.place : "",
    opts: w ? { friends: w.friends !== false, status: !!w.status, conn: w.conn !== false, paused: !!w.paused, error: w.error || null } : null,
    cards: w ? { friends: w.snapshot ? Object.keys(w.snapshot).length : null, followers: cnt.fo != null ? cnt.fo : null, following: cnt.fg != null ? cnt.fg : null } : null,
    series, weekly: Object.values(weeks).sort((a, b) => a.w - b.w),
    presence: friendStats(id), follows: settings.monitoring.follows,
    // une personne suivie explicitement est toujours collectée, même si la case globale est décochée
    presenceStats: settings.monitoring.presenceStats || !!(w && w.status)
  };
}

function presenceHeat() {
  const o = new Array(168).fill(0), s = new Array(168).fill(0);
  for (const rec of Object.values(monitor.stats.pstats.d)) for (let b = 0; b < 168; b++) { o[b] += rec.o[b]; s[b] += rec.s[b]; }
  const total = s.reduce((a, b) => a + b, 0);
  return { cells: o.map((v, i) => (s[i] > 0 ? Math.round((v / s[i]) * 100) : null)), obs: s, totalSec: total, enabled: settings.monitoring.presenceStats, friends: Object.keys(monitor.stats.pstats.d).length };
}

function historyList({ types, search, page = 0, size = 50, scope }) {
  const acc = accounts.active();
  const q = String(search || "").trim().toLowerCase();
  const typeSet = types && types.length ? new Set(types) : null;
  const all = monitor.history.entries;
  const out = [];
  for (let i = all.length - 1; i >= 0; i--) {
    const e = all[i];
    if (scope !== "all" && e.acc && acc && e.acc !== acc.id) continue;
    if (typeSet && !typeSet.has(e.type)) continue;
    if (q && !((e.friendName || "").toLowerCase().includes(q) || (e.oldName || "").toLowerCase().includes(q) || (e.targetName || "").toLowerCase().includes(q))) continue;
    out.push(e);
  }
  return { total: out.length, items: out.slice(page * size, page * size + size) };
}

// ---------------------------------------------------------------- Découverte de jeux
// Sections proposées dans la page « Découvrir » : classements officiels de Roblox + jeux proches de ceux que tu as joués.
// Résultat gardé 10 minutes en mémoire pour ne pas solliciter Roblox à chaque affichage de la page.
const DISCOVER_TTL = 10 * 60 * 1000;
let discoverCache = null;
const SORT_FR = [[/^popular|top ?playing/i, "Populaires en ce moment"], [/top ?rated|toprated/i, "Les mieux notés"], [/up ?and ?coming|trending/i, "Tendances"], [/most ?favorited/i, "Les plus ajoutés en favoris"], [/featured/i, "À la une"], [/revisited|top ?revisited/i, "Jeux auxquels on revient"]];
const SORT_SKIP = /friend|continue|recent|favorites?$|my ?|sponsor|recommended.for|ad(s|vert)/i;

// Icônes de jeux : cache partagé et gardé sur le disque (fraîches 24 h, utilisables 30 jours) : une icône déjà vue n'est jamais
// redemandée à Roblox en attendant (Découvrir, Accueil, recherche, « Tout voir », temps de jeu, bilan).
const ICON_TTL = 24 * 3600000, ICON_STALE = 30 * 86400000;
function cachedIcon(pid) { const h = cache.peek("icon:" + pid); return h ? h.value : null; }
async function iconsFor(c, pids) {
  const ids = [...new Set((pids || []).map(String).filter((x) => /^\d+$/.test(x)))];
  const fetchMany = async (need) => {
    const chunks = [];
    for (let i = 0; i < need.length; i += 100) chunks.push(need.slice(i, i + 100));
    const parts = await Promise.all(chunks.map((ch) => c.placeIcons(ch))); // lots en parallèle
    return Object.assign({}, ...parts);
  };
  return cache.many("icon:", ids, fetchMany, { ttl: ICON_TTL, stale: ICON_STALE });
}
// Version qui attend les icônes (Accueil).
async function attachIcons(c, games) {
  const icons = await iconsFor(c, games.map((g) => g.pid));
  for (const g of games) g.icon = icons[g.pid] || null;
}
// Version instantanée pour « Découvrir » : n'utilise que le cache ; l'interface charge les icônes manquantes après l'affichage.
function attachCachedIcons(games) { for (const g of games) g.icon = cachedIcon(g.pid); }
// Pause ciblée : seul le service réellement concerné bloque, et le message donne la durée restante.
function limitedErr(c, host) {
  if (!c.isLimited(host)) return;
  const s = c.waitSec(host);
  throw new Error("Roblox demande de ralentir : réessaie dans " + (s < 90 ? s + " s" : Math.round(s / 60) + " min") + ".");
}
function discoverClient() {
  const c = accounts.activeClient();
  if (!c) throw new Error("Ajoute d'abord un compte Roblox pour découvrir des jeux.");
  limitedErr(c, "games.roblox.com");
  return c;
}

const DISCOVER_STALE_MAX = 24 * 60 * 60 * 1000; // une page un peu ancienne s'affiche tout de suite et se rafraîchit en arrière-plan
let discoverInflight = null;
async function discoverGames(force) {
  const acc = accounts.activeId();
  // Au démarrage : la dernière page Découvrir enregistrée sur le disque s'affiche tout de suite (puis se rafraîchit si elle est ancienne).
  if (!discoverCache || discoverCache.acc !== acc) { const d = cache.peek("discover:" + acc); if (d) discoverCache = { acc, ts: Date.now() - d.age, data: d.value }; }
  const hit = discoverCache && discoverCache.acc === acc ? discoverCache : null;
  if (!force && hit) {
    const age = Date.now() - hit.ts;
    if (age < DISCOVER_TTL) return hit.data;
    if (age < DISCOVER_STALE_MAX) { buildDiscover(acc).then(() => send("refreshed", "discover")).catch(() => {}); return hit.data; }
  }
  return buildDiscover(acc);
}
// Un seul chargement à la fois : deux demandes simultanées (page + actualisation) partagent la même requête.
function buildDiscover(acc) {
  if (discoverInflight && discoverInflight.acc === acc) return discoverInflight.p;
  const p = loadDiscover(acc).finally(() => { if (discoverInflight && discoverInflight.p === p) discoverInflight = null; });
  discoverInflight = { acc, p };
  return p;
}
async function loadDiscover(acc) {
  const c = accounts.activeClient();
  if (!c) throw new Error("Ajoute d'abord un compte Roblox pour découvrir des jeux.");
  limitedErr(c, "games.roblox.com");
  const errors = [];
  // Tout part en parallèle : la liste des classements ET les « jeux proches » de tes derniers jeux (services différents, aucune dépendance).
  const sortsP = c.gameSorts().then((all) => ({ all }), (e) => ({ e }));
  const snap = monitor.snapshot();
  const base = [];
  for (const g of ((snap && snap.recentGames) || []).concat((settings.launcher.favorites || []).map((f) => ({ pid: f.placeId, name: f.name })))) {
    if (g.pid && !base.some((b) => b.pid === String(g.pid))) base.push({ pid: String(g.pid), name: g.name });
    if (base.length >= 2) break;
  }
  const simP = Promise.all(base.map(async (b) => {
    try {
      const uid = await c.universeOf(b.pid);
      if (!uid) return null;
      const games = (await c.similarGames(uid, 12)).filter((g) => g.pid !== b.pid);
      return games.length ? { id: "sim-" + b.pid, title: "Si tu aimes " + (b.name || "ce jeu"), games } : null;
    } catch (e) { errors.push(e.message); return null; }
  }));
  const sections = [];
  const sr = await sortsP;
  let sortSections = [];
  if (sr.e) { errors.push(sr.e.message); if (c._exploreErr) errors.push(c._exploreErr); }
  else {
    const sorts = sr.all.filter((s) => !SORT_SKIP.test(s.name + " " + s.title)).slice(0, 5);
    const got = await Promise.all(sorts.map(async (s) => {
      try {
        const games = await c.gamesBySort(s, 18); // avec l'API « explore », les jeux sont déjà dans la réponse : aucune requête de plus
        if (!games.length) return null;
        const fr = SORT_FR.find(([re]) => re.test(s.name) || re.test(s.title));
        return { id: "sort-" + s.token, token: s.token, title: fr ? fr[1] : (s.title || s.name), games };
      } catch (e) { errors.push(e.message); return null; }
    }));
    sortSections = got.filter(Boolean);
  }
  for (const x of await simP) if (x) sections.push(x);
  sections.push(...sortSections);
  if (!sections.length) throw new Error("Roblox n'a renvoyé aucune suggestion pour le moment" + (errors.length ? " (" + String(errors[0]).slice(0, 120) + ")" : "") + ". Réessaie plus tard.");
  attachCachedIcons(sections.flatMap((s) => s.games)); // pas d'attente : le reste des icônes se charge après l'affichage
  const data = { ts: Date.now(), sections };
  discoverCache = { acc, ts: Date.now(), data };
  cache.set("discover:" + acc, data, DISCOVER_TTL, 24 * 3600000);
  return data;
}

// Jeux en tendance pour l'accueil : 3 classements officiels (populaires, tendances, mieux notés), mis en cache comme « Découvrir ».
const TREND_ORDER = [/popular|top ?playing/i, /up ?and ?coming|trending/i, /top ?rated|toprated/i];
// Tendances de l'accueil : sur le disque (fraîches 10 min, utilisables 24 h). Au démarrage, l'accueil affiche les dernières tout de suite.
function trendingGames(force) {
  const acc = accounts.activeId();
  return cache.wrap("trend:" + acc, () => loadTrending(), { ttl: DISCOVER_TTL, stale: 24 * 3600000, force, onRefresh: () => send("refreshed", "trend") });
}
async function loadTrending() {
  const c = discoverClient();
  const key = (s) => s.name + " " + s.title;
  const sorts = (await c.gameSorts()).filter((s) => !SORT_SKIP.test(key(s)));
  const picked = [];
  for (const re of TREND_ORDER) { const s = sorts.find((x) => re.test(key(x)) && !picked.includes(x)); if (s) picked.push(s); }
  for (const s of sorts) { if (picked.length >= 3) break; if (!picked.includes(s)) picked.push(s); }
  let lastErr = null;
  const sections = (await Promise.all(picked.slice(0, 3).map(async (s) => {
    try {
      const games = await c.gamesBySort(s, 12);
      if (!games.length) return null;
      const fr = SORT_FR.find(([re]) => re.test(s.name) || re.test(s.title));
      return { id: s.token, token: s.token, title: fr ? fr[1] : (s.title || s.name), games };
    } catch (e) { lastErr = e; return null; }
  }))).filter(Boolean);
  if (!sections.length) throw new Error("Roblox n'a renvoyé aucun jeu en tendance pour le moment" + (lastErr ? " (" + String(lastErr.message).slice(0, 100) + ")" : "") + ". Réessaie plus tard.");
  await attachIcons(c, sections.flatMap((s) => s.games));
  return { ts: Date.now(), sections };
}

// ---------------------------------------------------------------- Chat Roblox (page « Messages »)
function chatClient() {
  const c = accounts.activeClient(), acc = accounts.active();
  if (!c || !acc) throw new Error("Ajoute d'abord un compte Roblox pour lire tes messages.");
  limitedErr(c, "apis.roblox.com");
  return { c, me: acc.id };
}
function chatError(e, c) {
  const s = e && e.status;
  if (s === 429 || (e && e.backoff)) { const w = c.waitSec("apis.roblox.com"); return new Error("Roblox demande de ralentir : réessaie dans " + (w < 90 ? w + " s" : Math.round(w / 60) + " min") + "."); }
  if (s === 401) return new Error("Session Roblox expirée : reconnecte ce compte (page Comptes).");
  if (s === 403) return new Error("Roblox refuse cette action : conversation en attente d'acceptation, chat désactivé ou restreint pour ce compte.");
  if (s === 400) return new Error("Roblox a refusé ce message (vide, trop long ou non autorisé).");
  if (s === 404) return new Error("Cette conversation n'existe plus.");
  return e;
}
async function chatCall(fn) {
  const { c, me } = chatClient();
  try { return await fn(c, me); } catch (e) { throw chatError(e, c); }
}

// ---------------------------------------------------------------- API exposée à l'interface
const api = {
  "app:init": () => ({ settings, accounts: accounts.list(), active: accounts.active(), snapshot: monitor.snapshot(), version: app.getVersion(), windows: process.platform === "win32", encryption: vault.available() }),
  "settings:set": (patch) => {
    const before = settings;
    // Listes : remplacées en entier (la fusion profonde garderait sinon les anciens éléments)
    if (patch && patch.notifications && Array.isArray(patch.notifications.gameAlerts)) settings.notifications.gameAlerts = [];
    setSettings(sanitize(merge(settings, patch)));
    if (before.appearance.zoom !== settings.appearance.zoom) { applyZoom(); if (mini && !mini.isDestroyed()) mini.webContents.setZoomFactor(settings.appearance.zoom / 100); }
    if (mini && !mini.isDestroyed() && before.system.miniOnTop !== settings.system.miniOnTop) mini.setAlwaysOnTop(settings.system.miniOnTop);
    if (mini && !mini.isDestroyed() && before.appearance.theme !== settings.appearance.theme) mini.setBackgroundColor(windowBg());
    app.setLoginItemSettings({ openAtLogin: !!settings.system.launchAtStartup, args: ["--cache"] });
    if (before.monitoring.intervalSec !== settings.monitoring.intervalSec || before.monitoring.enabled !== settings.monitoring.enabled) monitor.kick(800);
    rpc.sync().then(() => send("rpc", rpc.state())).catch(() => {});
    refreshTray();
    send("settings", settings);
    return settings;
  },
  "accounts:list": () => accounts.list(),
  "accounts:add": async ({ label }) => { const cookie = await loginViaWindow(); const a = await accounts.addFromCookie(label, cookie); showWindow(); return a; },
  "accounts:use": (id) => accounts.setActive(String(id)),
  "accounts:remove": (id) => accounts.remove(String(id)),
  "accounts:rename": ({ id, label }) => accounts.rename(String(id), label),
  "accounts:default": (id) => accounts.setDefault(String(id)),
  "accounts:check": (id) => accounts.check(String(id)),
  "accounts:logout": (id) => accounts.logout(String(id)),
  "avatars": (ids) => avatarsFor(ids || []),
  "gameicons": async (ids) => { const c = accounts.activeClient(); return c && !c.isLimited("thumbnails.roblox.com") ? iconsFor(c, (ids || []).slice(0, 120)) : {}; },

  "chat:unread": () => cache.wrap("chatu:" + accounts.activeId(), () => chatCall(async (c) => ({ unread: await c.chatUnread() })), { ttl: 20000, stale: 20000 }),
  // Conversations : la liste s'affiche tout de suite (15 s), puis se met à jour en arrière-plan ; un envoi ou une lecture l'invalide.
  "chat:list": (p) => { const cur = String((p && p.cursor) || "").slice(0, 400); return cache.wrap("chat:" + accounts.activeId() + ":" + cur, () => chatCall((c, me) => c.chatConversations(me, cur)), { ttl: 15000, stale: 5 * 60000, force: !!(p && p.force), onRefresh: () => send("refreshed", "chat") }); },
  "chat:messages": (p) => chatCall((c, me) => c.chatMessages(me, p && p.id, String((p && p.cursor) || "").slice(0, 400))),
  "chat:send": (p) => { cache.drop("chat:"); cache.drop("chatu:"); return chatCall((c, me) => c.chatSend(me, p && p.id, p && p.text)); },
  "chat:read": (id) => { cache.drop("chat:"); cache.drop("chatu:"); return chatCall((c) => c.chatMarkRead(id)); },

  "discover:games": (p) => discoverGames(!!(p && p.force)),
  "discover:trending": (p) => trendingGames(!!(p && p.force)),
  "discover:sort": async (p) => { const c = discoverClient(); const r = await c.sortContent(String((p && p.id) || ""), (p && p.page) || ""); attachCachedIcons(r.games); return r; },
  "discover:search": async (p) => {
    const q = String((p && p.q) || "").trim().slice(0, 60);
    if (q.length < 2) return { games: [], next: "" };
    const c = discoverClient(); const r = await c.searchGames(q, (p && p.page) || ""); attachCachedIcons(r.games); return r;
  },

  "monitor:snapshot": () => monitor.snapshot(),
  "monitor:checkNow": () => monitor.checkAll({ force: true }).then(() => monitor.snapshot()),
  "monitor:toggle": () => { toggleMonitoring(); return settings.monitoring.enabled; },

  "friends:list": () => monitor.friendsView(),

  // Page « Mon profil » : détails du compte actif, listes (abonnés, abonnements, demandes) et réponse aux demandes.
  // Détails du compte : tout part en parallèle (services différents) et les compteurs de « amis » (service le plus lent) sont chargés à part.
  // Détails du profil : en mémoire seulement (contient les Robux), frais 5 min, servis puis rafraîchis jusqu'à 6 h.
  "account:details": async (p) => {
    const acc = accounts.active(), c = accounts.activeClient();
    if (!acc || !c) throw new Error("Ajoute d'abord un compte Roblox.");
    const id = acc.id, snap = monitor.snapshot() || {};
    const { profile, robux, premium } = await cache.wrap("details:" + id, async () => {
      limitedErr(c, "users.roblox.com");
      const [profile, robux, premium] = await Promise.all([c.profile(id), c.robux(id).catch(() => null), c.premium(id).catch(() => null)]);
      return { profile, robux, premium };
    }, { ttl: 5 * 60000, stale: 6 * 3600000, force: !!(p && p.force), onRefresh: () => send("refreshed", "details") });
    return {
      profile, robux, premium,
      counts: { friends: snap.friends, followers: snap.followers, following: snap.following, requests: snap.requests, watched: snap.watched },
      me: snap.me || null, status: acc.status, checkedAt: acc.checkedAt || null
    };
  },
  // Compteurs : le service « amis » de Roblox est volontairement espacé (1,2 s entre deux requêtes), donc 4 compteurs = ~4 s.
  // Le monitoring les tient déjà à jour : on les sert tout de suite et on ne redemande à Roblox qu'en arrière-plan, au plus toutes les 2 min.
  "account:counts": async (p) => {
    const acc = accounts.active(), c = accounts.activeClient();
    if (!acc || !c) throw new Error("Ajoute d'abord un compte Roblox.");
    const id = acc.id, snap = monitor.snapshot() || {}, key = "counts:" + id, force = !!(p && p.force);
    const fromSnap = { friends: snap.friends, followers: snap.followers, following: snap.following, requests: snap.requests };
    if (!force && !cache.peek(key) && Object.values(fromSnap).every((v) => v != null)) cache.set(key, fromSnap, 0, 3600000); // servi, puis rafraîchi en arrière-plan
    return cache.wrap(key, () => fetchCounts(c, id), { ttl: 2 * 60000, stale: 3600000, force, onRefresh: () => send("refreshed", "counts") });
  },
  "network:page": async (p) => {
    const kind = String((p && p.kind) || ""), c = accounts.activeClient(), acc = accounts.active();
    if (!c || !acc) throw new Error("Ajoute d'abord un compte Roblox.");
    limitedErr(c, "friends.roblox.com");
    const cursor = String((p && p.cursor) || "").slice(0, 400);
    return kind === "requests" ? c.requestPage(cursor) : c.userPage(kind, acc.id, cursor);
  },
  "network:answer": async ({ id, accept }) => {
    const c = accounts.activeClient();
    if (!c) throw new Error("Ajoute d'abord un compte Roblox.");
    await c.answerRequest(String(id), !!accept);
    monitor.kick(1500); // l'historique enregistrera le changement à la prochaine vérification
    return true;
  },
  // Un seul suivi : le 🔔 d'un ami crée / retire un profil suivi complet (amis, statut, abonnés).
  "friends:track": async ({ id, on }) => {
    id = String(id);
    if (on) await monitor.addWatched(id, { friends: true, status: true, conn: true, paused: false });
    else monitor.removeWatched(id);
    return { converted: false };
  },
  "friends:gameOnly": ({ id, on }) => {
    const set = new Set(settings.monitoring.gameOnly.map(String));
    on ? set.add(String(id)) : set.delete(String(id));
    api["settings:set"]({ monitoring: { gameOnly: [...set] } });
    return true;
  },
  "friends:idle": () => monitor.idleFriends(),
  "friends:stats": (id) => friendStats(String(id)),

  "watch:list": () => Object.entries(monitor.watched.profiles).map(([id, w]) => Object.assign({ id, count: w.snapshot ? Object.keys(w.snapshot).length : null }, { name: w.name, friends: w.friends, status: w.status, conn: w.conn, paused: w.paused, error: w.error || null, live: monitor.live[id] ? (monitor.live[id].type === 2 ? "jeu" : monitor.live[id].type === 3 ? "studio" : monitor.live[id].type >= 1 ? "en_ligne" : "hors_ligne") : null, place: monitor.live[id] ? monitor.live[id].place : "" })),
  "watch:add": ({ query, opts }) => monitor.addWatched(query, opts),
  "watch:update": ({ id, patch }) => monitor.updateWatched(String(id), patch || {}),
  "watch:remove": (id) => monitor.removeWatched(String(id)),

  "history:list": (q) => historyList(q || {}),
  "history:clear": () => { data.clearHistory(); return true; },
  "history:csv": async () => {
    const r = await dialog.showSaveDialog(win, { title: T("Exporter l'historique"), defaultPath: "batblox-historique.csv", filters: [{ name: T("Fichier CSV"), extensions: ["csv"] }] });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, data.historyCsv(), "utf8");
    return r.filePath;
  },

  "stats:overview": (range) => statsOverview(range || 30),
  "stats:heat": () => presenceHeat(),
  "stats:people": () => statsPeople(),
  "stats:person": (p) => personStats(p && p.id, p && p.range),

  "roblox:status": () => launcher.status(),
  "roblox:updateCheck": (p) => launcher.updateCheck(!!(p && p.force)),
  "roblox:update": (p) => launcher.update({ closeFirst: !!(p && p.closeFirst) }),
  "launcher:pickExe": async () => {
    const r = await dialog.showOpenDialog(win, { title: T("Choisir le lanceur (.exe)"), properties: ["openFile"], filters: [{ name: T("Programme"), extensions: ["exe"] }] });
    return r.canceled || !r.filePaths.length ? null : r.filePaths[0];
  },
  "roblox:launch": async (p) => { const r = await launcher.launch(p || {}); monitor.noteGame(accounts.activeId(), { pid: r.placeId }); monitor.emit("update"); if (settings.launcher.autoReapplyCustom) custom.reapplyIfNeeded(); return r; },
  "roblox:join": (userId) => launcher.join(userId),
  "roblox:close": ({ pid, force }) => launcher.closeInstance(Number(pid), !!force),
  "roblox:closeAll": (force) => launcher.closeAll(!!force),

  "executor:list": () => executor.list(),
  "executor:add": async () => {
    const r = await dialog.showOpenDialog(win, { title: T("Ajouter des logiciels à l'exécuteur"), properties: ["openFile", "multiSelections"], filters: [{ name: T("Programmes et raccourcis"), extensions: ["exe", "lnk", "bat", "cmd"] }] });
    if (r.canceled || !r.filePaths.length) return null;
    return executor.add(r.filePaths);
  },
  "executor:launch": (id) => executor.launch(id),
  "executor:rename": ({ id, name }) => executor.rename(id, name),
  "executor:remove": (id) => executor.remove(id),
  "executor:move": ({ id, delta }) => executor.move(id, delta),
  "executor:reveal": (id) => { shell.showItemInFolder(executor.pathOf(id)); return true; },

  "custom:status": () => custom.status(),
  "custom:pick": async (kind) => {
    const filters = { sound: [{ name: "Son Ogg", extensions: ["ogg"] }], font: [{ name: "Police", extensions: ["ttf", "otf"] }], cursor: [{ name: "Image PNG", extensions: ["png"] }] }[kind];
    if (!filters) throw new Error("Type inconnu.");
    const r = await dialog.showOpenDialog(win, { title: T("Choisir un fichier"), properties: kind === "cursor" ? ["openFile", "multiSelections"] : ["openFile"], filters });
    if (r.canceled || !r.filePaths.length) return null;
    const mime = { sound: "audio/ogg", font: "font/ttf", cursor: "image/png" }[kind];
    const previews = r.filePaths.slice(0, 6).map((p) => ({ name: path.basename(p), url: fs.statSync(p).size < 12 * 1048576 ? `data:${mime};base64,${fs.readFileSync(p).toString("base64")}` : null }));
    return { paths: r.filePaths, previews };
  },
  "custom:apply": ({ kind, paths }) => custom.apply(kind, paths),
  "custom:reapply": (kind) => custom.reapply(kind),
  "custom:restore": (kind) => custom.restore(kind),
  "custom:forget": (kind) => custom.forget(kind),

  "maint:cache": (p) => maintenance.cacheInfo(!!(p && p.force)),
  "maint:clean": ({ ids }) => maintenance.clean(ids && ids.length ? ids : null),
  "maint:integrity": () => maintenance.integrity(custom),
  "maint:repair": () => (launcher.invalidate(), maintenance.repair(custom, (u) => shell.openExternal(u), (p) => shell.openPath(p))),
  "maint:logs": () => logger.tail(300),

  "update:state": () => updater.state(),
  "update:check": () => updater.check({ force: true }),
  "update:install": async () => {
    const r = await updater.install();
    if (r.launched) setTimeout(() => { quitting = true; app.quit(); }, 1500); // l'installeur remplace les fichiers : Batblox doit être fermé
    return r;
  },
  "app:devtools": () => { if (win) win.webContents.openDevTools({ mode: "detach" }); return true; },
  "net:diag": () => runDiagnostics({ accounts, getSettings, fetch: (u, i) => net.fetch(u, i) }),
  "push:test": (kind) => notifier.test(kind).then(() => true),
  "rpc:state": () => rpc.state(),
  "rpc:retry": () => rpc.retry(),

  "data:export": async () => {
    const r = await dialog.showSaveDialog(win, { title: T("Exporter la sauvegarde"), defaultPath: `batblox-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: T("Sauvegarde Batblox"), extensions: ["json"] }] });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, JSON.stringify(data.exportAll(), null, 2), "utf8");
    return r.filePath;
  },
  "data:import": async ({ mode }) => {
    const r = await dialog.showOpenDialog(win, { title: T("Importer une sauvegarde"), properties: ["openFile"], filters: [{ name: T("Sauvegarde (Batblox ou ancienne extension)"), extensions: ["json"] }] });
    if (r.canceled || !r.filePaths.length) return null;
    if (fs.statSync(r.filePaths[0]).size > 100 * 1048576) throw new Error("Fichier trop volumineux.");
    let json;
    try { json = JSON.parse(fs.readFileSync(r.filePaths[0], "utf8")); } catch (_) { throw new Error("Ce fichier n'est pas une sauvegarde valide."); }
    return data.importData(json, mode === "replace" ? "replace" : "merge");
  },
  "data:clearPresence": () => { data.clearPresenceStats(); return true; },
  "data:reset": () => { data.resetAll(); send("settings", settings); return true; },
  "shell:open": (url) => { openSafe(String(url)); return true; },
  "win:minimize": () => { if (win && !win.isDestroyed()) win.minimize(); return true; },
  "win:toggleMax": () => { if (win && !win.isDestroyed()) { if (win.isMaximized()) win.unmaximize(); else win.maximize(); } return true; },
  "win:close": () => { if (win && !win.isDestroyed()) win.close(); return true; },   // passe par la logique « réduire dans la zone de notification »
  "intro:done": () => { if (win && !win.isDestroyed()) win.setBackgroundColor(windowBg()); return true; },   // fin de l'intro : le fond de la fenêtre reprend la couleur du thème
  "win:state": () => ({ maximized: !!(win && !win.isDestroyed() && (win.isMaximized() || win.isFullScreen())) }),
  // Recharge l'interface (changement de langue) sans rejouer l'intro
  "app:reloadUI": () => {
    if (win && !win.isDestroyed()) win.loadFile(INDEX);
    if (mini && !mini.isDestroyed()) mini.loadFile(INDEX, { query: { mini: "1" } });
    refreshTray();
    return true;
  },
  "app:quit": () => { quitting = true; app.quit(); return true; },

  // ---- v1.6.0 (2) : notes et groupes d'amis, vue tous comptes, mini-fenêtre
  "people:get": () => people.get(),
  "people:note": ({ id, text }) => people.setNote(id, text),
  "people:members": ({ id, groups }) => people.setMembers(id, groups),
  "people:groups": (list) => people.setGroups(list),
  "accounts:overview": () => accounts.list().map((a) => {
    const st = (monitor.state.accounts || {})[a.id] || {};
    const cnt = monitor.stats.counts["me:" + a.id] || {};
    const pt = playtime.summary(a.id);
    const pres = st.presence || {};
    const online = Object.values(pres).filter((p) => p && (p.c === "on" || p.c === "game")).length;
    return { id: a.id, label: a.label, name: a.name, avatarUrl: a.avatarUrl, status: a.status, active: a.id === accounts.activeId(),
      friends: st.friends ? Object.keys(st.friends).length : null, requests: st.requests ? Object.keys(st.requests).length : null,
      followers: cnt.fo != null ? cnt.fo : null, online: st.presence ? online : null, lastCheck: st.lastCheck || 0, today: pt.today, week: pt.week };
  }),
  "people:alert": ({ id, on, wasOn }) => { const r = people.setAlert(id, on, wasOn); if (on) monitor.kick(1500); return r; },
  // Anciens pseudos d'un ami (événements « changement de pseudo » de l'historique), du plus récent au plus ancien
  "people:names": (id) => monitor.history.entries.filter((e) => e.type === "renamed" && String(e.friendId) === String(id))
    .map((e) => ({ from: e.oldName || "", to: e.friendName || "", ts: e.ts })).sort((a, b) => b.ts - a.ts).slice(0, 50),

  // ---- Signaler un problème : rapport SANS aucune donnée de connexion (pas de session, webhook, sujet ntfy, chemin personnel)
  "app:report": () => buildReport(),
  "app:copy": (text) => { clipboard.writeText(String(text || "").slice(0, 200000)); return true; },
  "app:reportSave": async (text) => {
    const r = await dialog.showSaveDialog(win, { title: T("Enregistrer le rapport"), defaultPath: `batblox-rapport-${new Date().toISOString().slice(0, 10)}.txt`, filters: [{ name: T("Texte"), extensions: ["txt"] }] });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, String(text || ""), "utf8");
    return r.filePath;
  },
  "app:reportPage": () => { openSafe("https://github.com/BatStream-off/Batblox/issues/new"); return true; },

  // ---- Bilan du mois
  "recap:months": () => { const id = accounts.activeId(); return monthsWithData(monitor.history.entries, id ? playtime.rec(id).days : {}); },
  "recap:month": ({ y, m } = {}) => {
    const now = new Date(), id = accounts.activeId();
    y = Number.isInteger(y) ? y : now.getFullYear(); m = Number.isInteger(m) && m >= 0 && m < 12 ? m : now.getMonth();
    const r = buildRecap({ entries: monitor.history.entries, playDays: id ? playtime.rec(id).days : {}, y, m, accId: id });
    r.text = T(recapText(r));
    return r;
  },
  "recap:csv": async ({ y, m }) => {
    const id = accounts.activeId();
    const r = buildRecap({ entries: monitor.history.entries, playDays: id ? playtime.rec(id).days : {}, y, m, accId: id });
    const d = await dialog.showSaveDialog(win, { title: T("Exporter le bilan"), defaultPath: `batblox-bilan-${r.key}.csv`, filters: [{ name: T("CSV"), extensions: ["csv"] }] });
    if (d.canceled || !d.filePath) return null;
    fs.writeFileSync(d.filePath, recapCsv(r), "utf8");
    return d.filePath;
  },
  // Image du bilan : capture de la zone de la carte (coordonnées CSS envoyées par l'interface), enregistrée en PNG.
  "recap:image": async ({ rect, key }) => {
    if (!win || win.isDestroyed() || !rect) return null;
    const z = win.webContents.getZoomFactor();
    const r = { x: Math.max(0, Math.round(rect.x * z)), y: Math.max(0, Math.round(rect.y * z)), width: Math.max(1, Math.round(rect.width * z)), height: Math.max(1, Math.round(rect.height * z)) };
    const img = await win.webContents.capturePage(r);
    const d = await dialog.showSaveDialog(win, { title: T("Enregistrer le bilan en image"), defaultPath: `batblox-bilan-${/^\d{4}-\d{2}$/.test(String(key)) ? key : "mois"}.png`, filters: [{ name: T("Image PNG"), extensions: ["png"] }] });
    if (d.canceled || !d.filePath) return null;
    fs.writeFileSync(d.filePath, img.toPNG());
    return d.filePath;
  },
  "recap:copyImage": async ({ rect }) => {
    if (!win || win.isDestroyed() || !rect) return false;
    const z = win.webContents.getZoomFactor();
    const img = await win.webContents.capturePage({ x: Math.round(rect.x * z), y: Math.round(rect.y * z), width: Math.round(rect.width * z), height: Math.round(rect.height * z) });
    clipboard.writeImage(img);
    return true;
  },

  // ---- Cache (Réglages → Données)
  "cache:info": () => cache.info(),
  "cache:clear": () => { const n = cache.clear(); discoverCache = null; launcher.invalidate && launcher.invalidate(); return n; },

  "mini:toggle": (on) => toggleMini(on),
  "mini:close": () => toggleMini(false),
  "mini:openMain": (page) => { showWindow(); if (page) send("navigate", String(page)); return true; },

  // ---- v1.6.0 : temps de jeu, résumé quotidien, sauvegarde automatique
  "playtime:summary": () => { const id = accounts.activeId(); return id ? playtime.summary(id) : null; },
  "playtime:clear": () => { playtime.clear(accounts.activeId()); return true; },
  "digest:preview": () => scheduler.digestUnit(),
  "digest:test": async () => {
    const n = await scheduler.sendDigest();
    if (!n) throw new Error("Active et configure Discord ou ntfy (page Discord) pour recevoir le résumé.");
    return n;
  },
  "backup:pickDir": async () => {
    const r = await dialog.showOpenDialog(win, { title: T("Dossier des sauvegardes automatiques"), properties: ["openDirectory", "createDirectory"] });
    if (r.canceled || !r.filePaths.length) return null;
    api["settings:set"]({ backup: { dir: r.filePaths[0] } });
    return settings.backup.dir;
  },
  "backup:now": () => scheduler.backupNow(),
  "backup:state": () => scheduler.status(),
  "backup:open": async () => { if (!settings.backup.dir) return false; const err = await shell.openPath(settings.backup.dir); if (err) throw new Error(err); return true; }
};

// Lectures sans effet de bord : deux appels identiques en même temps (accueil + mini-fenêtre, page + actualisation…) n'en font qu'un.
const READ_ONLY = new Set(["friends:list", "avatars", "gameicons", "account:details", "account:counts", "roblox:status", "roblox:updateCheck", "discover:games", "discover:trending",
  "chat:list", "chat:unread", "watch:list", "stats:overview", "stats:people", "stats:heat", "history:list", "playtime:summary", "recap:month", "recap:months", "accounts:overview",
  "people:get", "people:names", "custom:status", "executor:list", "update:state", "rpc:state", "friends:idle", "friends:stats", "cache:info", "backup:state"]);
function registerIpc() {
  ipcMain.handle("api", async (e, name, payload) => {
    if (!e.senderFrame || !String(e.senderFrame.url).startsWith("file://")) return { ok: false, error: "Appel refusé." };
    const fn = api[name];
    if (!fn) return { ok: false, error: "Commande inconnue." };
    try {
      if (READ_ONLY.has(name)) { let k; try { k = "ipc:" + name + "|" + JSON.stringify(payload === undefined ? null : payload); } catch (_) { k = null; } if (k && k.length < 20000) return { ok: true, data: await cache.once(k, () => fn(payload)) }; }
      return { ok: true, data: await fn(payload) };
    }
    catch (err) { logger.warn(`${name} : ${err && err.message}`); return { ok: false, error: (err && err.message) || "Erreur inattendue." }; }
  });
}

// ---------------------------------------------------------------- Démarrage
async function boot() {
  const dataDir = path.join(app.getPath("userData"), "donnees");
  storage = new Storage(dataDir);
  logger = new Logger(path.join(app.getPath("userData"), "journaux"));
  vault = new Vault(safeStorage);
  const firstRun = !fs.existsSync(path.join(dataDir, "settings.json"));
  settings = sanitize(storage.get("settings", () => JSON.parse(JSON.stringify(DEFAULT_SETTINGS))));
  if (firstRun) settings.appearance.lang = /^fr/i.test(app.getLocale() || "") ? "fr" : "en"; // première installation : langue de Windows
  storage.set("settings", settings);

  // Cache : seules les données publiques et sans secret vont sur le disque (avatars, icônes, listes de jeux).
  cache = new Cache({ storage, logger, persist: (k) => /^(avatar|icon|trend|discover):/.test(k) });
  accounts = new AccountManager({ storage, vault, sessions, logger });
  playtime = new PlayTime({ storage, getSettings, logger });
  people = new People({ storage, lang: () => settings.appearance.lang });
  notifier = new Notifier({ getSettings, desktop: desktopNotify, logger, fetchImpl: (u, i) => net.fetch(u, withTimeout(i)), isPlaying: () => playtime.playing, tr: T,
    allow: (e) => people.allow(e, settings.notifications.groupConnOnly) });
  monitor = new Monitor({ storage, accounts, notifier, logger, getSettings });
  launcher = new RobloxLauncher({ execFile, openExternal: (u) => shell.openExternal(u), accounts, monitor, logger, getSettings });
  maintenance = new Maintenance({ launcher, accounts, logger, getSettings });
  custom = new Customization({ storage, launcher, logger, dataDir: app.getPath("userData") });
  data = new DataTools({ storage, monitor, accounts, getSettings, setSettings, logger });
  rpc = new RichPresence({ getSettings, launcher, monitor, accounts, logger });
  scheduler = new Scheduler({ storage, getSettings, notifier, monitor, playtime, data, accounts, fs, logger, onBackup: (st) => send("backup", st) });
  executor = new Executor({
    storage, logger,
    openPath: (p) => shell.openPath(p),
    getIcon: async (p) => { const img = await app.getFileIcon(p, { size: "large" }); return img && !img.isEmpty() ? img.toDataURL() : null; }
  });

  updater = new Updater({
    currentVersion: app.getVersion(), logger, windows: process.platform === "win32", portable: !!process.env.PORTABLE_EXECUTABLE_FILE,
    dir: path.join(app.getPath("userData"), "mises-a-jour"),
    getJson: async (url) => {
      const r = await net.fetch(url, withTimeout({ headers: { Accept: "application/vnd.github+json", "User-Agent": "Batblox/" + app.getVersion() } }));
      if (!r.ok) { const e = new Error("GitHub a répondu " + r.status + "."); e.status = r.status; throw e; }
      return r.json();
    },
    download: async (url, dest, onProgress) => {
      const r = await net.fetch(url, { headers: { "User-Agent": "Batblox/" + app.getVersion() }, signal: AbortSignal.timeout(10 * 60 * 1000) });
      if (!r.ok || !r.body) throw new Error("Téléchargement impossible (" + r.status + ").");
      const total = Number(r.headers.get("content-length")) || 0;
      let got = 0;
      const out = fs.createWriteStream(dest);
      const reader = r.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          got += value.length;
          if (!out.write(Buffer.from(value))) await new Promise((res) => out.once("drain", res));
          if (total && onProgress) onProgress(Math.round((got / total) * 100));
        }
      } finally { await new Promise((res) => out.end(res)); }
      return { bytes: got };
    },
    launch: (file) => { const c = require("child_process").spawn(file, [], { detached: true, stdio: "ignore" }); c.unref(); },
    openPage: (u) => shell.openExternal(u)
  });

  await accounts.init();
  registerIpc();
  const hidden = process.argv.includes("--cache") && settings.system.startMinimized;
  createWindow(hidden);
  try { createTray(); } catch (e) { logger.warn("Zone de notification indisponible : " + e.message); }

  accounts.on("changed", (a) => { send("account", a); refreshTray(); });
  accounts.on("list", () => send("accounts", accounts.list()));
  monitor.on("favorites-migrated", () => { try { api["settings:set"]({ monitoring: { favorites: [] } }); } catch (e) { logger.error(e); } });
  monitor.on("update", () => { send("monitor", monitor.snapshot()); refreshTray(); });
  // Préchargement discret après la première vérification : avatars des amis, icônes des derniers jeux, tendances de l'accueil.
  // Les pages s'ouvrent ensuite sans attendre le réseau (et tout reste sur le disque pour le prochain démarrage).
  let warmed = null;
  const warmup = async () => {
    try {
      const c = accounts.activeClient(); if (!c) return;
      const friends = monitor.friendsView();
      const online = friends.filter((f) => f.status !== "hors_ligne"), rest = friends.filter((f) => f.status === "hors_ligne");
      await avatarsFor(online.concat(rest).slice(0, 200).map((f) => f.id));
      const snap = monitor.snapshot() || {};
      await iconsFor(c, ((snap.recentGames || []).map((g) => g.pid)).concat((settings.launcher.favorites || []).map((f) => f.placeId)));
      trendingGames(false).catch(() => {});
    } catch (e) { logger.warn("Préchargement : " + (e && e.message)); }
  };
  monitor.on("update", () => { const id = accounts.activeId(); if (id && monitor.lastRun && warmed !== id) { warmed = id; setTimeout(warmup, 2500).unref(); } });
  monitor.on("history", (entries) => send("history", entries.length));
  // Alertes « prévenir à la prochaine connexion » : uniques, elles passent même si les notifications de ce type sont coupées.
  monitor.extraPresenceIds = () => people.alertIds();
  monitor.on("history", (entries) => {
    const hits = people.takeAlerts(entries);
    for (const e of hits) {
      const who = e.friendName || "Ton ami";
      const u = { icon: "🔔", title: who + " est en ligne", text: e.type === "ingame" && e.place ? `${who} vient de se connecter et joue à ${e.place}.` + " Clique pour le rejoindre." : `${who} vient de se connecter.`, type: "online" };
      try { desktopNotify(`${u.icon} ${u.title}`, u.text, { sound: true, join: e.type === "ingame" ? e.friendId : undefined, page: "friends" }); } catch (err) { logger.warn("Alerte de connexion : " + err.message); }
      notifier.sendRemote(u).catch(() => {});
    }
    if (hits.length) send("people");
  });
  // Temps de jeu : alimenté par mon propre statut à chaque vérification
  monitor.on("mypresence", (accId, pres, ts) => { playtime.update(accId, pres, ts); send("playtime"); });
  accounts.on("changed", () => playtime.stop());
  playtime.on("stop", () => { const n = notifier.flushHeld(); if (n) logger.info(n + " notification(s) retenue(s) pendant la partie"); });
  playtime.on("limit", ({ minutes }) => {
    const h = Math.floor(minutes / 60), m = minutes % 60;
    desktopNotify("⏰ Limite de temps de jeu atteinte", `Tu as joué ${h ? h + " h " + (m ? String(m).padStart(2, "0") + " min" : "") : m + " min"} aujourd'hui. Pense à faire une pause !`, { sound: true, page: "playtime" });
  });
  scheduler.start();

  monitor.start();
  Promise.resolve(rpc.sync()).catch(() => {});
  maintenance.autoClean();
  if (settings.launcher.autoReapplyCustom) setTimeout(() => custom.reapplyIfNeeded(), 4000);
  setInterval(() => accounts.persistCookies().catch(() => {}), 30 * 60 * 1000).unref();
  if (settings.updates.checkOnStart) setTimeout(() => updater.check().then((st) => { if (st.available) send("update", st); }).catch(() => {}), 8000);
  logger.info("Batblox démarré");
}

app.on("second-instance", () => showWindow());
app.on("window-all-closed", () => { /* l'application reste dans la zone de notification */ });
app.on("before-quit", () => { quitting = true; try { if (cache) cache.flush(); if (storage) storage.flush(); } catch (_) {} });
app.on("will-quit", () => { try { accounts && accounts.persistCookies(); } catch (_) {} });

app.whenReady().then(() => boot().catch((e) => { console.error(e); dialog.showErrorBox("Batblox", "Impossible de démarrer : " + (e && e.message)); app.quit(); }));

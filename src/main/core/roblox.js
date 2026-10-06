"use strict";
// Client des API web de Roblox. `fetchFn(url, init)` est fourni par la session du compte (cookies inclus).
// Les requêtes sont limitées en parallélisme, et un 429 déclenche une pause pour ne pas insister.

const PRESENCE_CHUNK = 50;

class HttpError extends Error {
  constructor(url, status, retryAfter) { super(`${url} -> ${status}`); this.status = status; if (retryAfter) this.retryAfter = retryAfter; }
}
const hostOf = (url) => { try { return new URL(url).hostname; } catch (_) { return "?"; } };
const GAP_MS = 300;            // pause minimale entre deux requêtes vers un même service (évite les rafales)
const HOST_GAP = { "friends.roblox.com": 1200, "apis.roblox.com": 90 }; // le service « amis » est le plus strict : on le ménage davantage
const SLOW_MS = 15 * 60 * 1000;  // après un 429, on espace toutes les requêtes pendant 15 min
const BACKOFF = [60, 120, 300]; // secondes, si Roblox ne précise pas « Retry-After »

const nameLabel = (o) => (o.displayName && o.displayName !== o.name ? `${o.displayName} (@${o.name})` : o.name);
const labelOf = (o) => (o && o.name ? nameLabel(o) : "");

class RobloxClient {
  constructor(fetchFn, rawFn, pageFn) {
    this.fetch = fetchFn;
    this.raw = rawFn || null;
    this.page = pageFn || null;
    this.csrf = null;
    this.backoff = new Map();  // service -> { until, strikes }
    this.slots = new Map();    // service -> prochain créneau libre
    this.gapMult = 1;          // multiplicateur d'espacement (monte après un 429, retombe seul)
    this.slowUntil = 0;
    this.nameCache = new Map();
  }

  get limited() { const t = Date.now(); for (const b of this.backoff.values()) if (t < b.until) return true; return false; }
  /** Vrai seulement si CE service est en pause (un 429 sur « amis » ne bloque plus les utilisateurs, avatars, présence…). */
  isLimited(host) { const b = this.backoff.get(host); return !!b && Date.now() < b.until; }
  /** Secondes restantes avant la fin de la pause (d'un service, ou la plus longue). */
  waitSec(host) {
    const t = Date.now(); let m = 0;
    for (const [h, b] of this.backoff) if ((!host || h === host) && b.until > t) m = Math.max(m, b.until - t);
    return Math.ceil(m / 1000);
  }
  _wait(url) { const b = this.backoff.get(hostOf(url)); return b && Date.now() < b.until ? Math.ceil((b.until - Date.now()) / 1000) : 0; }
  _strike(url, retryAfter) {
    const h = hostOf(url), b = this.backoff.get(h) || { until: 0, strikes: 0 };
    const sec = Number(retryAfter) > 0 ? Math.min(900, Number(retryAfter)) : BACKOFF[Math.min(b.strikes, BACKOFF.length - 1)];
    this.backoff.set(h, { until: Date.now() + sec * 1000, strikes: b.strikes + 1 });
    this.gapMult = Math.min(4, this.gapMult * 2); this.slowUntil = Date.now() + SLOW_MS;
    return sec;
  }
  _ok(url) { const b = this.backoff.get(hostOf(url)); if (b && b.strikes) this.backoff.set(hostOf(url), { until: 0, strikes: 0 }); }
  resetBackoff() { this.backoff.clear(); }
  async _pace(url) {
    const now = Date.now(), h = hostOf(url);
    if (now > this.slowUntil) this.gapMult = 1;
    const at = Math.max(now, this.slots.get(h) || 0);
    this.slots.set(h, at + (HOST_GAP[h] || GAP_MS) * this.gapMult);
    if (at > now) await new Promise((res) => setTimeout(res, at - now));
  }

  async _send(url, init) {
    const w = this._wait(url);
    if (w) throw Object.assign(new HttpError(url, 429, w), { backoff: true });
    await this._pace(url);
    let res = await this.fetch(url, init);
    if (res.status === 403 && res.headers.get("x-csrf-token") && init && init.method === "POST") {
      this.csrf = res.headers.get("x-csrf-token");
      init = Object.assign({}, init, { headers: Object.assign({}, init.headers, { "X-CSRF-TOKEN": this.csrf }) });
      res = await this.fetch(url, init);
    }
    if (res.status === 429) throw new HttpError(url, 429, this._strike(url, res.headers.get("retry-after")));
    if (!res.ok) throw new HttpError(url, res.status);
    this._ok(url);
    return res;
  }

  async getJson(url) { return (await this._send(url, { method: "GET", credentials: "include", headers: { Accept: "application/json" } })).json(); }

  async postJson(url, body, extraHeaders) {
    const headers = Object.assign({ "Content-Type": "application/json", Accept: "application/json" }, extraHeaders || {});
    if (this.csrf) headers["X-CSRF-TOKEN"] = this.csrf;
    return this._send(url, { method: "POST", credentials: "include", headers, body: JSON.stringify(body) });
  }

  // --- Compte ---
  async authenticated() { return this.getJson("https://users.roblox.com/v1/users/authenticated"); }
  async userById(id) { return this.getJson(`https://users.roblox.com/v1/users/${id}`); }

  async lookupNames(ids) {
    const out = {};
    const need = [];
    const now = Date.now();
    for (const id of ids.map(String)) {
      const c = this.nameCache.get(id);
      if (c && now - c.ts < 600000) out[id] = c.label; else need.push(id);
    }
    for (let i = 0; i < need.length; i += 100) {
      try {
        const j = await (await this.postJson("https://users.roblox.com/v1/users", { userIds: need.slice(i, i + 100).map(Number), excludeBannedUsers: false })).json();
        for (const u of j.data || []) {
          const l = labelOf(u);
          if (l) { out[String(u.id)] = l; this.nameCache.set(String(u.id), { label: l, ts: now }); }
        }
      } catch (e) { if (e.status === 429) break; }
    }
    return out;
  }

  async findByUsername(name) {
    const j = await (await this.postJson("https://users.roblox.com/v1/usernames/users", { usernames: [String(name)], excludeBannedUsers: false })).json();
    const u = (j.data || [])[0];
    return u ? { id: String(u.id), name: u.name, displayName: u.displayName } : null;
  }

  // --- Amis ---
  async friends(userId) {
    const res = await this.getJson(`https://friends.roblox.com/v1/users/${userId}/friends`);
    if (!Array.isArray(res.data)) throw new Error("réponse inattendue");
    const map = {};
    const missing = [];
    for (const f of res.data) {
      const l = labelOf(f);
      map[String(f.id)] = l;
      if (!l) missing.push(f.id);
    }
    if (missing.length) {
      const names = await this.lookupNames(missing);
      for (const id of missing) map[String(id)] = names[String(id)] || "";
    }
    return map;
  }

  async counts(userId) {
    const fo = (await this.getJson(`https://friends.roblox.com/v1/users/${userId}/followers/count`)).count;
    const fg = (await this.getJson(`https://friends.roblox.com/v1/users/${userId}/followings/count`)).count;
    return { fo, fg };
  }

  async requests() {
    const map = {};
    let cursor = "";
    for (let i = 0; i < 3; i++) {
      const j = await this.getJson(`https://friends.roblox.com/v1/my/friends/requests?limit=100&sortOrder=Desc${cursor ? "&cursor=" + encodeURIComponent(cursor) : ""}`);
      for (const r of j.data || []) map[String(r.id)] = labelOf(r);
      cursor = j.nextPageCursor;
      if (!cursor) break;
    }
    const missing = Object.keys(map).filter((id) => !map[id]);
    if (missing.length) { const n = await this.lookupNames(missing); for (const id of missing) map[id] = n[id] || ""; }
    return map;
  }

  // --- Détails du compte (page « Mon profil ») ---
  async profile(userId) {
    const u = await this.getJson(`https://users.roblox.com/v1/users/${userId}`);
    return { id: String(u.id), name: u.name, displayName: u.displayName || u.name, description: String(u.description || "").slice(0, 1000), created: u.created || null, banned: !!u.isBanned, verified: !!u.hasVerifiedBadge };
  }
  async countOf(url) { try { const j = await this.getJson(url); return typeof j.count === "number" ? j.count : null; } catch (e) { if (e.status === 429 || e.backoff) throw e; return null; } }
  async robux(userId) { try { const j = await this.getJson(`https://economy.roblox.com/v1/users/${userId}/currency`); return typeof j.robux === "number" ? j.robux : null; } catch (e) { if (e.status === 429 || e.backoff) throw e; return null; } }
  async premium(userId) { try { const j = await this.getJson(`https://premiumfeatures.roblox.com/v1/users/${userId}/validate-membership`); return typeof j === "boolean" ? j : null; } catch (e) { if (e.status === 429 || e.backoff) throw e; return null; } }

  // Roblox ne renvoie pas toujours les noms dans les listes : on les récupère par identifiant (100 à la fois).
  async lookupUsers(ids) {
    const out = {};
    for (let i = 0; i < ids.length; i += 100) {
      try {
        const j = await (await this.postJson("https://users.roblox.com/v1/users", { userIds: ids.slice(i, i + 100).map(Number), excludeBannedUsers: false })).json();
        for (const u of j.data || []) out[String(u.id)] = { name: String(u.name || ""), display: String(u.displayName || u.name || ""), verified: !!u.hasVerifiedBadge };
      } catch (e) { if (e.status === 429 || e.backoff) break; }
    }
    return out;
  }
  async fillNames(items) {
    const miss = items.filter((x) => !x.name || !x.display).map((x) => x.id);
    if (!miss.length) return items;
    const m = await this.lookupUsers(miss);
    for (const x of items) {
      const u = m[x.id];
      if (!u) continue;
      if (!x.name) x.name = u.name;
      if (!x.display) x.display = u.display || u.name;
      if (u.verified) x.verified = true;
    }
    return items;
  }

  // Abonnés / abonnements, 50 par page (curseur pour la suite).
  async userPage(kind, userId, cursor) {
    if (kind === "following") kind = "followings";
    if (kind !== "followers" && kind !== "followings") throw new Error("Liste inconnue.");
    const j = await this.getJson(`https://friends.roblox.com/v1/users/${userId}/${kind}?limit=50&sortOrder=Desc${cursor ? "&cursor=" + encodeURIComponent(cursor) : ""}`);
    const items = (Array.isArray(j.data) ? j.data : []).map((u) => ({ id: String(u.id), name: String(u.name || ""), display: String(u.displayName || u.name || ""), verified: !!u.hasVerifiedBadge }));
    await this.fillNames(items);
    return { items, next: j.nextPageCursor ? String(j.nextPageCursor) : "" };
  }
  // Demandes d'ami reçues, avec la date d'envoi et le nombre d'amis en commun quand Roblox les donne.
  async requestPage(cursor) {
    const j = await this.getJson(`https://friends.roblox.com/v1/my/friends/requests?limit=50&sortOrder=Desc${cursor ? "&cursor=" + encodeURIComponent(cursor) : ""}`);
    const items = (Array.isArray(j.data) ? j.data : []).map((r) => ({ id: String(r.id), name: String(r.name || ""), display: String(r.displayName || r.name || ""), sent: r.friendRequest && r.friendRequest.sentAt ? String(r.friendRequest.sentAt) : null, mutual: Array.isArray(r.mutualFriendsList) ? r.mutualFriendsList.length : null }));
    await this.fillNames(items);
    return { items, next: j.nextPageCursor ? String(j.nextPageCursor) : "" };
  }
  async answerRequest(userId, accept) {
    if (!/^\d{1,19}$/.test(String(userId))) throw new Error("Identifiant invalide.");
    await this.postJson(`https://friends.roblox.com/v1/users/${userId}/${accept ? "accept" : "decline"}-friend-request`, {});
    return true;
  }

  // --- Présence ---
  async presence(ids) {
    const out = {};
    for (let i = 0; i < ids.length; i += PRESENCE_CHUNK) {
      const j = await (await this.postJson("https://presence.roblox.com/v1/presence/users", { userIds: ids.slice(i, i + PRESENCE_CHUNK).map(Number) })).json();
      for (const p of j.userPresences || []) {
        const pid = p.rootPlaceId || p.placeId;
        out[String(p.userId)] = {
          // lastLocation vaut « Website » (ou le nom du site) hors jeu : on ne garde le lieu que pour « En jeu »
          type: p.userPresenceType, place: p.userPresenceType === 2 ? p.lastLocation || "" : "", pid: p.userPresenceType === 2 && pid ? String(pid) : "",
          // placeId / gameId exacts : uniquement pour « Rejoindre », jamais enregistrés (ils changent sans cesse)
          pl: p.placeId ? String(p.placeId) : "", gid: p.gameId ? String(p.gameId) : ""
        };
      }
    }
    return out;
  }

  // Noms des jeux à partir de leurs placeId (nécessite la session du compte).
  async placeNames(ids) {
    const out = {};
    const list = ids.map(String).filter((x) => /^\d+$/.test(x)).slice(0, 50);
    if (!list.length) return out;
    try {
      const j = await this.getJson("https://games.roblox.com/v1/games/multiget-place-details?" + list.map((i) => "placeIds=" + i).join("&"));
      for (const p of Array.isArray(j) ? j : []) if (p && p.placeId && p.name) out[String(p.placeId)] = String(p.name).slice(0, 80);
    } catch (_) {}
    return out;
  }

  async placeIcons(ids) {
    const out = {};
    const list = ids.map(String).filter((x) => /^\d+$/.test(x)).slice(0, 100);
    if (!list.length) return out;
    try {
      const j = await this.getJson(`https://thumbnails.roblox.com/v1/places/gameicons?placeIds=${list.join(",")}&returnPolicy=PlaceHolder&size=150x150&format=Png&isCircular=false`);
      for (const d of j.data || []) if (d.imageUrl && d.state === "Completed") out[String(d.targetId)] = d.imageUrl;
    } catch (_) {}
    return out;
  }

  // --- Découverte de jeux ---
  // Normalise un jeu renvoyé par les API « games » de Roblox (les champs varient légèrement selon le point d'accès).
  static normGame(g) {
    if (!g || typeof g !== "object") return null;
    const pid = g.placeId || g.rootPlaceId;
    if (!pid || !g.name) return null;
    const up = Number(g.totalUpVotes) || 0, down = Number(g.totalDownVotes) || 0;
    return {
      pid: String(pid), uid: g.universeId ? String(g.universeId) : "", name: String(g.name).slice(0, 80),
      players: Number(g.playerCount) || 0, likes: up + down >= 50 ? Math.round((up / (up + down)) * 100) : null
    };
  }

  // Essaie plusieurs formes d'URL : Roblox a changé le préfixe des paramètres (« model. ») selon les versions.
  async _tryJson(urls) {
    let last = null;
    for (const u of urls) {
      try { return await this.getJson(u); } catch (e) { last = e; if (e.status === 429 || e.backoff) break; }
    }
    throw last || new Error("réponse inattendue");
  }

  // Nouvelle API « explore » du site Roblox (l'ancien /v1/games/sorts renvoie 404). Si elle échoue, repli sur l'ancienne.
  async gameSorts() {
    const sid = this.sid;
    const norm = (x) => ({ token: String(x.sortId || x.token || ""), name: String(x.sortId || x.name || ""), title: String(x.sortDisplayName || x.displayName || x.name || ""), games: Array.isArray(x.games) ? x.games.map(RobloxClient.normGame).filter(Boolean) : [], kind: String(x.contentType || "Games") });
    try {
      const j = await this.getJson(`https://apis.roblox.com/explore-api/v1/get-sorts?sessionId=${sid}&device=computer&country=all`);
      const list = (Array.isArray(j.sorts) ? j.sorts : []).map(norm).filter((x) => x.token && /games/i.test(x.kind));
      if (list.length) { this._sid = sid; this._explore = true; return list; }
    } catch (e) { if (e.status === 429 || e.backoff) throw e; this._exploreErr = e.message; }
    this._explore = false;
    const j = await this._tryJson([
      "https://games.roblox.com/v1/games/sorts?gameSortsContext=GamesDefaultSorts",
      "https://games.roblox.com/v1/games/sorts?model.gameSortsContext=GamesDefaultSorts"
    ]);
    return (Array.isArray(j.sorts) ? j.sorts : []).filter((x) => x && x.token).map(norm);
  }

  async gamesBySort(sort, max = 18) {
    const token = typeof sort === "string" ? sort : sort.token;
    if (this._explore) {
      if (sort.games && sort.games.length) return sort.games.slice(0, max);
      const j = await this.getJson(`https://apis.roblox.com/explore-api/v1/get-sort-content?sessionId=${this._sid}&sortId=${encodeURIComponent(token)}&device=computer&country=all`);
      return (j.games || []).map(RobloxClient.normGame).filter(Boolean).slice(0, max);
    }
    const t = encodeURIComponent(token);
    const j = await this._tryJson([
      `https://games.roblox.com/v1/games/list?sortToken=${t}&maxRows=${max}&startRows=0`,
      `https://games.roblox.com/v1/games/list?model.sortToken=${t}&model.maxRows=${max}&model.startRows=0`
    ]);
    return (j.games || j.data || []).map(RobloxClient.normGame).filter(Boolean);
  }

  get sid() { return this._sid || (this._sid = require("crypto").randomUUID()); }

  // Page complète d'un classement (« Tout voir ») avec curseur pour charger la suite.
  async sortContent(token, pageToken) {
    const u = `https://apis.roblox.com/explore-api/v1/get-sort-content?sessionId=${this.sid}&sortId=${encodeURIComponent(token)}&device=computer&country=all` + (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : "");
    const j = await this.getJson(u);
    return { games: (j.games || []).map(RobloxClient.normGame).filter(Boolean), next: j.nextPageToken ? String(j.nextPageToken) : "" };
  }

  // Recherche dans tous les jeux (même moteur que le site).
  async searchGames(q, pageToken) {
    const u = `https://apis.roblox.com/search-api/omni-search?searchQuery=${encodeURIComponent(q)}&sessionId=${this.sid}&pageType=all` + (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : "");
    const j = await this.getJson(u);
    const games = [];
    for (const grp of j.searchResults || []) {
      if (!/game/i.test(String(grp.contentGroupType || ""))) continue;
      for (const c of grp.contents || []) {
        const g = RobloxClient.normGame({ placeId: c.rootPlaceId, universeId: c.contentId, name: c.name, playerCount: c.playerCount, totalUpVotes: c.totalUpVotes, totalDownVotes: c.totalDownVotes });
        if (g) games.push(g);
      }
    }
    return { games, next: j.nextPageToken ? String(j.nextPageToken) : "" };
  }

  async universeOf(placeId) {
    const j = await this.getJson(`https://apis.roblox.com/universes/v1/places/${encodeURIComponent(placeId)}/universe`);
    return j && j.universeId ? String(j.universeId) : "";
  }

  async similarGames(universeId, max = 12) {
    const j = await this.getJson(`https://games.roblox.com/v1/games/recommendations/game/${encodeURIComponent(universeId)}?maxRows=${max}`);
    return (j.games || []).map(RobloxClient.normGame).filter(Boolean);
  }

  // --- Chat Roblox (conversations privées et de groupe) ---
  // La boîte de réception « messages privés » entre joueurs a été supprimée par Roblox (2024) : seul le chat existe encore.
  static normChat(c, meId) {
    if (!c || c.id == null) return null;
    const me = String(meId);
    const users = {};
    const raw = c.user_data && typeof c.user_data === "object" ? c.user_data : {};
    for (const [id, u] of Object.entries(raw)) {
      if (!u || typeof u !== "object") continue;
      const name = String(u.name || ""), display = String(u.display_name || u.combined_name || u.name || "");
      users[String(id)] = { name, display: display || name, verified: !!u.is_verified };
    }
    const ids = (Array.isArray(c.participant_user_ids) ? c.participant_user_ids : []).map(String);
    const others = ids.filter((i) => i !== me);
    const label = (i) => (users[i] && (users[i].display || users[i].name)) || "Joueur " + i;
    const group = String(c.type || "") === "group";
    let title = group && c.name && !c.is_default_name ? String(c.name) : others.slice(0, 3).map(label).join(", ") + (others.length > 3 ? "…" : "");
    if (!title) title = "Conversation";
    const last = c.preview_message || (Array.isArray(c.messages) && c.messages.length ? c.messages.slice().sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0))[0] : null);
    const pm = last && !last.is_deleted ? last : null;
    return {
      id: String(c.id), group, title: title.slice(0, 80), users, count: ids.length, other: group ? "" : others[0] || "",
      unread: Math.max(0, Number(c.unread_message_count) || 0),
      updated: Date.parse(c.updated_at) || Date.parse(c.created_at) || 0,
      preview: pm ? String(pm.content || "").slice(0, 120) : "", previewMine: !!pm && String(pm.sender_user_id) === me
    };
  }
  static normChatMessage(m, meId) {
    if (!m || m.id == null) return null;
    return {
      id: String(m.id), from: String(m.sender_user_id), mine: String(m.sender_user_id) === String(meId),
      text: m.is_deleted ? "" : String(m.content || "").slice(0, 2000), deleted: !!m.is_deleted,
      ts: Date.parse(m.created_at) || 0
    };
  }
  static chatId(id) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(id))) throw new Error("Conversation invalide.");
    return String(id);
  }
  async chatUnread() {
    const j = await this.getJson("https://apis.roblox.com/platform-chat-api/v1/get-conversation-metadata");
    return Math.max(0, Number(j && j.global_unread_count) || 0);
  }
  async chatConversations(meId, cursor) {
    const j = await this.getJson("https://apis.roblox.com/platform-chat-api/v1/get-user-conversations?include_user_data=true&pageSize=30" + (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""));
    const items = (Array.isArray(j.conversations) ? j.conversations : []).map((c) => RobloxClient.normChat(c, meId)).filter(Boolean);
    items.sort((a, b) => b.updated - a.updated);
    return { items, next: j.next_cursor ? String(j.next_cursor) : "" };
  }
  async chatMessages(meId, id, cursor) {
    id = RobloxClient.chatId(id);
    const j = await this.getJson("https://apis.roblox.com/platform-chat-api/v1/get-conversation-messages?conversation_id=" + encodeURIComponent(id) + "&pageSize=30" + (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""));
    const items = (Array.isArray(j.messages) ? j.messages : []).map((m) => RobloxClient.normChatMessage(m, meId)).filter(Boolean);
    items.sort((a, b) => a.ts - b.ts);
    return { items, next: j.next_cursor ? String(j.next_cursor) : "" };
  }
  async chatSend(meId, id, text) {
    id = RobloxClient.chatId(id);
    text = String(text == null ? "" : text).trim();
    if (!text) throw new Error("Le message est vide.");
    if (text.length > 500) throw new Error("Message trop long (500 caractères maximum).");
    const res = await this.postJson("https://apis.roblox.com/platform-chat-api/v1/send-messages", { conversation_id: id, messages: [{ content: text }] });
    let j = {};
    try { j = await res.json(); } catch (_) {}
    const items = (Array.isArray(j.messages) ? j.messages : []).map((m) => RobloxClient.normChatMessage(m, meId)).filter(Boolean);
    return { items };
  }
  async chatMarkRead(id) {
    id = RobloxClient.chatId(id);
    await this.postJson("https://apis.roblox.com/platform-chat-api/v1/mark-conversations", { conversation_ids: [id] });
    return true;
  }

  async avatars(ids) {
    const out = {};
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      try {
        const j = await this.getJson(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${chunk.join(",")}&size=150x150&format=Png&isCircular=false`);
        for (const d of j.data || []) if (d.imageUrl) out[String(d.targetId)] = d.imageUrl;
      } catch (_) {}
    }
    return out;
  }

  /** Dernière version publique du client Windows (API officielle, sans compte). `guid` = nom du dossier installé (version-xxxx). */
  async clientVersion(binary = "WindowsPlayer") {
    if (!/^[A-Za-z0-9]{3,30}$/.test(String(binary))) throw new Error("Type de client invalide.");
    const j = await this.getJson(`https://clientsettings.roblox.com/v2/client-version/${binary}`);
    const guid = j && String(j.clientVersionUpload || "");
    if (!/^version-[0-9a-f]{8,32}$/i.test(guid)) throw new Error("Réponse de version inattendue.");
    return { guid, version: String(j.version || "") };
  }

  // Ticket d'authentification à usage unique, utilisé pour lancer le client Roblox avec CE compte.
  // Roblox exige un Referer. Chromium refuse de le fixer depuis le processus principal (« invalid referrer ») :
  // on envoie donc l'en-tête neutre X-Batblox-Referer, que la session convertit en vrai Referer/Origin juste avant l'envoi
  // (voir main.js). Repli : la même requête exécutée depuis une page roblox.com cachée, comme le fait le site.
  async authTicket(referer) {
    const url = "https://auth.roblox.com/v1/authentication-ticket";
    const ref = referer || "https://www.roblox.com/home";
    const common = { "Content-Type": "application/json", RBXAuthenticationNegotiation: "1", "X-Batblox-Referer": ref };
    const hdrs = (csrf) => Object.assign({}, common, csrf ? { "X-CSRF-TOKEN": csrf } : {});
    const pick = (get) => ({ "x-csrf-token": get("x-csrf-token"), "rbx-authentication-ticket": get("rbx-authentication-ticket"), "retry-after": get("retry-after") });
    const viaFetch = (csrf) => this.fetch(url, { method: "POST", credentials: "include", headers: hdrs(csrf), body: "{}" })
      .then((res) => ({ status: res.status, headers: pick((k) => res.headers.get(k)) }));
    const viaRaw = (csrf) => this.raw({ url, method: "POST", headers: hdrs(csrf), body: "{}" });
    const viaPage = () => this.page({ url }).then((x) => { if (x.error) throw new Error(x.error); return x; }).then((x) => ({ status: x.status, headers: pick((k) => ({ "x-csrf-token": x.csrf, "rbx-authentication-ticket": x.ticket, "retry-after": x.retry })[k] || null) }));
    const methods = [["fetch", viaFetch]];
    if (this.raw) methods.push(["requête brute", viaRaw]);
    if (this.page) methods.push(["page cachée", viaPage]);

    const w = this._wait(url);
    if (w) throw new HttpError(url, 429, w);
    const errors = []; let httpErr = null;
    for (const [name, m] of methods) {
      try {
        await this._pace(url);
        let r = await m(this.csrf);
        if (r.status === 403 && r.headers["x-csrf-token"]) { this.csrf = r.headers["x-csrf-token"]; r = await m(this.csrf); }
        if (r.status === 429) throw new HttpError(url, 429, this._strike(url, r.headers["retry-after"]));
        if (r.status >= 200 && r.status < 300) {
          const t = r.headers["rbx-authentication-ticket"];
          if (t) { this._ok(url); return t; }
          errors.push(name + " : réponse " + r.status + " sans ticket");
        } else { httpErr = httpErr || new HttpError(url, r.status); errors.push(name + " : HTTP " + r.status); }
      } catch (e) { if (e.status === 429) throw e; errors.push(name + " : " + String(e && e.message || e).slice(0, 140)); }
    }
    // Toutes les méthodes ont échoué : on garde le détail de chacune (affiché dans le test de connexion et le journal).
    throw Object.assign(new Error(errors.join(" | ")), httpErr ? { status: httpErr.status } : {});
  }

  async latestClientVersion() {
    const j = await this.getJson("https://clientsettingscdn.roblox.com/v2/client-version/WindowsPlayer");
    return j.clientVersionUpload || j.version || null;
  }
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}

module.exports = { RobloxClient, HttpError, labelOf, pool };

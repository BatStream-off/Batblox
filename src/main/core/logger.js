"use strict";
const fs = require("fs");
const path = require("path");
const { scrub } = require("./security");

class Logger {
  constructor(dir, maxBytes = 512 * 1024) {
    this.file = path.join(dir, "batblox.log");
    this.max = maxBytes;
    fs.mkdirSync(dir, { recursive: true });
    try { if (fs.statSync(this.file).size > this.max) fs.renameSync(this.file, this.file + ".old"); } catch (_) {}
  }
  _w(level, msg) {
    const line = `${new Date().toISOString()} [${level}] ${scrub(msg)}\n`;
    try { fs.appendFileSync(this.file, line); } catch (_) {}
  }
  info(m) { this._w("info", m); }
  warn(m) { this._w("avert", m); }
  error(m) { this._w("erreur", m && m.stack ? m.stack : m); }
  tail(n = 200) {
    try { return fs.readFileSync(this.file, "utf8").split("\n").filter(Boolean).slice(-n); } catch (_) { return []; }
  }
}
module.exports = { Logger };

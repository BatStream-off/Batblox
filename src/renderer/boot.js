"use strict";
(async function () {
  try {
    const init = await B.call("app:init");
    Object.assign(B.S, { settings: init.settings, accounts: init.accounts, active: init.active, snap: init.snapshot, version: init.version, windows: init.windows, encryption: init.encryption, unread: 0 });
  } catch (e) {
    document.body.textContent = "Impossible de démarrer l'interface : " + e.message;
    return;
  }
  B.applyAppearance();
  window.batblox.on(B.onEvent);
  window.addEventListener("mousemove", (e) => { const r = document.documentElement.style; r.setProperty("--mx", e.clientX + "px"); r.setProperty("--my", e.clientY + "px"); }, { passive: true });
  B.renderNav(); B.renderAccount(); B.renderStatus();
  B.go(B.S.active ? "home" : "accounts");
  setInterval(() => { B.renderStatus(); }, 30000);
  setTimeout(() => B.pollChat(), 4000);
  setInterval(() => { if (B.page !== "messages") B.pollChat(); }, 180000);
})();

"use strict";
(async function () {
  // Signale à l'intro vidéo que l'interface est rendue : elle peut alors s'effacer sur un écran prêt (ou après erreur).
  const ready = () => { window.__bbReady = true; window.dispatchEvent(new Event("batblox:ready")); };
  try {
    const init = await B.call("app:init");
    Object.assign(B.S, { settings: init.settings, accounts: init.accounts, active: init.active, snap: init.snapshot, version: init.version, windows: init.windows, encryption: init.encryption, unread: 0 });
  } catch (e) {
    document.body.textContent = "Impossible de démarrer l'interface : " + e.message;
    ready();
    return;
  }
  B.applyAppearance();
  window.batblox.on(B.onEvent);
  // Lueur qui suit la souris : une mise à jour par image au plus, et aucune pendant l'intro (chaque écriture recalcule le style de toute la page).
  let mx = 0, my = 0, mq = 0;
  const root = document.documentElement;
  const paintGlow = () => { mq = 0; root.style.setProperty("--mx", mx + "px"); root.style.setProperty("--my", my + "px"); };
  window.addEventListener("mousemove", (e) => { mx = e.clientX; my = e.clientY; if (!mq && !root.classList.contains("intro-on")) mq = requestAnimationFrame(paintGlow); }, { passive: true });
  B.renderNav(); B.renderAccount(); B.renderStatus();
  B.go(B.S.active ? (B.S.settings.appearance.startPage || "home") : "accounts"); // page d'ouverture choisie dans les réglages
  ready();
  setInterval(() => { B.renderStatus(); }, 30000);
  setTimeout(() => B.pollChat(), 4000);
  setInterval(() => { if (B.page !== "messages") B.pollChat(); }, 180000);
})();

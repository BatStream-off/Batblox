"use strict";
// Barre de titre personnalisée : boutons réduire / agrandir-restaurer / fermer reliés à la fenêtre principale.
// Le glisser-déposer et le double-clic (agrandir) sont gérés par la zone `-webkit-app-region: drag` du CSS.
(function () {
  const bar = document.getElementById("titlebar");
  if (!bar || !window.batblox) return;
  const call = (name) => window.batblox.call(name).catch(() => null);
  const maxBtn = bar.querySelector('[data-act="max"]');
  function setMax(m) {
    bar.classList.toggle("is-max", !!m);
    const label = m ? "Restaurer" : "Agrandir";
    maxBtn.title = label; maxBtn.setAttribute("aria-label", label);
  }
  bar.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    call(b.dataset.act === "min" ? "win:minimize" : b.dataset.act === "max" ? "win:toggleMax" : "win:close");
  });
  window.batblox.on((evt, payload) => { if (evt === "winstate") setMax(payload && payload.maximized); });
  call("win:state").then((s) => { if (s) setMax(s.maximized); });
  window.addEventListener("blur", () => bar.classList.add("blur"));
  window.addEventListener("focus", () => bar.classList.remove("blur"));
})();

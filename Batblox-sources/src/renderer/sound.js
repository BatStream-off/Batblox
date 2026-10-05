"use strict";
// Son de clic léger : une petite note douce et très courte, entièrement synthétisée (Web Audio).
// Aucun fichier audio, aucun réseau. Réglages : appearance.clickSound (on/off) et appearance.clickVolume (0–100).
B.sound = (() => {
  let ctx = null, master = null, last = 0;
  const api = { enabled: true, volume: 0.4 };

  const ensure = () => {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC({ latencyHint: "interactive" });
      master = ctx.createGain();
      const lp = ctx.createBiquadFilter(); // adoucit les aigus : son « rond », jamais agressif
      lp.type = "lowpass"; lp.frequency.value = 5200;
      master.connect(lp); lp.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    master.gain.value = Math.max(0, Math.min(1, api.volume)) * 0.45;
    return ctx;
  };

  // Une note : sinus à attaque rapide et chute douce.
  const note = (t, f0, f1, peak, len, type) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + len * 0.6);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + len + 0.02);
  };

  const KINDS = {
    click: (t, v) => note(t, 760 * v, 980 * v, 0.17, 0.05),
    soft:  (t, v) => note(t, 900 * v, 900 * v, 0.10, 0.035),
    pri:   (t, v) => { note(t, 700 * v, 900 * v, 0.15, 0.055); note(t + 0.032, 1050 * v, 1050 * v, 0.09, 0.06); },
    on:    (t, v) => { note(t, 620 * v, 760 * v, 0.14, 0.05); note(t + 0.04, 930 * v, 1000 * v, 0.10, 0.06); },
    off:   (t, v) => note(t, 640 * v, 440 * v, 0.14, 0.07),
    bad:   (t, v) => note(t, 330 * v, 240 * v, 0.17, 0.09, "triangle")
  };

  api.play = (kind, force) => {
    if (!api.enabled && !force) return;
    if (api.volume <= 0) return;
    const now = performance.now();
    if (now - last < 40) return; // un seul son par geste
    last = now;
    try {
      if (!ensure()) return;
      const v = 1 + (Math.random() - 0.5) * 0.05; // très légère variation
      (KINDS[kind] || KINDS.click)(ctx.currentTime + 0.002, v);
    } catch (_) {}
  };

  const isOff = (el) => el.disabled || el.getAttribute("aria-disabled") === "true" || el.dataset.noSound === "1";
  const kindOf = (el) => (el.closest(".btn.bad") ? "bad" : el.closest(".btn.pri") ? "pri" : el.closest("nav button, .chip, .acc-btn, .dots, .acc-row, .menu button, .modal .x") ? "soft" : "click");
  const SEL = "button, .chip, [role=button], [role=menuitem], summary, a[href], .acc-row";

  document.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const el = e.target.closest && e.target.closest(SEL);
    if (!el || isOff(el)) return;
    api.play(kindOf(el));
  }, true);
  document.addEventListener("click", (e) => { // clavier (Entrée / Espace) : detail = 0
    if (e.detail !== 0) return;
    const el = e.target.closest && e.target.closest(SEL);
    if (!el || isOff(el)) return;
    api.play(kindOf(el));
  }, true);
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (!t || !t.matches) return;
    if (t.matches("input[type=checkbox]")) {
      if (t.dataset.soundPref) { if (t.checked) api.play("on", true); return; }
      api.play(t.checked ? "on" : "off");
    } else if (t.matches("select")) api.play("soft");
  }, true);

  return api;
})();

"use strict";
// Intro vidéo de lancement (v1.5.8 : lecture fluide).
//  - Première chose visible : le calque #intro (z-index maximal, fond bleu opaque = première image de la vidéo) recouvre TOUT.
//  - L'interface est construite et DESSINÉE sous le calque AVANT que la vidéo ne démarre (pré-roulage) : tout le coût de
//    démarrage (scripts, mise en page, premier rendu, rastérisation des fonds) tombe pendant que l'écran affiche un aplat bleu.
//    Ensuite, pendant la lecture, plus rien ne bouge dessous : animations CSS en pause, aucune modification du DOM, éclairs coupés.
//    (Avant : la vidéo démarrait pendant le chargement de l'interface, puis l'interface était dévoilée sous la vidéo 1 s avant la fin
//    et la classe de <html> était réécrite à chaque image : trois saccades visibles.)
//  - Lecture automatique avec le son d'origine, sans contrôles, une seule fois. Fondu enchaîné sur l'interface déjà prête.
//  - Garde-fous : si la vidéo ne se charge pas / ne démarre pas / plante / se fige, on passe à l'interface au lieu de la bloquer.
//  - main.js ajoute ?intro=1 uniquement au premier lancement (pas en démarrage réduit) : sinon le calque est retiré aussitôt.
(function () {
  const box = document.getElementById("intro");
  const v = document.getElementById("intro-video");
  if (!box || !v) return;
  const root = document.documentElement;

  if (!/[?&]intro=1(?:&|$)/.test(location.search)) { v.removeAttribute("src"); v.load(); box.remove(); return; } // pas d'intro : on annule aussi le chargement de la vidéo

  root.classList.add("intro-on"); // animations de l'interface en pause sous le calque (voir index.html)

  const FADE_MS = 900;            // durée du fondu enchaîné
  const LEAD_S = 0.45;            // le fondu démarre un peu avant la fin : l'audio, lui, va au bout sans être coupé
  const PREROLL_MAX_MS = 2500;    // attente maximale (vidéo chargée + interface dessinée) avant de lancer quand même la lecture
  const START_TIMEOUT_MS = 4000;  // la lecture n'a pas démarré après play() : on renonce à l'intro
  const READY_TIMEOUT_MS = 4000;  // l'interface n'est pas prête à la fin : on n'attend pas davantage
  const reduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false;

  let state = "preroll"; // preroll → starting → playing → leaving → done
  let startTimer = 0, endTimer = 0, prerollTimer = 0, raf = 0;

  // Interface inerte pendant l'intro : ni clic, ni Tab, ni lecteur d'écran n'atteignent ce qui est derrière le calque.
  const setInert = (on) => { for (const id of ["app", "layer", "toasts"]) { const el = document.getElementById(id); if (el) el.toggleAttribute("inert", on); } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { if (state !== "done" && state !== "leaving") setInert(true); }, { once: true });
  else setInert(true);

  const isReady = () => window.__bbReady === true;
  function whenReady(cb, ms) {
    if (isReady()) return cb();
    let fired = false, t = 0;
    const go = () => { if (fired) return; fired = true; clearTimeout(t); window.removeEventListener("batblox:ready", go); cb(); };
    t = setTimeout(go, ms);
    window.addEventListener("batblox:ready", go);
  }
  const nextPaint = (cb) => requestAnimationFrame(() => requestAnimationFrame(cb)); // après le prochain rendu effectif

  function done() {
    if (state === "done") return;
    state = "done";
    clearTimeout(startTimer); clearTimeout(endTimer); clearTimeout(prerollTimer); cancelAnimationFrame(raf);
    setInert(false); root.classList.remove("intro-on", "intro-fade");
    try { v.pause(); v.removeAttribute("src"); v.load(); } catch (_) { /* libère le décodeur */ }
    box.remove();
    try { window.batblox && window.batblox.call("intro:done").catch(() => {}); } catch (_) { /* fond de fenêtre = couleur du thème */ }
    const view = document.getElementById("view");
    if (view && (!document.activeElement || document.activeElement === document.body)) view.focus({ preventScroll: true });
  }

  /** Apparition douce d'un élément de l'interface (animation Web, compositeur : opacité / translation uniquement). */
  function rise(el, delay, dy) {
    if (!el || !el.animate) return;
    const from = { opacity: 0 }; if (dy) from.transform = "translateY(" + dy + "px)";
    el.animate([from, { opacity: 1, transform: "none" }], { duration: 480, delay, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" });
  }

  function leave(quick) {
    if (state === "leaving" || state === "done") return;
    state = "leaving";
    cancelAnimationFrame(raf); clearTimeout(endTimer); clearTimeout(startTimer); clearTimeout(prerollTimer);
    // L'interface est en général prête depuis longtemps. Sinon on garde la dernière image (aplat bleu) le temps qu'elle le soit.
    whenReady(() => {
      if (state !== "leaving") return;
      const simple = quick || reduce || root.dataset.anim === "0" || root.dataset.potato === "1";
      const ms = quick ? 450 : simple ? 650 : FADE_MS;

      // L'interface devient utilisable tout de suite, même pendant le fondu.
      box.style.pointerEvents = "none"; box.style.webkitAppRegion = "no-drag";
      setInert(false);
      // Le décor animé (pluie, faisceau, brouillard, chakra…) reste figé pendant le fondu et repart juste après : le fondu reste fluide.
      root.classList.add("intro-fade");
      root.classList.remove("intro-on");

      if (!simple) {
        rise(document.getElementById("titlebar"), 200, 0);
        rise(document.getElementById("nav"), 240, 0);
        const page = document.querySelector("#view .page");
        if (page) Array.prototype.forEach.call(page.children, (el, i) => { if (i < 7) rise(el, 300 + i * 55, 12); });
      }

      const a = box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" });
      a.onfinish = done; a.oncancel = done;
      setTimeout(done, ms + 800); // garde-fou
    }, READY_TIMEOUT_MS);
  }

  // ---------- Lecture ----------
  v.controls = false; v.loop = false; v.defaultMuted = false; v.muted = false; v.volume = 1;

  // Fin de lecture surveillée image par image (timeupdate n'arrive qu'environ 4 fois par seconde). Lecture seule : aucune écriture dans le DOM.
  function watch() {
    if (state !== "playing") return;
    if (v.duration && v.duration - v.currentTime <= LEAD_S) { leave(false); return; }
    raf = requestAnimationFrame(watch);
  }
  v.addEventListener("playing", () => {
    if (state !== "starting") return;
    state = "playing";
    clearTimeout(startTimer);
    endTimer = setTimeout(() => leave(false), ((v.duration || 5) + 4) * 1000); // filet : la vidéo se fige ou n'envoie plus de fin
    raf = requestAnimationFrame(watch);
  });
  v.addEventListener("ended", () => leave(false));
  v.addEventListener("error", () => leave(true));
  // Pas de pause possible (touche média du clavier, etc.) : une intro ne se met pas en pause.
  v.addEventListener("pause", () => { if (state === "playing" && !v.ended) v.play().catch(() => {}); });

  function start() {
    if (state !== "preroll") return;
    state = "starting";
    clearTimeout(prerollTimer);
    startTimer = setTimeout(() => leave(true), START_TIMEOUT_MS);
    const p = v.play();
    if (p && typeof p.catch === "function") {
      p.catch(() => { // lecture avec son refusée : mieux vaut l'intro sans le son que pas d'intro
        if (state !== "starting") return;
        v.muted = true;
        const q = v.play();
        if (q && typeof q.catch === "function") q.catch(() => leave(true));
      });
    }
  }

  // Pré-roulage : on attend que la vidéo soit assez chargée pour aller au bout sans à-coup ET que l'interface soit construite
  // puis réellement dessinée (deux images plus tard). Le tout est plafonné : au pire, la lecture démarre après PREROLL_MAX_MS.
  let videoOk = false, uiOk = false;
  const maybeStart = () => { if (videoOk && uiOk) nextPaint(start); };
  const onVideo = () => { if (videoOk) return; videoOk = true; maybeStart(); };
  if (v.error) { leave(true); return; } // erreur survenue avant que l'écouteur « error » existe (le script attend la feuille de style)
  if (v.readyState >= 4) onVideo(); else { v.addEventListener("canplaythrough", onVideo, { once: true }); }
  whenReady(() => { uiOk = true; maybeStart(); }, PREROLL_MAX_MS);
  prerollTimer = setTimeout(() => { if (state === "preroll") { if (v.readyState >= 3) start(); else leave(true); } }, PREROLL_MAX_MS + 1500);
})();

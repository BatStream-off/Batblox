"use strict";
// Éclairs de l'orage de Gotham (thème Batman, interrupteur « Effets »).
// Même principe et même emplacement qu'avant (ciel, derrière les toits, sous l'interface) : seul le rendu change.
//  - Chaque éclair est un tracé procédural unique (position, longueur, inclinaison, ramifications, épaisseur, intensité, distance) :
//    déplacement du point milieu récursif + branches primaires / secondaires / brindilles, jamais deux fois la même forme.
//  - Le tracé est dessiné UNE fois dans un petit canvas (boîte englobante) : cœur blanc, halo bleuté en 3 couches floutées.
//  - L'animation ne touche qu'à l'opacité (WAAPI, compositeur GPU) : aucun redessin pendant le flash, aucune boucle rAF.
//  - Le flash éclaire le ciel, les nuages, la pluie et les toits (calques existants du bloc #bat-signal), puis s'éteint ;
//    certains éclairs ont un second (voire un troisième) coup quelques dizaines de ms plus tard.
//  - Rien ne tourne hors des instants d'éclair : un seul setTimeout. Inactif si Effets / animations coupés, mode économe,
//    mouvement réduit ou fenêtre cachée.
(function () {
  const root = document.documentElement;
  const storm = document.querySelector("#bat-signal .bs-storm");
  if (!storm) return;
  const cv = storm.querySelector(".bs-bolt");
  const glow = storm.querySelector(".bs-glow");
  const clouds = storm.querySelector(".bs-cloudlit");
  const rain = storm.querySelector(".bs-rainlit");
  const city = document.querySelector("#bat-signal .bs-citylit");
  if (!cv || !glow || !clouds || !rain || !cv.getContext || !cv.animate) return;
  const ctx = cv.getContext("2d");
  const reduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  const hasFilter = "filter" in ctx;

  // ---------- Utilitaires ----------
  const rnd = (a, b) => a + Math.random() * (b - a);
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; // ≈ [-1, 1], cloche
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const mk = () => document.createElement("canvas");
  const tmpFull = mk(), tmpHalf = mk(), halo = mk();

  const active = () =>
    !document.hidden && root.dataset.theme === "batman" && root.dataset.fx !== "0" && root.dataset.lightning !== "0" && root.dataset.anim !== "0" &&
    root.dataset.potato !== "1" && !reduce.matches;

  // ---------- Géométrie ----------
  /** Polyligne irrégulière de a à b : déplacement récursif du point milieu (grandes cassures puis détails fins). */
  function jagged(ax, ay, bx, by, rough, minLen) {
    const pts = [[ax, ay]];
    (function sub(x0, y0, x1, y1, depth) {
      const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
      if (len <= minLen || depth > 12) { pts.push([x1, y1]); return; }
      const t = 0.5 + (Math.random() - 0.5) * 0.3;
      const off = gauss() * len * rough * (len > 60 ? 1.15 : 0.85);
      const mx = x0 + dx * t - (dy / len) * off, my = y0 + dy * t + (dx / len) * off;
      sub(x0, y0, mx, my, depth + 1); sub(mx, my, x1, y1, depth + 1);
    })(ax, ay, bx, by, 0);
    // micro-irrégularité : casse tout alignement parfait
    for (let i = 1; i < pts.length - 1; i++) { pts[i][0] += (Math.random() - 0.5) * 1.6; pts[i][1] += (Math.random() - 0.5) * 1.2; }
    return pts;
  }

  /** Trace avec dérive latérale (errance à grande échelle) : un éclair n'est jamais un trait droit. */
  function wandering(ax, ay, bx, by, steps, drift, rough, minLen) {
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    const way = [[ax, ay]];
    let lat = 0;
    for (let i = 1; i < steps; i++) {
      lat = lat * 0.55 + gauss() * len * drift;
      const t = i / steps + (Math.random() - 0.5) * (0.5 / steps);
      way.push([ax + dx * t + nx * lat, ay + dy * t + ny * lat]);
    }
    way.push([bx, by]);
    let out = [];
    for (let i = 0; i < way.length - 1; i++) {
      const seg = jagged(way[i][0], way[i][1], way[i + 1][0], way[i + 1][1], rough, minLen);
      out = out.length ? out.concat(seg.slice(1)) : seg;
    }
    return out;
  }

  /** Construit un éclair complet : { branches: [{ pts, lv, w, fade }], bbox }. */
  function build(W, H, s) {
    const groundY = H - rnd(72, 105); // le tracé finit toujours derrière les toits de la skyline (jamais en plein ciel)
    const fromTop = Math.random() < 0.62;
    const x0 = rnd(0.07, 0.66) * W;
    const y0 = fromTop ? -12 : rnd(0.03, 0.13) * H;
    const reach = 1;
    const y1 = y0 + (groundY - y0) * reach;
    const x1 = x0 + rnd(-0.13, 0.13) * W;
    const len = Math.hypot(x1 - x0, y1 - y0);
    const br = [];
    const trunk = wandering(x0, y0, x1, y1, Math.round(rnd(4, 8)), rnd(0.03, 0.065), rnd(0.15, 0.26), 4 * s);
    br.push({ pts: trunk, lv: 0, w: 2.1 * s, fade: 0.35 });

    const dirAt = (p, i) => { const a = p[Math.max(0, i - 3)], b = p[Math.min(p.length - 1, i + 3)]; return Math.atan2(b[1] - a[1], b[0] - a[0]); }; // 0 = droite, π/2 = bas

    /** Branche issue de p[i] ; l'angle est biaisé vers le bas, jamais remontant franchement. */
    function spawn(parent, i, lv, maxLen) {
      const p = parent.pts[i], base = dirAt(parent.pts, i), side = Math.random() < 0.5 ? -1 : 1;
      let ang = base + side * rnd(0.22, 0.95);
      const up = Math.sin(ang) < 0.12; // trop horizontal ou remontant -> on ramène vers le bas
      if (up) ang = side > 0 ? Math.PI / 2 + rnd(0.3, 1.1) : Math.PI / 2 - rnd(0.3, 1.1);
      const bl = maxLen * rnd(0.45, 1);
      const ex = p[0] + Math.cos(ang) * bl, ey = p[1] + Math.sin(ang) * bl;
      const pts = wandering(p[0], p[1], ex, ey, bl > 120 * s ? 3 : 2, rnd(0.03, 0.07), rnd(0.2, 0.34), (lv === 1 ? 3.4 : 2.8) * s);
      const b = { pts, lv, w: [0, 2.1, 1.15, 0.7, 0.45][lv] * s * rnd(0.8, 1.15), fade: rnd(0.55, 0.9) };
      br.push(b);
      return b;
    }

    // Branches primaires le long du tracé principal
    const nPrim = Math.round(rnd(3, 8));
    const prim = [];
    for (let k = 0; k < nPrim; k++) {
      const i = Math.floor(rnd(0.1, 0.9) * (trunk.length - 1));
      prim.push(spawn(br[0], i, 1, len * rnd(0.1, 0.32)));
    }
    // Fourche au sol : 1 à 3 pointes qui se séparent près du bas
    const nFork = Math.round(rnd(1, 3));
    for (let k = 0; k < nFork; k++) {
      const i = Math.floor(rnd(0.78, 0.97) * (trunk.length - 1));
      prim.push(spawn(br[0], i, 1, len * rnd(0.06, 0.16)));
    }
    // Rampants sous la base des nuages : longues branches presque horizontales, fines, vers le haut du tracé
    if (Math.random() < 0.7) {
      const nCr = Math.round(rnd(1, 2));
      for (let k = 0; k < nCr; k++) {
        const i = Math.floor(rnd(0.04, 0.2) * (trunk.length - 1)), p = trunk[i], side = Math.random() < 0.5 ? -1 : 1;
        const l = rnd(0.07, 0.2) * W, ex = p[0] + side * l, ey = p[1] + l * rnd(0.05, 0.3);
        br.push({ pts: wandering(p[0], p[1], ex, ey, 3, rnd(0.03, 0.06), rnd(0.2, 0.3), 3.2 * s), lv: 2, w: 1.0 * s * rnd(0.8, 1.1), fade: rnd(0.6, 0.9) });
      }
    }
    // Secondaires puis brindilles (récursion limitée : coût et lisibilité)
    const sec = [];
    prim.forEach((b) => {
      const n = Math.random() < 0.7 ? Math.round(rnd(1, 3)) : 0;
      for (let k = 0; k < n; k++) {
        const i = Math.floor(rnd(0.2, 0.9) * (b.pts.length - 1));
        if (i > 1) sec.push(spawn(b, i, 2, Math.hypot(b.pts[b.pts.length - 1][0] - b.pts[0][0], b.pts[b.pts.length - 1][1] - b.pts[0][1]) * rnd(0.35, 0.7) + 12 * s));
      }
    });
    sec.forEach((b) => {
      if (Math.random() < 0.55) { const i = Math.floor(rnd(0.3, 0.9) * (b.pts.length - 1)); if (i > 1) spawn(b, i, 3, rnd(18, 55) * s); }
    });
    // Petites brindilles isolées autour du tracé principal
    const nT = Math.round(rnd(3, 9));
    for (let k = 0; k < nT; k++) { const i = Math.floor(rnd(0.05, 0.95) * (trunk.length - 1)); spawn(br[0], i, 3, rnd(14, 48) * s); }

    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    br.forEach((b) => b.pts.forEach((p) => { if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0]; if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }));
    return { branches: br, bbox: [minX, minY, maxX, maxY], x0, y0, x1, y1 };
  }

  // ---------- Dessin (une seule fois par éclair) ----------
  /** Trace toutes les branches : épaisseur qui s'effile, légère variation, couleur qui bleuit vers les pointes. */
  function strokeAll(c, bolt, ox, oy, k, widthMul, rgb, alpha, chunk, tipRgb) {
    c.lineCap = "round"; c.lineJoin = "round";
    bolt.branches.forEach((b) => {
      const p = b.pts, n = p.length;
      for (let i = 0; i < n - 1; i += chunk) {
        const t = i / (n - 1), e = Math.min(i + chunk, n - 1);
        const taper = 1 - t * b.fade;
        const jit = 0.88 + Math.random() * 0.24;
        c.lineWidth = Math.max(0.35, b.w * taper * widthMul * jit) * k;
        const a = alpha * (b.lv === 0 ? 1 : 0.55 + 0.45 * (1 - t * b.fade));
        const col = tipRgb && t > 0.55 ? tipRgb : rgb;
        c.strokeStyle = "rgba(" + col + "," + a.toFixed(3) + ")";
        c.beginPath();
        c.moveTo((p[i][0] - ox) * k, (p[i][1] - oy) * k);
        for (let j = i + 1; j <= e; j++) c.lineTo((p[j][0] - ox) * k, (p[j][1] - oy) * k);
        c.stroke();
      }
    });
  }

  /** Dessine le tracé et renvoie la position / taille CSS du canvas. */
  function paint(bolt, dist) {
    const pad = 120, dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const ox = Math.floor(bolt.bbox[0] - pad), oy = Math.floor(bolt.bbox[1] - pad);
    const cw = Math.ceil(bolt.bbox[2] - bolt.bbox[0] + pad * 2), ch = Math.ceil(bolt.bbox[3] - bolt.bbox[1] + pad * 2);
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    cv.style.left = ox + "px"; cv.style.top = oy + "px"; cv.style.width = cw + "px"; cv.style.height = ch + "px";
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.globalCompositeOperation = "lighter";

    // 1) Halo large + moyen, calculés en demi-résolution (le flou n'a pas besoin de détail) puis ré-agrandis
    const hk = 0.5 * dpr, hw = Math.max(2, Math.round(cw * hk)), hh = Math.max(2, Math.round(ch * hk));
    halo.width = hw; halo.height = hh; tmpHalf.width = hw; tmpHalf.height = hh;
    const hc = halo.getContext("2d"), tc = tmpHalf.getContext("2d");
    hc.globalCompositeOperation = "lighter";
    const hp = [[18, 30, "70,110,235", 0.34], [6.5, 11, "120,160,255", 0.5]];
    hp.forEach((q) => {
      tc.clearRect(0, 0, hw, hh);
      strokeAll(tc, bolt, ox, oy, hk, q[0] * (1 - dist * 0.3), q[2], q[3], 10);
      if (hasFilter) hc.filter = "blur(" + (q[1] * hk).toFixed(1) + "px)";
      hc.drawImage(tmpHalf, 0, 0);
    });
    hc.filter = "none";
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(halo, 0, 0, cv.width, cv.height);

    // 2) Halo serré blanc-bleu (pleine résolution) : donne l'éclat autour du cœur
    tmpFull.width = cv.width; tmpFull.height = cv.height;
    const fc = tmpFull.getContext("2d");
    strokeAll(fc, bolt, ox, oy, dpr, 3, "200,222,255", 0.9, 6);
    if (hasFilter) ctx.filter = "blur(" + (2.6 * dpr).toFixed(1) + "px)";
    ctx.drawImage(tmpFull, 0, 0);
    ctx.filter = "none";

    // 3) Cœur : bleu très pâle puis blanc pur, légèrement adouci (pas de trait « vectoriel » net)
    fc.clearRect(0, 0, tmpFull.width, tmpFull.height);
    strokeAll(fc, bolt, ox, oy, dpr, 1.6, "232,242,255", 1, 3, "200,220,255");
    if (hasFilter) ctx.filter = "blur(" + (0.7 * dpr).toFixed(1) + "px)";
    ctx.drawImage(tmpFull, 0, 0);
    ctx.filter = "none";
    strokeAll(ctx, bolt, ox, oy, dpr, 0.8, "255,255,255", 1, 3, "235,243,255");
    ctx.globalCompositeOperation = "source-over";

    // libère les tampons temporaires
    tmpFull.width = tmpFull.height = tmpHalf.width = tmpHalf.height = halo.width = halo.height = 1;
  }

  // ---------- Courbes de lumière ----------
  /** Impulsion : montée très rapide puis extinction exponentielle. */
  const pulse = (t, t0, a, rise, tau) => { const d = t - t0; return d < 0 ? 0 : d < rise ? a * (d / rise) * (d / rise) * (3 - 2 * (d / rise)) : a * Math.exp(-(d - rise) / tau); };

  function makeProfile(I0) {
    const pulses = [{ t: 0, a: 1 }];
    if (Math.random() < 0.46) pulses.push({ t: rnd(55, 170), a: rnd(0.42, 0.95) });                         // second flash
    if (pulses.length > 1 && Math.random() < 0.3) pulses.push({ t: pulses[1].t + rnd(40, 120), a: rnd(0.25, 0.6) }); // troisième, plus faible
    const last = pulses[pulses.length - 1].t;
    return { pulses, dur: Math.round(last + 520), I0 };
  }

  /** Intensité à l'instant t pour une couche : rise / tau / queue (afterglow) propres à chaque couche. */
  function level(pr, t, rise, tau, tail, tailTau) {
    let v = 0;
    pr.pulses.forEach((p) => { v = Math.max(v, pulse(t, p.t, p.a, rise, tau)); v += pulse(t, p.t + rise, p.a * tail, 4, tailTau) * 0.5; });
    return clamp(v, 0, 1);
  }

  function frames(pr, gain, rise, tau, tail, tailTau, step, ex) {
    const out = [], n = Math.ceil(pr.dur / step);
    for (let i = 0; i <= n; i++) {
      const t = Math.min(i * step, pr.dur);
      out.push({ opacity: +clamp(gain * Math.pow(pr.I0, ex || 1) * level(pr, t, rise, tau, tail, tailTau), 0, 1).toFixed(3), offset: t / pr.dur });
    }
    out[0].opacity = 0; out[out.length - 1].opacity = 0;
    return out;
  }

  // ---------- Un éclair ----------
  let busy = false;
  function strike() {
    if (busy || !active()) return;
    const W = storm.clientWidth, H = storm.clientHeight;
    if (W < 320 || H < 300) return;
    busy = true;
    const s = clamp(H / 900, 0.75, 1.5);
    const dist = Math.random() < 0.3 ? rnd(0.5, 1) : rnd(0, 0.5);       // 0 = proche, 1 = très lointain
    const bolt = build(W, H, s * (1 - dist * 0.3));
    paint(bolt, dist);
    const I0 = clamp(rnd(0.7, 1) * (1 - dist * 0.26), 0.45, 1);
    const pr = makeProfile(I0);

    // éclairage atmosphérique centré sous le point d'impact dans les nuages
    const fx = bolt.x0 + (bolt.x1 - bolt.x0) * 0.25, fy = Math.max(H * 0.06, bolt.y0 + H * 0.1);
    storm.style.setProperty("--fx", fx.toFixed(0) + "px");
    storm.style.setProperty("--fy", fy.toFixed(0) + "px");
    storm.style.setProperty("--fr", (rnd(0.85, 1.25) * (1 - dist * 0.25)).toFixed(2));
    clouds.style.backgroundPosition = rnd(0, 100).toFixed(0) + "% 0";
    rain.style.backgroundPosition = rnd(0, 200).toFixed(0) + "px " + rnd(0, 200).toFixed(0) + "px, " + rnd(0, 200).toFixed(0) + "px " + rnd(0, 200).toFixed(0) + "px";
    if (city) city.style.setProperty("--fx", fx.toFixed(0) + "px");

    requestAnimationFrame(() => {
      const O = { duration: pr.dur, easing: "linear", fill: "none" };
      const anims = [
        cv.animate(frames(pr, 1, 9, rnd(30, 46), 0.09, 90, 6), O),                  // éclair : le plus bref et le plus net
        glow.animate(frames(pr, 0.95, 24, rnd(90, 125), 0.3, 230, 10, 0.5), O),           // lueur du ciel : plus douce, plus longue
        clouds.animate(frames(pr, 0.8, 20, rnd(70, 100), 0.22, 190, 10, 0.5), O),         // nuages éclairés de l'intérieur
        rain.animate(frames(pr, 0.85, 14, rnd(50, 70), 0.1, 120, 8, 0.5), O),            // pluie figée un instant dans la lumière
      ];
      if (city) anims.push(city.animate(frames(pr, 0.9, 18, rnd(60, 85), 0.18, 160, 10, 0.5), O)); // toits : liseré froid
      Promise.all(anims.map((a) => a.finished.catch(() => 0))).then(() => {
        cv.width = cv.height = 1; busy = false;
      });
    });
  }

  // ---------- Planification ----------
  let timer = 0;
  function schedule(first) {
    clearTimeout(timer);
    const wait = first ? rnd(3500, 8000) : Math.random() < 0.22 ? rnd(2200, 6000) : rnd(8000, 24000); // parfois en rafale, souvent de longs silences
    timer = setTimeout(() => { if (active()) strike(); schedule(false); }, wait);
  }
  schedule(true);

  window.BatStorm = { strike };
})();

// title screen: cut START / TUTORIAL out of the cloth and drop it on the card
'use strict';
(() => {
  const G = window.Game;
  if (!G) return;
  G.hasCover = true;

  const { ctx, OL, FONT, TAU, CW, CH, COLORS, clamp } = G;
  const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const THREAD = '#fffbe6', FIT = 0.8;

  const WORDS = [
    { word: 'START', size: 34, stencil: 64, rot: -0.09, ax: 0.70, ay: 0.36, fn: () => G.startGame() },
  ];
  if (G.tutorial) WORDS.push({ word: 'TUTORIAL', size: 22, stencil: 44, rot: 0.12, ax: 0.79, ay: 0.64, fn: () => G.tutorial.start() });

  // ---------- word stencils ----------
  function makeStencil(w) {
    w.font = `bold ${w.stencil}px ${FONT}`;
    const [, m] = G.makeCanvas(1, 1);
    m.font = w.font;
    const pad = 10, tw = Math.ceil(m.measureText(w.word).width) + pad * 2, th = Math.ceil(w.stencil * 1.3) + pad * 2;
    const glyph = (c, col) => {
      c.font = w.font; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
      c.lineWidth = 6; c.strokeStyle = c.fillStyle = col;
      c.strokeText(w.word, tw / 2, th / 2); c.fillText(w.word, tw / 2, th / 2);
    };
    const [cv, x] = G.makeCanvas(tw, th, true);
    glyph(x, '#fff');
    const d = x.getImageData(0, 0, tw, th).data;
    w.samples = [];
    for (let y = 0; y < th; y += 4)
      for (let px = 0; px < tw; px += 4)
        if (d[(y * tw + px) * 4 + 3] > 128) w.samples.push([px - tw / 2, y - th / 2]);
    w.cv = cv;
    w.tint = {};
    for (const [k, col] of [['ok', 'rgba(125,255,154,0.28)'], ['bad', 'rgba(255,90,90,0.22)']]) {
      const [tc, tx] = G.makeCanvas(tw, th);
      glyph(tx, col);
      w.tint[k] = tc;
    }
  }
  WORDS.forEach(makeStencil);

  // ---------- state ----------
  let was = false, t = 0, cards = [], held = null, flyers = [], fitNow = 0, hover = null;
  let scraps = [], seams = null, bg = null, drag = null, zTop = 0;
  const hand = { x: 0, y: 0, a: 0, init: false, press: 0 };

  const layout = () => {
    const W = G.W, H = G.H, k = clamp(Math.min(W / 1500, H / 880), 0.6, 1.4);
    return { W, H, k, cx: W * 0.31, cy: H * 0.56, cs: clamp(k * 1.55, 1, 2) };
  };

  // Stitch a polyline (cluster-local points) onto every scrap; source-atop keeps thread on the cloth.
  function bakeStitch(pts) {
    if (pts.length < 2) return;
    for (const s of scraps) {
      const ox = s.ox - s.p.w / 2, oy = s.oy - s.p.h / 2, v = s.p.vctx;
      v.save(); v.globalCompositeOperation = 'source-atop'; v.lineCap = 'round'; v.lineJoin = 'round';
      v.beginPath(); v.moveTo(pts[0][0] - ox, pts[0][1] - oy);
      for (const [x, y] of pts) v.lineTo(x - ox, y - oy);
      v.setLineDash([9, 8]);
      v.strokeStyle = OL; v.lineWidth = 6; v.stroke();
      v.strokeStyle = THREAD; v.lineWidth = 3; v.stroke();
      v.restore();
    }
  }
  // A seam runs along the long axis of the region where two scraps overlap (cluster-local coords).
  function seamBetween(a, b, from, to) {
    const at = (s, x, y) => s.p.alphaAt(x - s.ox + s.p.w / 2 + s.p.x, y - s.oy + s.p.h / 2 + s.p.y) > 110;
    const pts = [];
    for (let y = -400; y <= 400; y += 6) for (let x = -500; x <= 500; x += 6) if (at(a, x, y) && at(b, x, y)) pts.push([x, y]);
    if (pts.length < 10) return null;
    let mx = 0, my = 0;
    for (const [x, y] of pts) { mx += x; my += y; }
    mx /= pts.length; my /= pts.length;
    let sxx = 0, syy = 0, sxy = 0;
    for (const [x, y] of pts) { const dx = x - mx, dy = y - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux;
    let lo = 1e9, hi = -1e9;
    for (const [x, y] of pts) { const s = (x - mx) * ux + (y - my) * uy; lo = Math.min(lo, s); hi = Math.max(hi, s); }
    lo += 14; hi -= 14;
    const pt = s => { const w = Math.sin(s * 0.04) * 5; return [mx + ux * s + nx * w, my + uy * s + ny * w]; };
    const line = [];
    for (let i = 0; i <= 40; i++) {
      const s = lo + (hi - lo) * (from + (to - from) * i / 40), p = pt(s);
      if (at(a, p[0], p[1]) && at(b, p[0], p[1])) line.push(p);
    }
    return { pts: line, pt, lo, hi, nx, ny, ux, uy };
  }

  function enter() {
    t = 0; held = null; flyers = []; hover = null; drag = null; hand.init = false;
    G.orders.length = 0; G.particles.length = 0;
    const cols = [0, 1, 2, 3, 4, 5].sort(() => Math.random() - 0.5);
    const defs = [[-140, -60, 205], [115, -85, 180], [10, 110, 195]];
    // Scraps 0 and 2 are fully sewn and move as one; scrap 1 is only half sewn (pinned) and moves alone.
    const groups = [0, 1, 0];
    scraps = defs.map(([ox, oy, size], i) => {
      let p = null;
      for (let n = 0; n < 20; n++) { p = G.genFabric(cols[i], size); if (p.w >= size * 1.9 && p.h >= size * 1.5) break; }
      return { p, ox, oy, g: groups[i], dx: 0, dy: 0 };
    });
    scraps[1].p.z += 1; scraps[2].p.z += 2;
    zTop = Math.max(...scraps.map(s => s.p.z));
    const full = seamBetween(scraps[0], scraps[2], 0, 1);
    const half = seamBetween(scraps[0], scraps[1], 0, 0.5);
    if (full) bakeStitch(full.pts);
    if (half) bakeStitch(half.pts);
    seams = { half };
    cards = WORDS.map((w, i) => ({ w, id: 900 + i, ci: cols[3 + i], delay: 0.15 + i * 0.15, state: 'wait', reactT: 0, fired: false, landed: false, x: 0, y: 0, lift: 0 }));
  }

  // Keeps every scrap group fully on screen (fabric bitmaps carry a 10px transparent pad).
  function place() {
    const L = layout();
    for (const g of [0, 1]) {
      const ms = scraps.filter(s => s.g === g);
      if (!ms.length) continue;
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const s of ms) {
        const bx = L.cx + s.ox - s.p.w / 2 + s.dx, by = L.cy + s.oy - s.p.h / 2 + s.dy;
        x0 = Math.min(x0, bx + 10); y0 = Math.min(y0, by + 10); x1 = Math.max(x1, bx + s.p.w - 10); y1 = Math.max(y1, by + s.p.h - 10);
      }
      const fx = x1 - x0 > L.W ? (L.W - (x1 - x0)) / 2 - x0 : x0 < 0 ? -x0 : x1 > L.W ? L.W - x1 : 0;
      const fy = y1 - y0 > L.H ? (L.H - (y1 - y0)) / 2 - y0 : y0 < 0 ? -y0 : y1 > L.H ? L.H - y1 : 0;
      for (const s of ms) { s.dx += fx; s.dy += fy; }
    }
    for (const s of scraps) { s.p.x = Math.round(L.cx + s.ox - s.p.w / 2 + s.dx); s.p.y = Math.round(L.cy + s.oy - s.p.h / 2 + s.dy); }
    for (const c of cards) { c.x = L.W * c.w.ax; c.y = L.H * c.w.ay; }
    return L;
  }
  function scrapAt(x, y) {
    for (const s of scraps.slice().sort((a, b) => b.p.z - a.p.z)) if (s.p.alphaAt(x, y) > 110) return s;
    return null;
  }

  function cardAt(x, y) {
    const cs = layout().cs;
    for (let i = cards.length - 1; i >= 0; i--) {
      const c = cards[i];
      if (c.state !== 'wait' || t < c.delay) continue;
      const dx = x - c.x, dy = y - c.y, cr = Math.cos(-c.w.rot), sr = Math.sin(-c.w.rot);
      const lx = dx * cr - dy * sr, ly = dx * sr + dy * cr;
      if (Math.abs(lx) <= CW * cs / 2 && Math.abs(ly) <= CH * cs / 2) return c;
    }
    return null;
  }

  function fit(w, x, y) {
    let hit = 0;
    for (const [sx, sy] of w.samples) if (scraps.some(s => s.p.alphaAt(x + sx, y + sy) > 110)) hit++;
    return hit / w.samples.length;
  }

  function cut(c, mx, my) {
    const w = c.w, cv = w.cv, hw = cv.width / 2, hh = cv.height / 2, ox = mx - hw, oy = my - hh;
    const hits = scraps.map(s => s.p)
      .filter(p => p.x < ox + cv.width && p.x + p.w > ox && p.y < oy + cv.height && p.y + p.h > oy)
      .sort((a, b) => a.z - b.z);
    const [fc, fx] = G.makeCanvas(cv.width, cv.height);
    for (const p of hits) fx.drawImage(p.vis, p.x - ox, p.y - oy);
    fx.globalCompositeOperation = 'destination-in'; fx.drawImage(cv, 0, 0);
    fx.globalCompositeOperation = 'destination-over';
    fx.font = w.font; fx.textAlign = 'center'; fx.textBaseline = 'middle'; fx.lineJoin = 'round';
    fx.lineWidth = 12; fx.strokeStyle = OL; fx.strokeText(w.word, hw, hh);

    const pal = new Set();
    for (const p of hits) {
      for (const k of [p.vctx, p.dctx]) { k.save(); k.globalCompositeOperation = 'destination-out'; k.drawImage(cv, ox - p.x, oy - p.y); k.restore(); }
      const v = p.vctx;
      v.save(); v.globalCompositeOperation = 'source-atop';
      v.font = w.font; v.textAlign = 'center'; v.textBaseline = 'middle'; v.lineJoin = 'round';
      v.lineWidth = 14; v.strokeStyle = OL; v.strokeText(w.word, mx - p.x, my - p.y);
      v.restore();
      p.refresh();
      p.colors.forEach(ci => pal.add(COLORS[ci].hex));
    }
    const cols = [...pal];
    for (let i = 0; i < 18; i++) G.particles.push({ screen: true, x: mx + G.rand(-hw, hw), y: my + G.rand(-hh, hh), vx: G.rand(-150, 150), vy: G.rand(-200, 60), life: G.rand(0.4, 0.8), t: 0, color: G.pick(cols), size: G.rand(3, 7) });
    flyers.push({ img: fc, sx: mx, sy: my, x: mx, y: my, sc: 1, t: 0, dur: 0.6, card: c });
    c.state = 'incoming';
    held = null;
    G.sfx('cut');
  }

  function resolve(c) {
    const cs = layout().cs;
    c.state = 'react'; c.reactT = 0;
    G.addPopup({ x: c.x, y: c.y + CH * cs * 0.5 + 34, text: G.pick(['GOOD!', 'NICE!']), color: '#fff', bg: '#7dff9a', burst: true, life: 1.6, size: 26 });
    G.focusLines(c.x, c.y, { color: '#fffbe6', inner: CW * cs * 0.7, dur: 0.4 });
    for (let i = 0; i < 18; i++) G.particles.push({ screen: true, x: c.x, y: c.y, vx: G.rand(-260, 260), vy: G.rand(-300, 50), life: G.rand(0.6, 1.1), t: 0, color: G.pick(['#ffe066', '#7dff9a', '#fff', '#ff8fc7']), size: G.rand(4, 8), star: true });
    G.sfx('happy');
  }

  const busy = () => cards.some(c => c.state !== 'wait');

  G.on('update', dt => {
    const on = G.state === 'title';
    if (on && !was) enter();
    was = on;
    if (!on) return;
    t += dt;
    if (drag) {
      const mx = G.mouse.x, my = G.mouse.y;
      for (const s of scraps) if (s.g === drag.g) { s.dx += mx - drag.mx; s.dy += my - drag.my; }
      drag.mx = mx; drag.my = my;
    }
    const L = place();
    updateHand(L, dt);
    hover = held ? null : cardAt(G.mouse.x, G.mouse.y);
    for (const c of cards) {
      if (t >= c.delay && !c.landed) { c.landed = true; G.sfx('plonk'); }
      c.lift += ((c === hover || c === held ? 1 : 0) - c.lift) * (1 - Math.exp(-dt * 14));
      if (c.state === 'react') {
        c.reactT += dt;
        if (c.reactT > 0.9 && !c.fired) { c.fired = true; c.w.fn(); }
      }
    }
    for (const f of flyers) {
      f.t += dt;
      const k = Math.min(1, f.t / f.dur), e = G.easeOut(k);
      f.x = G.lerp(f.sx, f.card.x, e); f.y = G.lerp(f.sy, f.card.y, e) - Math.sin(k * Math.PI) * 90;
      f.sc = G.lerp(1, 0.5, e);
      if (k >= 1) { f.done = true; resolve(f.card); }
    }
    flyers = flyers.filter(f => !f.done);
    if (held) fitNow = fit(held.w, G.mouse.x, G.mouse.y);
  });

  G.on('mousedown', e => {
    if (G.state !== 'title') return;
    if (busy()) return true;
    if (e.button === 2) { if (held) { held = null; G.sfx('drop'); } return true; }
    if (e.button !== 0) return true;
    const c = cardAt(e.clientX, e.clientY);
    if (c) { held = held === c ? null : c; G.sfx(held ? 'pick' : 'drop'); return true; }
    if (!held) {
      const s = scrapAt(e.clientX, e.clientY);
      if (s) {
        drag = { g: s.g, mx: e.clientX, my: e.clientY };
        for (const m of scraps.filter(m => m.g === s.g).sort((a, b) => a.p.z - b.p.z)) m.p.z = ++zTop;
        G.sfx('grab');
      }
      return true;
    }
    if (fit(held.w, e.clientX, e.clientY) >= FIT) cut(held, e.clientX, e.clientY);
    else { G.addPopup({ x: e.clientX, y: e.clientY - 60, icon: 'cross', life: 1.1 }); G.sfx('error'); }
    return true;
  });
  window.addEventListener('mouseup', () => { if (drag) { drag = null; G.sfx('drop'); } });
  window.addEventListener('blur', () => { drag = null; });

  // Granny's arm reaches from below the screen toward the mouse: loosely when idle, firmly while dragging.
  function updateHand(L, dt) {
    const s = clamp(L.H / 820, 0.75, 1.3) * 1.4;
    const px = L.cx - 120 * s, py = L.H + 330 * s;
    const restX = L.cx - 40 * s, restY = L.cy + 205 * s;
    const follow = drag ? 0.85 : 0.3;
    let tx = restX + (G.mouse.x - restX) * follow, ty = restY + (G.mouse.y - restY) * follow;
    const lim = drag ? 1e9 : 160 * s, d = Math.hypot(tx - restX, ty - restY);
    if (d > lim) { tx = restX + (tx - restX) * lim / d; ty = restY + (ty - restY) * lim / d; }
    ty = Math.max(ty, L.H * 0.12);
    if (!hand.init) { hand.x = tx; hand.y = ty; hand.init = true; }
    const k = 1 - Math.exp(-dt * (drag ? 14 : 5));
    hand.x += (tx - hand.x) * k; hand.y += (ty - hand.y) * k;
    hand.a = Math.atan2(hand.y - py, hand.x - px) + Math.PI / 2;
    hand.s = s;
    hand.press += ((drag ? 1 : 0) - hand.press) * (1 - Math.exp(-dt * 12));
  }
  G.on('keydown', e => {
    if (G.state !== 'title') return;
    if (e.code === 'Escape' && held) { held = null; G.sfx('drop'); return true; }
    if (e.repeat || busy() || (e.code !== 'Space' && e.code !== 'Enter')) return;
    e.preventDefault();
    if (G.tutorial && !G.tutorial.isDone()) G.tutorial.start();
    else G.startGame();
    return true;
  });

  // ---------- rendering ----------
  function drawBg(L) {
    const dpr = ctx.getTransform().a;
    if (!bg || bg.W !== L.W || bg.H !== L.H || bg.dpr !== dpr) {
      const [cv, x] = G.makeCanvas(Math.ceil(L.W * dpr), Math.ceil(L.H * dpr));
      x.scale(dpr, dpr);
      x.fillStyle = '#3c8c6e'; x.fillRect(0, 0, L.W, L.H);
      x.save();
      x.translate(L.W / 2, L.H / 2); x.rotate(-0.05);
      const R = Math.hypot(L.W, L.H) / 2 + 40;
      for (let v = -Math.ceil(R / 40) * 40; v <= R; v += 40) {
        const major = (v / 40) % 5 === 0;
        x.strokeStyle = major ? 'rgba(255,255,255,0.26)' : 'rgba(255,255,255,0.09)';
        x.lineWidth = major ? 2.5 : 1.2;
        x.beginPath(); x.moveTo(v, -R); x.lineTo(v, R); x.moveTo(-R, v); x.lineTo(R, v); x.stroke();
      }
      x.fillStyle = 'rgba(255,255,255,0.28)'; x.font = `bold 14px ${FONT}`; x.textBaseline = 'top';
      for (let v = -Math.ceil(R / 200) * 200, n = 0; v <= R; v += 200, n++) x.fillText(String(n * 20), v + 4, -L.H / 2 + 8);
      x.restore();
      const g = x.createRadialGradient(L.W * 0.45, L.H * 0.5, Math.min(L.W, L.H) * 0.3, L.W * 0.45, L.H * 0.5, Math.hypot(L.W, L.H) * 0.62);
      g.addColorStop(0, 'rgba(10,6,24,0)'); g.addColorStop(1, 'rgba(10,6,24,0.6)');
      x.fillStyle = g; x.fillRect(0, 0, L.W, L.H);
      bg = { cv, W: L.W, H: L.H, dpr };
    }
    ctx.drawImage(bg.cv, 0, 0, L.W, L.H);
  }

  function thread(pts, lw = 2) {
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i + 1 < pts.length; i += 2) ctx.quadraticCurveTo(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    ctx.strokeStyle = OL; ctx.lineWidth = lw + 2.5; ctx.stroke();
    ctx.strokeStyle = THREAD; ctx.lineWidth = lw; ctx.stroke();
    ctx.restore();
  }
  function pin(x, y, a, col) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.lineCap = 'round';
    ctx.strokeStyle = OL; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(16, 0); ctx.stroke();
    ctx.strokeStyle = '#d9deef'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(-17, 0, 6, 0, TAU); ctx.fillStyle = col; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = OL; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(-19, -2, 1.8, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function spool(x, y, col) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(0.25);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(8, 34, 34, 10, 0, 0, TAU); ctx.fill();
    G.inkFill(G.wobEllipse(0, 26, 30, 10, 71, 0.6), '#c98b55', 3);
    G.inkFill(G.wobRect(-22, -22, 44, 48, 72, 0.8), col, 3);
    ctx.strokeStyle = G.shade(col, -0.25); ctx.lineWidth = 1.5;
    for (let i = -16; i < 22; i += 6) { ctx.beginPath(); ctx.moveTo(-21, i); ctx.lineTo(21, i + 4); ctx.stroke(); }
    G.inkFill(G.wobEllipse(0, -24, 30, 10, 73, 0.6), '#dba06a', 3);
    ctx.fillStyle = OL; ctx.beginPath(); ctx.ellipse(0, -24, 6, 2.5, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function scissors(x, y, a, s) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(s, s);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.fillStyle = 'rgba(10,20,15,0.3)';
    ctx.beginPath(); ctx.ellipse(10, 12, 120, 22, 0, 0, TAU); ctx.fill();
    for (const sg of [-1, 1]) {
      ctx.save(); ctx.rotate(sg * 0.11);
      G.inkFill(G.wobPoly([[-6, -6 * sg], [118, -1 * sg], [126, 2 * sg], [-6, 7 * sg]], 80 + sg, 0.6, 2), '#d9deef', 3);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(14, -2 * sg); ctx.lineTo(100, -0.5 * sg); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(-34, 14 * sg);
      ctx.strokeStyle = OL; ctx.lineWidth = 13; ctx.stroke();
      ctx.strokeStyle = '#e8434f'; ctx.lineWidth = 8; ctx.stroke();
      G.wobEllipse(-56, 20 * sg, 24, 15, 82 + sg, 0.8);
      ctx.strokeStyle = OL; ctx.lineWidth = 14; ctx.stroke();
      ctx.strokeStyle = '#e8434f'; ctx.lineWidth = 8; ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0, 0, 6, 0, TAU); ctx.fillStyle = '#9aa3c7'; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = OL; ctx.stroke();
    ctx.restore();
  }

  function drawScraps(L) {
    // Pins and the loose thread belong to the half-sewn scrap and travel with it.
    const h = seams.half, s1 = scraps[1], ox = L.cx + s1.dx, oy = L.cy + s1.dy;
    for (const s of scraps.slice().sort((a, b) => a.p.z - b.p.z)) {
      const lifted = drag && drag.g === s.g;
      ctx.save();
      ctx.shadowColor = 'rgba(10,20,15,0.35)'; ctx.shadowOffsetX = lifted ? 10 : 4; ctx.shadowOffsetY = lifted ? 14 : 6;
      ctx.drawImage(s.p.vis, s.p.x - (lifted ? 3 : 0), s.p.y - (lifted ? 5 : 0));
      ctx.restore();
      if (s === s1 && h && h.pts.length) {
        const lx = lifted ? -3 : 0, ly = lifted ? -5 : 0;
        [0.62, 0.78, 0.93].forEach((f, i) => {
          const [px, py] = h.pt(h.lo + (h.hi - h.lo) * f);
          pin(ox + px + lx, oy + py + ly, Math.atan2(h.ny, h.nx) + (hash(i + 3) - 0.5) * 0.6, ['#e8434f', '#f7d038', '#3d8ee8'][i]);
        });
      }
    }
    const sx = L.cx + 330, sy = L.cy + 190;
    if (h && h.pts.length) {
      const end = h.pts[h.pts.length - 1];
      const ex = ox + end[0], ey = oy + end[1];
      const sway = Math.sin(t * 1.3) * 6;
      thread([[ex, ey], [ex + 40, ey + 90 + sway], [(ex + sx) / 2 + 10, (ey + sy) / 2 + 70 + sway], [sx - 60, sy + 40], [sx - 6, sy - 18]]);
    }
    spool(sx, sy, COLORS[scraps[1].p.colors.values().next().value].hex);
  }

  function drawGranny() {
    const s = hand.s, press = hand.press;
    ctx.save();
    ctx.translate(hand.x, hand.y + Math.sin(t * 1.1) * 3 * (1 - press));
    ctx.rotate(hand.a);
    ctx.scale(1 - press * 0.04, 1 - press * 0.04);
    // Sleeve continues off-screen so the arm never looks cut off when reaching.
    G.inkFill(G.wobPoly([[-62 * s, 250 * s], [62 * s, 250 * s], [80 * s, 1400 * s], [-80 * s, 1400 * s]], 90, 1.5, 3), '#eef0f7', 4.5 * s);
    G.drawHand(0, 88 * s, s, false, 'rest', 0, 0, 0);
    ctx.restore();
  }

  function drawTitle(L) {
    const k = L.k, x = L.W * 0.06, y = L.H * 0.13;
    ctx.save(); ctx.translate(x, y); ctx.rotate(-0.04);
    const pop = G.easeOut(clamp(t / 0.4, 0, 1));
    ctx.globalAlpha = pop; ctx.translate(0, (1 - pop) * -20);
    G.text('Stitch, Snip, Ship', 0, 0, 66 * k, '#fff6dc', 'left');
    const w = (ctx.font = `bold ${66 * k}px ${FONT}`, ctx.measureText('Stitch, Snip, Ship').width);
    ctx.save(); ctx.setLineDash([9, 9]); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(4, 44 * k); ctx.quadraticCurveTo(w * 0.5, 54 * k, w - 4, 42 * k);
    ctx.strokeStyle = OL; ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = THREAD; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    G.text('RX-78 GRANNY', 6, 78 * k, 20 * k, '#9fd8c2', 'left');
    ctx.restore();
  }

  function drawCard(c, L) {
    const w = c.w, cs = L.cs;
    const k = clamp((t - c.delay) / 0.25, 0, 1), drop = 1 + (1 - G.easeOut(k)) * 0.35;
    let fade = 1, rise = 0;
    if (c.state === 'react' && c.reactT > 0.4) { const r = Math.min(1, (c.reactT - 0.4) / 0.5); fade = 1 - r; rise = r * 50; }
    ctx.save();
    ctx.globalAlpha = k * fade;
    ctx.translate(c.x, c.y - c.lift * 6 - rise);
    ctx.rotate(c.w.rot * (1 - c.lift * 0.4));
    ctx.scale(cs * drop, cs * drop);
    ctx.translate(-CW / 2, -CH / 2);
    ctx.fillStyle = 'rgba(10,20,15,0.35)';
    G.wobRect(5 + c.lift * 5, 8 + c.lift * 8, CW, CH, c.id + 5, 1.5); ctx.fill();
    const path = G.wobRect(0, 0, CW, CH, c.id, 1.5);
    if (c === held) {
      ctx.lineWidth = 16; ctx.strokeStyle = OL; ctx.stroke(path);
      ctx.lineWidth = 10; ctx.strokeStyle = '#5ff3ff'; ctx.stroke(path);
    }
    G.inkFill(path, c.state === 'react' ? '#e6ffe0' : '#fff6dc', 3);
    ctx.strokeStyle = 'rgba(29,22,48,0.12)'; ctx.lineWidth = 1;
    for (let y = 72; y < CH - 8; y += 12) { ctx.beginPath(); ctx.moveTo(10, y); ctx.lineTo(CW - 10, y); ctx.stroke(); }

    ctx.font = `bold ${w.size}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = 5; ctx.strokeStyle = OL; ctx.strokeText(w.word, CW / 2, 46);
    ctx.fillStyle = COLORS[c.ci].hex; ctx.fillText(w.word, CW / 2, 46);
    ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = 'rgba(29,22,48,0.55)'; ctx.lineWidth = 1.5;
    ctx.strokeRect(10, 20, CW - 20, 52); ctx.restore();
    ctx.beginPath(); ctx.arc(18, 96, 6, 0, TAU);
    ctx.fillStyle = COLORS[c.ci].hex; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OL; ctx.stroke();
    ctx.font = `bold 10px ${FONT}`; ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(29,22,48,0.7)';
    ctx.fillText(`ORDER #${String(c.id - 899).padStart(3, '0')}`, 30, 97);

    ctx.save(); ctx.translate(CW / 2 + (c.id % 2 ? 18 : -14), -2); ctx.rotate(c.id % 2 ? 0.2 : -0.15);
    ctx.fillStyle = 'rgba(255,246,220,0.7)'; ctx.fillRect(-24, -9, 48, 18);
    ctx.strokeStyle = 'rgba(29,22,48,0.35)'; ctx.lineWidth = 1.5; ctx.strokeRect(-24, -9, 48, 18);
    ctx.restore();
    ctx.restore();
  }

  G.on('drawCover', () => {
    const L = place();
    drawBg(L);
    drawTitle(L);
    scissors(L.W * 0.6, L.H * 0.86, -0.32, L.k * 1.1);
    drawScraps(L);
    drawGranny(L);
    for (const c of cards) if (t >= c.delay) drawCard(c, L);
    const ha = clamp((t - 0.8) / 0.5, 0, 1) * (held || busy() ? 0 : 0.75);
    if (ha > 0) {
      ctx.save(); ctx.globalAlpha = ha;
      G.text('grab an order, cut it out of the cloth', L.W * 0.8, L.H * 0.91, 15 * L.k + 3, '#fff6dc', 'center', false);
      ctx.restore();
    }
    for (const f of flyers) {
      ctx.save(); ctx.translate(f.x, f.y); ctx.scale(f.sc, f.sc); ctx.rotate(f.t * 6);
      ctx.drawImage(f.img, -f.img.width / 2, -f.img.height / 2);
      ctx.restore();
    }
  });

  G.on('drawCoverCursor', () => {
    const mx = G.mouse.x, my = G.mouse.y;
    if (!held && !busy() && (drag || (!cardAt(mx, my) && scrapAt(mx, my)))) {
      const closed = !!drag;
      ctx.save(); ctx.translate(mx, my);
      ctx.fillStyle = '#f3c9a8'; ctx.strokeStyle = OL; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(0, 4, 13, 11, 0, 0, TAU); ctx.fill(); ctx.stroke();
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(-9 + i * 6, closed ? -4 : -10, 3.5, closed ? 4 : 7, 0, 0, TAU); ctx.fill(); ctx.stroke(); }
      ctx.restore();
      return true;
    }
    if (!held || cardAt(mx, my)) return;
    const w = held.w, ok = fitNow >= FIT;
    ctx.save();
    ctx.translate(mx, my);
    const img = w.tint[ok ? 'ok' : 'bad'];
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.font = w.font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.setLineDash([10, 7]); ctx.lineDashOffset = -performance.now() / 25;
    ctx.lineWidth = 5; ctx.strokeStyle = OL; ctx.strokeText(w.word, 0, 0);
    ctx.lineWidth = 2.5; ctx.strokeStyle = ok ? '#7dff9a' : '#ff6b6b'; ctx.strokeText(w.word, 0, 0);
    ctx.setLineDash([]);
    ctx.lineCap = 'round';
    ctx.strokeStyle = OL; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.moveTo(0, -8); ctx.lineTo(0, 8); ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    return true;
  });
})();

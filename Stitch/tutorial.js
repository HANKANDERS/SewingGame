// tutorial, no text on purpose
'use strict';
(() => {
  const G = window.Game;
  if (!G) return;

  const STORE_KEY = 'granny_tut_done';
  const ROUND = { mode: 'tutorial', timer: false, autoOrders: false, autoFabric: false, initialPieces: false, noText: true };
  const PEDAL_DIST = 350;
  const GRANNY = { skin: '#f3c9a8', hair: 2, hairC: '#e6e6f0', eL: 0.3, eR: 0.28, pL: [0, 0], pR: [0, 0], seed: 42, hw: 0.95, hh: 1.05, drool: false };

  const isDone = () => { try { return localStorage.getItem(STORE_KEY) === '1'; } catch (e) { return false; } };
  const markDone = () => { try { localStorage.setItem(STORE_KEY, '1'); } catch (e) {} };

  let tut = null;
  const active = () => tut && G.state === 'play' && G.round.mode === 'tutorial';
  const start = () => G.startRound(ROUND);
  function finish() { markDone(); tut = null; G.startGame(); }

  G.titleButtons.push({ label: 'Tutorial', fn: start, color: '#5ff3ff' });
  G.tutorial = { start, isDone };
  // With a cover screen, first-time players start the tutorial from it instead of skipping straight past it.
  G.on('init', () => { if (!isDone() && !G.hasCover) start(); });
  G.on('roundStart', r => {
    tut = r.mode === 'tutorial'
      ? { step: 'pedal', t: 0, dist: 0, sub: 0, target: null, ov: null, order: null, hint: null, hintT: 0, shopT: 0, bought: false }
      : null;
  });
  G.on('shopBuy', () => { if (active()) tut.bought = true; });

  function next(step) {
    tut.step = step; tut.t = 0; tut.hintT = 0;
    G.sfx('tutStep');
    G.addPopup({ x: G.W / 2, y: G.H * 0.32, icon: 'check', life: 1.1 });
  }

  // ---------- world helpers ----------
  function makeTarget(i) {
    const offs = [[340, -40], [-220, 260]];
    const n = G.needle, M = G.MAT;
    return { x: G.clamp(n.x + offs[i][0], M.x + 120, M.x + M.w - 120), y: G.clamp(n.y + offs[i][1], M.y + 120, M.y + M.h - 120) };
  }
  function spawnFabrics() {
    const a = G.genFabric(0, 112), b = G.genFabric(2, 112);
    const sep = Math.max(G.W * 0.34, (a.w + b.w) / 2 + 90);
    const ca = G.screenToWorld(G.W / 2 - sep / 2, G.H * 0.47);
    const cb = G.screenToWorld(G.W / 2 + sep / 2, G.H * 0.47);
    G.launchPiece(a, ca.x - a.w / 2, ca.y - a.h / 2, ca.x - a.w / 2 - 900, ca.y - a.h / 2, 0.8);
    G.launchPiece(b, cb.x - b.w / 2, cb.y - b.h / 2, cb.x - b.w / 2 + 900, cb.y - b.h / 2, 0.8);
    G.sfx('whoosh');
  }
  const merged = () => G.pieces.find(p => !p.fly && p.colors.size >= 2);
  function overlapInfo() {
    const ps = G.pieces.filter(p => !p.fly);
    let best = null;
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], b = ps[j];
      const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y);
      const x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
      if (x1 <= x0 || y1 <= y0) continue;
      let c = 0, sx = 0, sy = 0;
      for (let y = y0; y < y1; y += 8) for (let x = x0; x < x1; x += 8) {
        if (a.alphaAt(x, y) > 110 && b.alphaAt(x, y) > 110) { c++; sx += x; sy += y; }
      }
      if (c && (!best || c > best.count)) best = { count: c, x: sx / c, y: sy / c };
    }
    return best;
  }
  function spawnOrder() {
    tut.order = G.spawnOrder({ shape: 'heart', colors: [0, 2], noExpire: true, life: 60, left: 60 });
  }
  const COIN_FLY = 0.7;
  const moneyPos = () => ({ x: G.W / 2 - 34, y: G.H - 58 });
  function startCoins(o) {
    const s = G.cardScale();
    const from = { x: o.x + G.CW * s / 2, y: o.y + G.CH * s / 2 };
    tut.coins = Array.from({ length: 10 }, (_, i) => ({ from, delay: 0.35 + i * 0.07, bend: G.rand(-160, 160), done: false }));
    tut.gained = o.gained;
  }
  // Before the guided cut, every cut is refused: the first try (across two loose pieces) is the lesson.
  G.on('beforeCut', (o, r, mw) => {
    if (!active() || tut.step === 'cut') return;
    if (tut.step === 'tryCut' && !tut.failT) {
      tut.failT = 1e-4;
      tut.failAt = { x: mw.x, y: mw.y, rot: o.rot, shape: o.shape };
      G.focusLines(G.mouse.x, G.mouse.y, { inner: 70, dur: 0.35 });
    }
    G.addPopup({ x: G.mouse.x, y: G.mouse.y - G.S - 16, icon: 'cross', life: 1.1 });
    G.sfx('error');
    return true;
  });
  function findHint() {
    const p = merged();
    const o = tut.order;
    if (!p || !o) return null;
    const need = G.NEED[o.colors.length], S = G.S;
    const probe = { shape: o.shape, rot: 0 };
    let best = null, bestSc = -1;
    for (let ri = 0; ri < 8; ri++) {
      probe.rot = ri * Math.PI / 4;
      for (let y = p.y + S * 0.7; y < p.y + p.h - S * 0.7; y += 10) {
        for (let x = p.x + S * 0.7; x < p.x + p.w - S * 0.7; x += 10) {
          const sh = G.checkCutOn(p, probe, x, y);
          if (!sh) continue;
          const ss = G.worldToScreen(x, y);
          const onScreen = ss.x > 80 && ss.x < G.W - 200 && ss.y > 200 && ss.y < G.H - 200;
          const sc = Math.min(...o.colors.map(c => sh[c])) + (ri === 0 ? 0.02 : 0) - (onScreen ? 0 : 1);
          if (sc > bestSc) { bestSc = sc; best = { x, y, rot: probe.rot }; }
        }
      }
    }
    if (!best) return null;
    return { p, lx: best.x - p.x, ly: best.y - p.y, rot: best.rot, good: bestSc >= need };
  }
  function hintValid() {
    const h = tut.hint;
    if (!h || !G.pieces.includes(h.p)) return false;
    return !!G.checkCutOn(h.p, { shape: tut.order.shape, rot: h.rot }, h.p.x + h.lx, h.p.y + h.ly);
  }

  // ---------- step logic ----------
  G.on('update', dt => {
    if (!active()) return;
    tut.t += dt;
    const n = G.needle;
    switch (tut.step) {
      case 'pedal':
        tut.dist += n.moved || 0;
        if (tut.dist >= PEDAL_DIST) { next('steer'); tut.sub = 0; tut.target = makeTarget(0); }
        break;
      case 'steer':
        if (Math.hypot(n.x - tut.target.x, n.y - tut.target.y) < 55) {
          tut.sub++;
          if (tut.sub >= 2) { next('drag'); spawnFabrics(); }
          else { G.sfx('tutStep'); tut.target = makeTarget(1); }
        }
        break;
      case 'drag':
        if (merged()) { next('order'); if (!tut.order) spawnOrder(); break; }
        if (!G.drag && G.pieces.every(p => !p.fly)) {
          const ov = overlapInfo();
          if (ov && ov.count >= 40) {
            tut.ov = ov;
            if (tut.failT) next('sew');
            else { next('tryOrder'); if (!tut.order) spawnOrder(); }
          }
        }
        break;
      // Lesson: two loose pieces can't be cut as one shape. The first cut is always refused.
      case 'tryOrder':
      case 'tryCut': {
        if (merged()) { next('order'); break; }
        tut.hintT -= dt;
        if (tut.hintT <= 0) {
          tut.hintT = 0.25;
          const ov = overlapInfo();
          if (!G.drag && (!ov || ov.count < 15)) { G.deselect(); tut.step = 'drag'; tut.t = 0; break; }
          if (ov) tut.ov = ov;
        }
        if (tut.failT) {
          tut.failT += dt;
          if (tut.failT > 1.8) { G.deselect(); next('sew'); }
          break;
        }
        if (tut.step === 'tryOrder' && G.selected === tut.order) { tut.step = 'tryCut'; tut.t = 0; G.sfx('tutStep'); }
        else if (tut.step === 'tryCut' && G.selected !== tut.order) { tut.step = 'tryOrder'; tut.t = 0; }
        break;
      }
      case 'sew':
        if (merged()) { next('order'); break; }
        tut.hintT -= dt;
        if (tut.hintT <= 0) {
          tut.hintT = 0.25;
          const ov = overlapInfo();
          if (!ov || ov.count < 15) { tut.step = 'drag'; tut.t = 0; } else tut.ov = ov;
        }
        break;
      case 'order':
        if (G.selected === tut.order) { tut.hint = findHint(); next('cut'); }
        break;
      case 'cut': {
        const o = tut.order;
        if (o.state === 'react') { startCoins(o); next('coins'); break; }
        if (o.state === 'incoming') break;
        if (G.selected !== o) { tut.step = 'order'; tut.t = 0; break; }
        tut.hintT -= dt;
        if (tut.hintT <= 0) { tut.hintT = 0.4; if (!hintValid()) tut.hint = findHint(); }
        break;
      }
      case 'coins':
        for (const c of tut.coins) {
          if (c.done || tut.t < c.delay) continue;
          if (tut.t >= c.delay + COIN_FLY) { c.done = true; G.sfx(c === tut.coins[0] ? 'coin' : 'pick'); tut.moneyPulse = 1; }
        }
        tut.moneyPulse = Math.max(0, (tut.moneyPulse || 0) - dt * 2.5);
        if (tut.t > 2.6) {
          if (G.shop) {
            if (G.money < G.shop.price) G.addMoney(G.shop.price - G.money);
            next('shop');
          } else next('done');
        }
        break;
      case 'shop':
        if (tut.bought) { tut.shopT += dt; if (tut.shopT > 2.2) next('done'); }
        break;
      case 'done':
        if (!tut.burst) {
          tut.burst = true;
          for (let i = 0; i < 40; i++) G.particles.push({ screen: true, x: G.W / 2, y: G.H * 0.42, vx: G.rand(-420, 420), vy: G.rand(-460, 80), life: G.rand(0.8, 1.6), t: 0, color: G.pick(['#ffe066', '#7dff9a', '#fff', '#ff8fc7', '#5ff3ff']), size: G.rand(5, 10), star: true });
        }
        if (tut.t > 3) finish();
        break;
    }
  });

  // ---------- skip button (top-right) ----------
  const SKIP = { r: 18 };
  const skipPos = () => ({ x: G.W - 44, y: 52 });
  const skipHit = (x, y) => { if (!active()) return false; const p = skipPos(); return Math.hypot(x - p.x, y - p.y) <= SKIP.r + 4; };
  G.addUIHit(skipHit);
  G.on('mousedown', e => {
    if (e.button === 0 && skipHit(e.clientX, e.clientY)) { finish(); return true; }
  });

  // ---------- drawing helpers ----------
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  const blink = () => Math.floor(performance.now() / 333) % 2 === 0;

  function drawKey(ctx, x, y, w, h, pressed, glow, glyph) {
    const d = pressed ? 4 : 0;
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = G.OL; ctx.lineWidth = 3;
    if (glow) { rr(ctx, x - w / 2 - 6, y - h / 2 - 6, w + 12, h + 17, 12); ctx.fillStyle = '#5ff3ff'; ctx.fill(); ctx.stroke(); }
    rr(ctx, x - w / 2, y - h / 2 + 5, w, h, 8); ctx.fillStyle = '#2a2e50'; ctx.fill();
    ctx.stroke();
    rr(ctx, x - w / 2, y - h / 2 + d, w, h - 3, 8);
    ctx.fillStyle = pressed ? '#7dff9a' : glow ? '#bff8ff' : '#e8ecf8'; ctx.fill(); ctx.stroke();
    ctx.translate(x, y + d - 1); ctx.fillStyle = G.OL;
    if (glyph === 'foot') {
      ctx.save(); ctx.translate(-48, 0); ctx.scale(0.8, 0.8);
      ctx.beginPath(); ctx.ellipse(-6, 2, 16, 7, -0.08, 0, G.TAU); ctx.fill();
      for (const [tx, ty, tr] of [[14, -6, 3.6], [19, -1, 3.2], [20, 4, 2.8], [18, 9, 2.4]]) { ctx.beginPath(); ctx.arc(tx, ty, tr, 0, G.TAU); ctx.fill(); }
      ctx.restore();
      ctx.font = `bold 20px ${G.FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('SPACE', 18, 1);
    } else {
      ctx.rotate(glyph);
      ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -9); ctx.lineTo(-6, 9); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  function drawWASD(ctx, x, y, hl) {
    const k = 42, g = 6, K = G.keys, b = blink();
    const items = [
      ['up', x, y - k - g, -Math.PI / 2, K.KeyW || K.ArrowUp],
      ['left', x - k - g, y, Math.PI, K.KeyA || K.ArrowLeft],
      ['down', x, y, Math.PI / 2, K.KeyS || K.ArrowDown],
      ['right', x + k + g, y, 0, K.KeyD || K.ArrowRight],
    ];
    for (const [dir, kx, ky, a, pr] of items) drawKey(ctx, kx, ky, k, k, !!pr, !!(hl && hl.includes(dir) && b), a);
  }
  function drawSpace(ctx, x, y, pressed, glow) { drawKey(ctx, x, y, 170, 40, pressed, glow, 'foot'); }
  function drawMouseIcon(ctx, x, y, mode, pressed) {
    const OL = G.OL, b = blink() || pressed;
    ctx.save();
    ctx.translate(x, y);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = OL; ctx.lineWidth = 3;
    rr(ctx, -24, -34, 48, 68, 22); ctx.fillStyle = '#e8ecf8'; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = pressed ? '#7dff9a' : '#5ff3ff';
    if (mode === 'L' && b) ctx.fillRect(-24, -34, 24, 30);
    if (mode === 'R' && b) ctx.fillRect(0, -34, 24, 30);
    ctx.restore();
    rr(ctx, -24, -34, 48, 68, 22); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-24, -4); ctx.lineTo(24, -4); ctx.moveTo(0, -34); ctx.lineTo(0, -4); ctx.stroke();
    rr(ctx, -5, -27, 10, 17, 5); ctx.fillStyle = mode === 'wheel' && b ? '#5ff3ff' : '#9aa3c7'; ctx.fill(); ctx.stroke();
    if (mode === 'wheel') {
      ctx.strokeStyle = '#5ff3ff'; ctx.lineWidth = 4;
      for (const s of [-1, 1]) {
        ctx.save(); ctx.rotate(s < 0 ? Math.PI : 0);
        ctx.beginPath(); ctx.arc(0, 0, 46, -0.6, 0.6); ctx.stroke();
        ctx.translate(46 * Math.cos(0.6), 46 * Math.sin(0.6)); ctx.rotate(0.6 + Math.PI / 2);
        ctx.beginPath(); ctx.moveTo(-8, -6); ctx.lineTo(0, 4); ctx.lineTo(8, -6); ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
  }
  function drawGhostHand(ctx, x, y, press, ripple) {
    const OL = G.OL;
    if (ripple > 0 && ripple < 1) {
      ctx.save();
      ctx.globalAlpha = 1 - ripple; ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x, y, 10 + ripple * 30, 0, G.TAU); ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.translate(x, y); ctx.rotate(-0.4);
    const s = press ? 0.9 : 1; ctx.scale(s, s);
    ctx.lineJoin = 'round'; ctx.strokeStyle = OL; ctx.lineWidth = 3; ctx.fillStyle = '#ffffff';
    rr(ctx, -7, 0, 14, 42, 7); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-16, 44, 6, 12, -0.5, 0, G.TAU); ctx.fill(); ctx.stroke();
    rr(ctx, -15, 30, 40, 34, 12); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(5, 34); ctx.lineTo(5, 44); ctx.moveTo(15, 34); ctx.lineTo(15, 44); ctx.stroke();
    ctx.lineWidth = 3;
    rr(ctx, -13, 60, 36, 12, 4); ctx.fillStyle = '#5ff3ff'; ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  function tapHand(ctx, x, y, period) {
    const c = (performance.now() / 1000 % (period || 1.2)) / (period || 1.2);
    const press = c > 0.35 && c < 0.55;
    drawGhostHand(ctx, x, y + (press ? 0 : -12), press, c > 0.35 ? (c - 0.35) / 0.45 : 0);
  }
  function drawTarget(ctx, x, y) {
    const t = performance.now() / 1000, OL = G.OL;
    ctx.save();
    ctx.lineJoin = 'round';
    for (let i = 0; i < 2; i++) {
      const k = (t * 0.9 + i * 0.5) % 1;
      ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x, y, 16 + k * 40, 0, G.TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5 + t, r = i % 2 ? 7 : 16;
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fillStyle = '#ffe066'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = OL; ctx.stroke();
    const ay = y - 62 - Math.abs(Math.sin(t * 5)) * 12;
    ctx.beginPath(); ctx.moveTo(x - 14, ay - 12); ctx.lineTo(x + 14, ay - 12); ctx.lineTo(x, ay + 8); ctx.closePath();
    ctx.fillStyle = '#ffe066'; ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  function drawEdgeArrow(ctx, x, y) {
    const l = 60, t = 190, r = G.W - 60, b = G.H - 190;
    if (x >= l && x <= r && y >= t && y <= b) return false;
    const cx = G.clamp(x, l, r), cy = G.clamp(y, t, b);
    const a = Math.atan2(y - cy, x - cx);
    const bob = Math.sin(performance.now() / 120) * 5;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * bob, cy + Math.sin(a) * bob); ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(22, 0); ctx.lineTo(-12, -18); ctx.lineTo(-4, 0); ctx.lineTo(-12, 18); ctx.closePath();
    ctx.fillStyle = '#ffe066'; ctx.fill(); ctx.lineWidth = 3.5; ctx.strokeStyle = G.OL; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.restore();
    return true;
  }
  function dirsToward(wx, wy) {
    const n = G.needle, dx = wx - n.x, dy = wy - n.y, out = [];
    if (Math.abs(dx) > 40) out.push(dx > 0 ? 'right' : 'left');
    if (Math.abs(dy) > 40) out.push(dy > 0 ? 'down' : 'up');
    return out;
  }
  function drawWorldTarget(ctx, wx, wy) {
    const s = G.worldToScreen(wx, wy);
    if (!drawEdgeArrow(ctx, s.x, s.y)) drawTarget(ctx, s.x, s.y);
  }
  function pedalPressed() { return !!G.keys.Space; }
  function pedalDemo() { return pedalPressed() || (performance.now() / 1000 % 0.45) < 0.12; }

  // Coin bobbing on the order card: "orders pay".
  function cardCoin(ctx, o) {
    if (!o || o.state !== 'wait') return;
    const s = G.cardScale(), t = performance.now() / 1000;
    const x = o.x + G.CW * s + 6, y = o.y + G.CH * s * 0.3 + Math.sin(t * 4) * 5;
    ctx.save();
    ctx.translate(x, y); ctx.scale(1 + Math.sin(t * 8) * 0.06, 1);
    G.drawIcon('coin', 0, 0, 15);
    ctx.restore();
  }
  function shapeGhost(ctx, sx, sy, shape, rot, col, fill, alpha) {
    const path = G.SHAPE_DEFS[shape].path;
    ctx.save();
    ctx.translate(sx, sy); ctx.rotate(rot);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fill; ctx.fill(path);
    ctx.setLineDash([9, 7]); ctx.lineDashOffset = performance.now() / 40;
    ctx.lineWidth = 5; ctx.strokeStyle = G.OL; ctx.stroke(path);
    ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.stroke(path);
    ctx.restore();
  }
  // Refused cut: the shape cracks in two and the halves drift apart, then a needle hint points at sewing.
  function drawSplit(ctx, f, k) {
    const s = G.worldToScreen(f.x, f.y), path = G.SHAPE_DEFS[f.shape].path, S = G.S;
    const gap = G.easeOut(Math.min(1, k / 0.5)) * 22, shake = k < 0.25 ? Math.sin(k * 120) * 4 : 0;
    ctx.save();
    ctx.translate(s.x + shake, s.y);
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(side * gap, side * gap * 0.3); ctx.rotate(side * gap * 0.006);
      ctx.beginPath();
      const z = [[0, -S * 1.3], [6, -S * 0.6], [-6, -S * 0.15], [6, S * 0.3], [-4, S * 0.75], [0, S * 1.3]];
      ctx.moveTo(side * S * 1.5, -S * 1.3);
      for (const [x, y] of z) ctx.lineTo(x, y);
      ctx.lineTo(side * S * 1.5, S * 1.3); ctx.closePath();
      ctx.clip();
      ctx.rotate(f.rot);
      ctx.fillStyle = 'rgba(255,107,107,0.3)'; ctx.fill(path);
      ctx.lineWidth = 6; ctx.strokeStyle = G.OL; ctx.stroke(path);
      ctx.lineWidth = 3.5; ctx.strokeStyle = '#ff6b6b'; ctx.stroke(path);
      ctx.restore();
    }
    ctx.restore();
    const pop = G.easeOut(Math.min(1, k / 0.3));
    ctx.save(); ctx.translate(s.x, s.y); ctx.scale(pop, pop);
    G.drawIcon('cross', 0, 0, 22);
    ctx.restore();
  }
  function drawCoins(ctx) {
    const to = moneyPos();
    for (const c of tut.coins) {
      if (c.done || tut.t < c.delay) continue;
      const k = (tut.t - c.delay) / COIN_FLY, e = k * k * (3 - 2 * k);
      const mx = (c.from.x + to.x) / 2 + c.bend, my = Math.min(c.from.y, to.y) + (to.y - c.from.y) * 0.3;
      const u = 1 - e;
      const x = u * u * c.from.x + 2 * u * e * mx + e * e * to.x, y = u * u * c.from.y + 2 * u * e * my + e * e * to.y;
      ctx.save(); ctx.translate(x, y); ctx.scale(Math.abs(Math.cos(tut.t * 9 + c.bend)) * 0.7 + 0.3, 1);
      G.drawIcon('coin', 0, 0, 14);
      ctx.restore();
    }
    const p = tut.moneyPulse || 0;
    if (tut.coins.some(c => c.done)) {
      const k = (performance.now() / 1000 * 1.2) % 1;
      ctx.save();
      ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(to.x + 30, to.y, 40 + k * 40, 0, G.TAU); ctx.stroke();
      ctx.restore();
      ctx.save(); ctx.translate(to.x + 30, to.y - 62 - p * 10); ctx.scale(1 + p * 0.25, 1 + p * 0.25);
      G.text(`+${tut.gained}`, 0, 0, 26, '#ffe066');
      ctx.restore();
    }
  }

  // ---------- step visuals ----------
  G.on('drawOverlay', ctx => {
    if (!active()) return;
    const W = G.W, H = G.H, n = G.needle;
    const L = { x: W * 0.16, y: H - 300 };
    const M = { x: W * 0.8, y: H - 240 };
    const ns = G.worldToScreen(n.x, n.y);
    ctx.save();
    switch (tut.step) {
      case 'pedal': {
        drawSpace(ctx, L.x, L.y + 85, pedalDemo(), !pedalPressed() && blink());
        ctx.lineCap = 'round';
        ctx.lineWidth = 9; ctx.strokeStyle = G.OL;
        ctx.beginPath(); ctx.arc(ns.x, ns.y, 46, -Math.PI / 2, -Math.PI / 2 + G.TAU * Math.min(1, tut.dist / PEDAL_DIST)); ctx.stroke();
        ctx.lineWidth = 5; ctx.strokeStyle = '#7dff9a'; ctx.stroke();
        const h = n.heading, t = performance.now() / 1000;
        for (let i = 0; i < 3; i++) {
          const d = 60 + ((t * 60 + i * 22) % 66);
          const px = ns.x + Math.cos(h) * d, py = ns.y + Math.sin(h) * d;
          ctx.save(); ctx.translate(px, py); ctx.rotate(h);
          ctx.globalAlpha = 1 - (d - 60) / 66;
          ctx.beginPath(); ctx.moveTo(-6, -10); ctx.lineTo(4, 0); ctx.lineTo(-6, 10);
          ctx.lineWidth = 5; ctx.strokeStyle = '#ffe066'; ctx.stroke();
          ctx.restore();
        }
        break;
      }
      case 'steer':
        drawWASD(ctx, L.x, L.y, dirsToward(tut.target.x, tut.target.y));
        drawSpace(ctx, L.x, L.y + 85, pedalPressed(), n.speed < 80 && blink());
        drawWorldTarget(ctx, tut.target.x, tut.target.y);
        break;
      case 'drag': {
        const ps = G.pieces.filter(p => !p.fly && p.colors.size === 1);
        drawMouseIcon(ctx, M.x, M.y, 'L', !!G.drag);
        if (ps.length < 2 || G.drag) break;
        const [a, b] = ps;
        const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 }, cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
        const dl = Math.hypot(ca.x - cb.x, ca.y - cb.y) || 1;
        const reach = ((a.w + a.h) / 4 + (b.w + b.h) / 4) * 0.45;
        const end = { x: cb.x + (ca.x - cb.x) / dl * reach, y: cb.y + (ca.y - cb.y) / dl * reach };
        const c = (performance.now() / 1000 % 2.4) / 2.4;
        const k = c < 0.15 ? 0 : c > 0.75 ? 1 : G.easeOut((c - 0.15) / 0.6);
        const offx = (end.x - ca.x) * k, offy = (end.y - ca.y) * k;
        const sa = G.worldToScreen(a.x + offx, a.y + offy);
        ctx.globalAlpha = c > 0.75 ? 0.35 * (1 - (c - 0.75) / 0.25) : 0.35;
        ctx.drawImage(a.vis, sa.x, sa.y);
        ctx.globalAlpha = 1;
        const s0 = G.worldToScreen(ca.x, ca.y), s1 = G.worldToScreen(end.x, end.y);
        ctx.setLineDash([10, 10]); ctx.lineDashOffset = -performance.now() / 30;
        ctx.lineWidth = 4; ctx.strokeStyle = '#ffe066';
        ctx.beginPath(); ctx.moveTo(s0.x, s0.y); ctx.lineTo(s1.x, s1.y); ctx.stroke();
        ctx.setLineDash([]);
        const hs = G.worldToScreen(ca.x + offx, ca.y + offy);
        drawGhostHand(ctx, hs.x, hs.y, c > 0.1 && c < 0.8, 0);
        break;
      }
      case 'sew':
        drawWASD(ctx, L.x, L.y, tut.ov ? dirsToward(tut.ov.x, tut.ov.y) : null);
        drawSpace(ctx, L.x, L.y + 85, pedalPressed(), n.speed < 80 && blink());
        if (tut.ov) drawWorldTarget(ctx, tut.ov.x, tut.ov.y);
        cardCoin(ctx, tut.order);
        break;
      case 'tryOrder':
      case 'order': {
        const o = tut.order, s = G.cardScale();
        drawMouseIcon(ctx, M.x, M.y, 'L', false);
        if (o) tapHand(ctx, o.x + G.CW * s / 2, o.y + G.CH * s * 0.55);
        cardCoin(ctx, o);
        if (tut.failT && tut.step === 'tryOrder') drawSplit(ctx, tut.failAt, tut.failT);
        break;
      }
      case 'tryCut': {
        const sel = G.selected;
        cardCoin(ctx, tut.order);
        if (tut.failT) { drawSplit(ctx, tut.failAt, tut.failT); break; }
        if (!tut.ov || !sel) break;
        const s = G.worldToScreen(tut.ov.x, tut.ov.y);
        const pulse = 0.55 + Math.sin(performance.now() / 160) * 0.35;
        shapeGhost(ctx, s.x, s.y, sel.shape, sel.rot, '#ffe066', 'rgba(255,224,102,0.22)', pulse);
        drawMouseIcon(ctx, M.x, M.y, 'L', false);
        tapHand(ctx, s.x, s.y);
        break;
      }
      case 'cut': {
        const h = tut.hint, sel = G.selected;
        if (!h || !sel) { drawMouseIcon(ctx, M.x, M.y, 'L', false); break; }
        const wpos = G.worldToScreen(h.p.x + h.lx, h.p.y + h.ly);
        let diff = ((sel.rot - h.rot) % G.TAU + G.TAU) % G.TAU;
        if (diff > Math.PI) diff -= G.TAU;
        const rotOk = Math.abs(diff) < 0.01;
        const pulse = 0.55 + Math.sin(performance.now() / 160) * 0.35;
        ctx.save();
        ctx.translate(wpos.x, wpos.y); ctx.rotate(h.rot);
        const path = G.SHAPE_DEFS[sel.shape].path;
        ctx.globalAlpha = pulse;
        ctx.fillStyle = 'rgba(255,224,102,0.22)'; ctx.fill(path);
        ctx.setLineDash([9, 7]); ctx.lineDashOffset = performance.now() / 40;
        ctx.lineWidth = 5; ctx.strokeStyle = G.OL; ctx.stroke(path);
        ctx.lineWidth = 3; ctx.strokeStyle = '#ffe066'; ctx.stroke(path);
        ctx.restore();
        if (rotOk) {
          drawMouseIcon(ctx, M.x, M.y, 'L', false);
          tapHand(ctx, wpos.x, wpos.y);
        } else {
          drawMouseIcon(ctx, M.x, M.y, 'wheel', false);
        }
        break;
      }
      case 'coins':
        drawCoins(ctx);
        break;
      case 'shop': {
        if (!G.shop) break;
        const b = G.shop.button();
        drawMouseIcon(ctx, M.x - 40, M.y, 'L', false);
        const k = (performance.now() / 1000 * 0.9) % 1;
        ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(b.x + b.w / 2, b.y + b.h / 2, 30 + k * 40, 0, G.TAU); ctx.stroke();
        ctx.globalAlpha = 1;
        if (!tut.bought) tapHand(ctx, b.x + b.w / 2, b.y + b.h / 2);
        break;
      }
      case 'done': {
        const t = tut.t;
        const sc = Math.min(1, t * 3) * (1 + Math.sin(t * 8) * 0.04);
        ctx.fillStyle = `rgba(10,6,24,${Math.min(0.45, t)})`; ctx.fillRect(0, 0, W, H);
        ctx.translate(W / 2, H * 0.42); ctx.scale(sc, sc);
        ctx.fillStyle = '#f7d038'; ctx.strokeStyle = G.OL; ctx.lineWidth = 4; ctx.lineJoin = 'round';
        for (const s of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(0, -68); ctx.lineTo(s * 70, -150); ctx.lineTo(s * 14, -78); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        G.drawFace(0, 0, 80, GRANNY, 'happy', t);
        G.drawIcon('check', 96, -70, 30);
        break;
      }
    }
    ctx.restore();

    const sp = skipPos();
    ctx.save();
    ctx.translate(sp.x, sp.y);
    ctx.beginPath(); ctx.arc(0, 0, SKIP.r, 0, G.TAU);
    ctx.fillStyle = '#0c1824'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = G.OL; ctx.stroke();
    ctx.fillStyle = '#5ff3ff';
    ctx.beginPath(); ctx.moveTo(-10, -7); ctx.lineTo(-1, 0); ctx.lineTo(-10, 7); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-1, -7); ctx.lineTo(8, 0); ctx.lineTo(-1, 7); ctx.closePath(); ctx.fill();
    ctx.fillRect(8, -7, 3, 14);
    ctx.restore();
  });
})();

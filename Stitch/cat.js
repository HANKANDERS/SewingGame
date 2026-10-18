// alien cat that wanders around. you can grab it, and cut orders out of its fur
'use strict';
(() => {
  const G = window.Game;
  if (!G) return;

  const CVW = 360, CVH = 250, OX = 180, OY = 125;
  const WALK = 75, FLEE = 460, LEAVE = 150;
  const FIRST_SPAWN = [15, 28], RESPAWN = [30, 55], STAY = [35, 55];
  // fur.base / patches use palette indices from G.COLORS, so cut fur counts as fabric color.
  const FURS = [
    { base: 5, stripes: true },
    { base: 2, alien: true },
    { base: 1, patches: [[5, -45, -15, 48], [4, 40, 25, 36], [5, 100, -70, 26]] },
  ];

  let cat = null, nextSpawn = 0, dirty = true;
  const [vis, vctx] = G.makeCanvas(CVW, CVH);
  const [data, dctx] = G.makeCanvas(CVW, CVH, true);
  const piece = { x: 0, y: 0, w: CVW, h: CVH, vis, data, img: null, colors: new Set() };

  const active = () => G.state === 'play' && G.eventOn('cat');
  const img = () => { if (dirty) { piece.img = dctx.getImageData(0, 0, CVW, CVH); dirty = false; } return piece.img; };
  function alphaAt(wx, wy) {
    if (!cat) return 0;
    const lx = Math.floor(wx - piece.x), ly = Math.floor(wy - piece.y);
    if (lx < 0 || ly < 0 || lx >= CVW || ly >= CVH) return 0;
    return img().data[(ly * CVW + lx) * 4 + 3];
  }

  // ---------- behaviour ----------
  function setState(s, dur) { cat.state = s; cat.stateT = 0; cat.dur = dur || 0; }
  function randomTarget() {
    const v = G.viewWorld(), M = G.MAT;
    return {
      x: G.clamp(G.rand(v.l + 200, v.r - 260), M.x + 150, M.x + M.w - 150),
      y: G.clamp(G.rand(v.t + 280, Math.max(v.t + 281, v.b - 300)), M.y + 120, M.y + M.h - 120),
    };
  }
  function spawn() {
    const v = G.viewWorld(), side = Math.random() < 0.5 ? -1 : 1;
    const fur = G.pick(FURS);
    const pr = () => [G.rand(-0.5, 0.5), G.rand(-0.5, 0.5)];
    cat = {
      x: side < 0 ? v.l - 200 : v.r + 200, y: G.rand(v.t + 280, Math.max(v.t + 281, v.b - 300)),
      face: -side, state: 'walk', stateT: 0, dur: 0, t: 0, ph: 0, life: G.rand(...STAY), fur, shaved: [],
      target: null, napAfter: false, holdT: 0, holdLimit: 0, kick: { x: 0, y: 0 }, kickT: 0,
      pupils: [pr(), pr(), pr()], wag: G.rand(0, 6),
    };
    cat.target = randomTarget();
    piece.colors = new Set([fur.base, ...(fur.patches || []).map(p => p[0])]);
    G.sfx('meow');
  }
  function despawn() { cat = null; nextSpawn = G.rand(...RESPAWN); }
  function visiblePiece() {
    const v = G.viewWorld();
    const ps = G.pieces.filter(p => !p.fly && p.x + p.w / 2 > v.l + 150 && p.x + p.w / 2 < v.r - 150 && p.y + p.h / 2 > v.t + 250 && p.y + p.h / 2 < v.b - 250);
    return ps.length ? G.pick(ps) : null;
  }
  function exitTarget(extra) {
    const v = G.viewWorld();
    const side = cat.x < (v.l + v.r) / 2 ? -1 : 1;
    return { x: side < 0 ? v.l - extra : v.r + extra, y: cat.y + G.rand(-150, 150) };
  }
  function flee() { cat.target = exitTarget(420); setState('flee'); }
  function decideNext() {
    if (cat.life <= 0) { cat.target = exitTarget(300); setState('leave'); return; }
    const r = Math.random();
    if (r < 0.35) {
      setState('sit', G.rand(2, 4));
      if (Math.random() < 0.4) G.sfx('meow');
    } else if (r < 0.65) {
      const p = visiblePiece();
      cat.target = p ? { x: p.x + p.w / 2, y: p.y + p.h / 2 } : randomTarget();
      cat.napAfter = !!p;
      setState('walk');
    } else {
      cat.target = randomTarget();
      setState('walk');
    }
  }
  function moveToward(speed, dt) {
    const dx = cat.target.x - cat.x, dy = cat.target.y - cat.y, d = Math.hypot(dx, dy);
    if (Math.abs(dx) > 2) cat.face = dx >= 0 ? 1 : -1;
    if (d < 6) return true;
    const step = Math.min(d, speed * dt);
    cat.x += dx / d * step; cat.y += dy / d * step;
    cat.ph += step * 0.09;
    return false;
  }
  function yowl(text) {
    G.sfx('yowl');
    G.addPopup({ world: true, x: cat.x, y: cat.y - 150, text, color: '#ff8fc7', bg: '#fff', burst: true, size: 26, life: 1.1 });
    const s = G.worldToScreen(cat.x, cat.y - 60);
    G.focusLines(s.x, s.y, { inner: 140 });
  }

  G.cat = { spawn: () => { if (active()) spawn(); } };
  G.on('roundStart', () => { cat = null; nextSpawn = G.rand(...FIRST_SPAWN); });
  G.on('update', dt => {
    if (G.state !== 'play') return;
    if (!active()) { cat = null; return; }
    if (!cat) { nextSpawn -= dt; if (nextSpawn <= 0) spawn(); return; }
    cat.t += dt; cat.stateT += dt; cat.life -= dt;
    switch (cat.state) {
      case 'walk':
        if (moveToward(WALK, dt)) {
          if (cat.napAfter) { cat.napAfter = false; setState('nap', G.rand(7, 11)); G.sfx('purr'); }
          else decideNext();
        }
        break;
      case 'sit': case 'dazed':
        if (cat.stateT > cat.dur) decideNext();
        break;
      case 'nap':
        if (cat.stateT > cat.dur) decideNext();
        else if (Math.floor(cat.stateT / 1.6) !== Math.floor((cat.stateT - dt) / 1.6)) G.sfx('purr');
        break;
      case 'leave': case 'flee': {
        const done = moveToward(cat.state === 'flee' ? FLEE : LEAVE, dt);
        const v = G.viewWorld();
        if (done || cat.x < v.l - 260 || cat.x > v.r + 260) { despawn(); return; }
        break;
      }
      case 'held': {
        const mw = G.mouseWorld();
        cat.holdT += dt; cat.kickT -= dt;
        if (cat.kickT <= 0) {
          cat.kickT = G.rand(0.35, 0.8);
          const a = G.rand(0, G.TAU);
          cat.kick.x = Math.cos(a) * G.rand(25, 55); cat.kick.y = Math.sin(a) * G.rand(15, 40);
          if (Math.random() < 0.5) G.sfx('hiss');
        }
        const k = Math.exp(-dt * 6);
        cat.kick.x *= k; cat.kick.y *= k;
        cat.x = mw.x + Math.sin(cat.t * 17) * 7 + cat.kick.x;
        cat.y = mw.y + 70 + Math.cos(cat.t * 13) * 5 + cat.kick.y;
        cat.ph += dt * 25;
        if (cat.holdT > cat.holdLimit) { yowl('HSSSSS!'); flee(); }
        break;
      }
    }
    render();
    const n = G.needle;
    if (cat.state !== 'held' && cat.state !== 'flee' && n.speed > 40 && alphaAt(n.x, n.y) > 110) {
      yowl('MRRROWW!!');
      n.speed = 0;
      flee();
    }
  });

  G.on('quake', k => {
    if (!cat || !active() || k < 0.5) return;
    if (cat.state === 'nap' || cat.state === 'sit') { yowl('MEW?!'); flee(); }
  });

  // ---------- input ----------
  G.on('mousedown', e => {
    if (!active() || !cat || e.button !== 0 || G.selected || cat.state === 'flee') return;
    if (G.cardAt(e.clientX, e.clientY) || G.overUI(e.clientX, e.clientY)) return;
    const w = G.screenToWorld(e.clientX, e.clientY);
    if (alphaAt(w.x, w.y) <= 110) return;
    setState('held');
    cat.holdT = 0; cat.holdLimit = G.rand(2.5, 5); cat.kickT = 0.2;
    G.sfx('yowl');
    return true;
  });
  window.addEventListener('mouseup', () => {
    if (cat && cat.state === 'held') { setState('dazed', G.rand(3, 4.5)); G.sfx('meow'); }
  });
  G.addGrabHover((wx, wy) => {
    if (!cat || !active()) return null;
    if (cat.state === 'held') return 'hold';
    return !G.selected && cat.state !== 'flee' && alphaAt(wx, wy) > 110 ? true : null;
  });
  G.addCutSource({
    check(order, wx, wy) {
      if (!active() || !cat || cat.state === 'held') return null;
      img();
      const shares = G.checkCutOn(piece, order, wx, wy);
      return shares ? { p: piece, shares } : null;
    },
    cut(order, wx, wy) {
      cat.shaved.push({ shape: order.shape, lx: (wx - cat.x) * cat.face, ly: wy - cat.y, rot: cat.face === 1 ? order.rot : -order.rot });
      yowl('YEOWCH!!');
      flee();
      render();
    },
  });

  // ---------- rendering ----------
  function pose() {
    const s = cat.state, wag = Math.sin(cat.t * 3 + cat.wag) * 12;
    if (s === 'sit' || s === 'dazed') return {
      body: [-10, 12, 92, 76], head: [60, -70, 54],
      legs: [[-58, 62, -36, 92], [40, 58, 44, 98], [-20, 70, 0, 94], [64, 58, 70, 98]],
      tail: [[-92, 50], [-150, 105], [-30, 96]],
    };
    if (s === 'nap') return {
      body: [0, 30, 118, 56], head: [92, 16, 48],
      legs: [[110, 62, 142, 70]],
      tail: [[-112, 30], [-100, 100], [20, 90]],
    };
    const sw = Math.sin(cat.ph) * 0.55, fl = s === 'held' ? 1.6 : 1;
    const leg = (hx, a) => [hx, 40, hx + Math.sin(a) * 34 * fl, 92 - Math.abs(Math.sin(a)) * 6];
    return {
      body: [0, 0, 112, 70], head: [100, -50, 54],
      legs: [leg(-64, sw), leg(-34, -sw), leg(52, -sw), leg(82, sw)],
      tail: [[-106, -8], [-176, -40 + wag], [-150, -104 + wag]],
    };
  }
  function ellPath([x, y, rx, ry]) { const p = new Path2D(); p.ellipse(x, y, rx, ry, 0, 0, G.TAU); return p; }
  function circlePath([x, y, r]) { const p = new Path2D(); p.arc(x, y, r, 0, G.TAU); return p; }
  function linePath([x1, y1, x2, y2]) { const p = new Path2D(); p.moveTo(x1, y1); p.lineTo(x2, y2); return p; }
  function tailPath([a, b, c]) { const p = new Path2D(); p.moveTo(a[0], a[1]); p.quadraticCurveTo(b[0], b[1], c[0], c[1]); return p; }
  function polyPath(pts) { const p = new Path2D(); G.polyPath(p, pts); return p; }
  function ears([hx, hy, r]) {
    return [
      polyPath([[hx - r * 0.75, hy - r * 0.45], [hx - r * 0.6, hy - r * 1.45], [hx - r * 0.05, hy - r * 0.92]]),
      polyPath([[hx + r * 0.05, hy - r * 0.95], [hx + r * 0.62, hy - r * 1.42], [hx + r * 0.88, hy - r * 0.42]]),
    ];
  }
  function fillPart(c, isData, path, fur) {
    c.fillStyle = fur; c.fill(path);
    c.save(); c.clip(path);
    if (cat.fur.patches) {
      for (const [ci, x, y, r] of cat.fur.patches) { c.fillStyle = G.COLORS[ci].hex; c.beginPath(); c.arc(x, y, r, 0, G.TAU); c.fill(); }
    }
    if (!isData && cat.fur.stripes) {
      c.strokeStyle = G.shade(fur, -0.28); c.lineWidth = 9;
      for (let x = -100; x <= 150; x += 28) { c.beginPath(); c.moveTo(x, -110); c.lineTo(x - 8, -40); c.stroke(); }
    }
    c.restore();
    if (!isData) { c.strokeStyle = G.OL; c.lineWidth = 5; c.stroke(path); }
  }
  function strokePart(c, isData, path, w, col) {
    if (!isData) { c.strokeStyle = G.OL; c.lineWidth = w + 9; c.stroke(path); }
    c.strokeStyle = col; c.lineWidth = isData ? w + 4 : w; c.stroke(path);
  }
  function drawFaceOn(c, P, fur) {
    const [hx, hy, r] = P.head, s = cat.state, OL = G.OL;
    const scared = s === 'held' || s === 'flee';
    c.lineWidth = 3.5; c.strokeStyle = OL;
    const eyes = [[hx + 4, hy - 6, r * 0.33], [hx + r * 0.62, hy - 2, r * 0.28]];
    if (cat.fur.alien) eyes.push([hx + r * 0.3, hy - r * 0.66, r * 0.2]);
    eyes.forEach(([ex, ey, er], i) => {
      if (s === 'nap') { c.beginPath(); c.arc(ex, ey, er * 0.7, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); return; }
      c.beginPath(); c.arc(ex, ey, er, 0, G.TAU); c.fillStyle = '#fff'; c.fill(); c.stroke();
      if (s === 'dazed') {
        c.beginPath();
        for (let a = 0; a < 10; a += 0.4) { const rr = a / 10 * er * 0.85; c.lineTo(ex + Math.cos(a + cat.t * 6) * rr, ey + Math.sin(a + cat.t * 6) * rr); }
        c.lineWidth = 2; c.stroke(); c.lineWidth = 3.5;
        return;
      }
      const pp = cat.pupils[i];
      c.beginPath(); c.arc(ex + pp[0] * er * 0.5, ey + pp[1] * er * 0.5, er * (scared ? 0.14 : 0.24), 0, G.TAU); c.fillStyle = OL; c.fill();
      if (s === 'sit') {
        c.save(); c.beginPath(); c.arc(ex, ey, er - 1.5, 0, G.TAU); c.clip();
        c.fillStyle = fur; c.fillRect(ex - er, ey - er, er * 2, er); c.restore();
        c.beginPath(); c.moveTo(ex - er, ey); c.lineTo(ex + er, ey); c.stroke();
      }
      if (scared) { c.beginPath(); c.moveTo(ex - er, ey - er * 1.5); c.lineTo(ex + er * 0.8, ey - er * 0.95); c.lineWidth = 4.5; c.stroke(); c.lineWidth = 3.5; }
    });
    c.fillStyle = '#ff8fb0';
    c.beginPath(); c.moveTo(hx + r * 0.42, hy + r * 0.24); c.lineTo(hx + r * 0.6, hy + r * 0.24); c.lineTo(hx + r * 0.51, hy + r * 0.35); c.closePath();
    c.fill(); c.lineWidth = 2; c.stroke();
    const mx = hx + r * 0.5, my = hy + r * 0.47;
    if (scared) {
      c.beginPath(); c.ellipse(mx, my + 7, 10, 13, 0, 0, G.TAU); c.fillStyle = '#5a1530'; c.fill(); c.lineWidth = 3; c.stroke();
      c.fillStyle = '#fff';
      for (const fx of [-5, 5]) { c.beginPath(); c.moveTo(mx + fx - 3, my - 4); c.lineTo(mx + fx + 3, my - 4); c.lineTo(mx + fx, my + 4); c.closePath(); c.fill(); }
    } else {
      c.beginPath(); c.moveTo(mx - 9, my); c.quadraticCurveTo(mx - 4, my + 6, mx, my); c.quadraticCurveTo(mx + 4, my + 6, mx + 9, my);
      c.lineWidth = 2.5; c.stroke();
    }
    c.lineWidth = 2;
    for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(mx + 8, my - 4 + i * 5); c.lineTo(mx + 36, my - 8 + i * 10); c.stroke(); }
  }
  function render() {
    piece.x = cat.x - OX; piece.y = cat.y - OY;
    const P = pose();
    const fur = G.COLORS[cat.fur.base].hex;
    for (const [c, isData] of [[vctx, false], [dctx, true]]) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, CVW, CVH);
      c.save();
      c.translate(OX, OY); c.scale(cat.face, 1);
      if (cat.state === 'held') c.rotate(Math.sin(cat.t * 14) * 0.22);
      c.lineJoin = 'round'; c.lineCap = 'round';
      strokePart(c, isData, tailPath(P.tail), 24, fur);
      P.legs.forEach((l, i) => { if (i % 2 === 0) strokePart(c, isData, linePath(l), 24, isData ? fur : G.shade(fur, -0.12)); });
      fillPart(c, isData, ellPath(P.body), fur);
      P.legs.forEach((l, i) => { if (i % 2 === 1) strokePart(c, isData, linePath(l), 24, fur); });
      for (const e of ears(P.head)) fillPart(c, isData, e, fur);
      fillPart(c, isData, circlePath(P.head), fur);
      if (!isData) drawFaceOn(c, P, fur);
      for (const sp of cat.shaved) {
        const path = G.SHAPE_DEFS[sp.shape].path;
        c.save(); c.translate(sp.lx, sp.ly); c.rotate(sp.rot);
        if (isData) { c.globalCompositeOperation = 'destination-out'; c.fill(path); }
        else {
          c.globalCompositeOperation = 'source-atop';
          c.fillStyle = '#ffc2d1'; c.fill(path);
          c.setLineDash([5, 5]); c.strokeStyle = G.OL; c.lineWidth = 3; c.stroke(path); c.setLineDash([]);
        }
        c.restore();
      }
      c.restore();
    }
    dirty = true;
  }

  G.on('drawWorld', ctx => {
    if (!cat || !active()) return;
    const held = cat.state === 'held';
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(cat.x, cat.y + (held ? 150 : 82), held ? 70 : 115, held ? 12 : 18, 0, 0, G.TAU); ctx.fill();
    ctx.drawImage(vis, piece.x, piece.y);
    const P = pose();
    const hx = cat.x + P.head[0] * cat.face, hy = cat.y + P.head[1];
    if (cat.state === 'nap') {
      for (let i = 0; i < 3; i++) {
        const k = (cat.t * 0.5 + i / 3) % 1;
        ctx.globalAlpha = 1 - k;
        G.text('z', hx + cat.face * (30 + k * 40), hy - 50 - k * 70, 18 + k * 14, '#fff');
      }
      ctx.globalAlpha = 1;
    } else if (cat.state === 'dazed') {
      ctx.fillStyle = '#ffe066'; ctx.strokeStyle = G.OL; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
      for (let i = 0; i < 3; i++) {
        const a = cat.t * 4 + i * G.TAU / 3;
        const sx = hx + Math.cos(a) * 50, sy = hy - 70 + Math.sin(a) * 14;
        ctx.beginPath();
        for (let j = 0; j < 10; j++) { const r = j % 2 ? 4 : 10, b = -Math.PI / 2 + j * Math.PI / 5; ctx.lineTo(sx + Math.cos(b) * r, sy + Math.sin(b) * r); }
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
    ctx.restore();
  });
})();

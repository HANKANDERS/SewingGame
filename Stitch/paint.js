// paint buckets on the table. move them too fast (or let the reno shake them) and they spill, dyeing the fabric
'use strict';
(() => {
  const G = window.Game;
  if (!G) return;

  const MAX_BUCKETS = 2;
  const FIRST = [18, 30], INTERVAL = [25, 45];
  const SAFE_SPEED = 450, TIP_RATE = 0.004;
  const WET_TIME = 9, FADE_TIME = 4;
  const BR = 34;

  let buckets = [], puddles = [], next = 0, held = null;
  const active = () => G.state === 'play' && G.eventOn('paint');

  function spawn() {
    const v = G.viewWorld(), M = G.MAT;
    const x = G.clamp(G.rand(v.l + 200, v.r - 260), M.x + 100, M.x + M.w - 100);
    const y = G.clamp(G.rand(v.t + 280, Math.max(v.t + 281, v.b - 300)), M.y + 100, M.y + M.h - 100);
    buckets.push({ x, y, ci: G.randi(0, 5), state: 'drop', t: 0, tilt: 0, vx: 0, vy: 0, px: x, py: y, slosh: 0, ph: G.rand(0, 6), dir: 0, gone: 0 });
  }
  function bucketAt(wx, wy) {
    for (let i = buckets.length - 1; i >= 0; i--) {
      const b = buckets[i];
      if (b.state !== 'stand' && b.state !== 'held') continue;
      if (Math.abs(wx - b.x) < BR + 6 && wy > b.y - BR * 2.2 && wy < b.y + 14) return b;
    }
    return null;
  }

  function makePuddle(x, y, dir, ci) {
    const n = 22, pts = [];
    const stretch = 1.5;
    for (let i = 0; i < n; i++) {
      const a = i / n * G.TAU;
      let r = 75 * (0.75 + Math.random() * 0.45);
      if (Math.random() < 0.25) r *= 1.35;
      const lx = Math.cos(a) * r * stretch, ly = Math.sin(a) * r;
      pts.push([lx * Math.cos(dir) - ly * Math.sin(dir), lx * Math.sin(dir) + ly * Math.cos(dir)]);
    }
    const path = new Path2D();
    const a0 = pts[n - 1], b0 = pts[0];
    path.moveTo((a0[0] + b0[0]) / 2, (a0[1] + b0[1]) / 2);
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      path.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    }
    path.closePath();
    const drops = [];
    for (let i = 0; i < 9; i++) {
      const a = dir + G.rand(-0.9, 0.9), d = G.rand(130, 210);
      drops.push([Math.cos(a) * d, Math.sin(a) * d, G.rand(6, 15)]);
    }
    for (const [dx, dy, r] of drops) path.moveTo(dx + r, dy), path.arc(dx, dy, r, 0, G.TAU);
    let mx = 0;
    for (const [px, py] of pts) mx = Math.max(mx, Math.abs(px), Math.abs(py));
    return { x, y, ci, path, ext: Math.max(mx, 230), t: 0, dyed: new Map(), checkT: 0 };
  }

  function spill(b, dir) {
    b.state = 'tipped'; b.t = 0; b.dir = dir;
    if (held === b) held = null;
    const px = b.x + Math.cos(dir) * 90, py = b.y - 10 + Math.sin(dir) * 60;
    puddles.push(makePuddle(px, py, dir, b.ci));
    G.sfx('splash');
    const col = G.COLORS[b.ci].hex;
    for (let i = 0; i < 22; i++) {
      const a = dir + G.rand(-0.8, 0.8), s = G.rand(150, 420);
      G.particles.push({ x: b.x, y: b.y - BR, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: G.rand(0.3, 0.6), t: 0, color: col, size: G.rand(4, 9) });
    }
  }

  function dye(pd, p) {
    const ox = pd.x - p.x, oy = pd.y - p.y;
    const col = G.COLORS[pd.ci].hex;
    for (const [c, isVis] of [[p.dctx, false], [p.vctx, true]]) {
      c.save();
      c.globalCompositeOperation = 'source-atop';
      c.translate(ox, oy);
      c.fillStyle = col; c.fill(pd.path);
      if (isVis) {
        c.strokeStyle = G.shade(col, -0.35); c.lineWidth = 5; c.stroke(pd.path);
        c.fillStyle = 'rgba(255,255,255,0.3)';
        c.beginPath(); c.ellipse(-20, -18, 30, 10, -0.4, 0, G.TAU); c.fill();
      }
      c.restore();
    }
    p.colors.add(pd.ci);
    p.refresh();
  }
  function overlaps(pd, p) {
    return p.x < pd.x + pd.ext && p.x + p.w > pd.x - pd.ext && p.y < pd.y + pd.ext && p.y + p.h > pd.y - pd.ext;
  }

  G.paint = { spawn: () => { if (active()) spawn(); } };
  G.on('roundStart', () => { buckets = []; puddles = []; held = null; next = G.rand(...FIRST); });
  G.on('quake', k => {
    if (!active()) return;
    for (const b of buckets) {
      if (b.state !== 'stand') continue;
      b.slosh = Math.max(b.slosh, k);
      if (Math.random() < k * 0.35) spill(b, G.rand(0, G.TAU));
    }
  });
  G.on('update', dt => {
    if (G.state !== 'play') return;
    if (!active()) { buckets = []; puddles = []; held = null; return; }
    next -= dt;
    if (next <= 0) { next = G.rand(...INTERVAL); if (buckets.filter(b => b.state !== 'tipped').length < MAX_BUCKETS) spawn(); }

    for (const b of buckets) {
      b.t += dt; b.ph += dt;
      b.slosh = Math.max(0, b.slosh - dt * 1.5);
      if (b.state === 'drop' && b.t > 0.45) { b.state = 'stand'; b.t = 0; G.sfx('plonk'); G.emit('quake', 0.05); }
      else if (b.state === 'held') {
        const mw = G.mouseWorld();
        b.x = mw.x + held.ox; b.y = mw.y + held.oy;
        const ivx = (b.x - b.px) / Math.max(dt, 1e-3), ivy = (b.y - b.py) / Math.max(dt, 1e-3);
        const k = 1 - Math.exp(-dt * 12);
        b.vx += (ivx - b.vx) * k; b.vy += (ivy - b.vy) * k;
        const sp = Math.hypot(b.vx, b.vy);
        b.tilt += (G.clamp(b.vx / 1400, -0.5, 0.5) - b.tilt) * k;
        if (sp > SAFE_SPEED) {
          b.slosh = Math.min(1, b.slosh + dt * 3);
          if (Math.random() < dt * 4) G.sfx('slosh');
          if (Math.random() < (sp - SAFE_SPEED) * TIP_RATE * dt) spill(b, Math.atan2(b.vy, b.vx));
        }
      } else if (b.state === 'stand') b.tilt *= Math.exp(-dt * 8);
      else if (b.state === 'tipped') b.tilt += (Math.sign(Math.cos(b.dir) || 1) * 1.45 - b.tilt) * (1 - Math.exp(-dt * 14));
      b.px = b.x; b.py = b.y;
    }
    buckets = buckets.filter(b => !(b.state === 'tipped' && b.t > WET_TIME + FADE_TIME));

    for (const pd of puddles) {
      pd.t += dt;
      if (pd.t < 0.45 || pd.t > WET_TIME) continue;
      pd.checkT -= dt;
      if (pd.checkT > 0) continue;
      pd.checkT = 0.2;
      for (const p of G.pieces) {
        if (p.fly || !overlaps(pd, p)) continue;
        const last = pd.dyed.get(p);
        if (last && Math.abs(last.x - p.x) < 6 && Math.abs(last.y - p.y) < 6) continue;
        pd.dyed.set(p, { x: p.x, y: p.y });
        dye(pd, p);
      }
    }
    puddles = puddles.filter(pd => pd.t < WET_TIME + FADE_TIME);
  });

  G.on('mousedown', e => {
    if (!active() || e.button !== 0 || G.selected) return;
    if (G.cardAt(e.clientX, e.clientY) || G.overUI(e.clientX, e.clientY)) return;
    const w = G.screenToWorld(e.clientX, e.clientY);
    const b = bucketAt(w.x, w.y);
    if (!b) return;
    b.state = 'held'; b.vx = 0; b.vy = 0; b.px = b.x; b.py = b.y;
    held = b; held.ox = b.x - w.x; held.oy = b.y - w.y;
    buckets = buckets.filter(x => x !== b); buckets.push(b);
    G.sfx('grab');
    return true;
  });
  window.addEventListener('mouseup', () => {
    if (held && held.state === 'held') { held.state = 'stand'; G.sfx('plonk'); }
    held = null;
  });
  G.addGrabHover((wx, wy) => {
    if (!active()) return null;
    if (held) return 'hold';
    return !G.selected && bucketAt(wx, wy) ? true : null;
  });

  // ---------- rendering ----------
  G.on('drawTable', ctx => {
    if (!active()) return;
    for (const pd of puddles) {
      const grow = G.easeOut(Math.min(1, pd.t / 0.45));
      const dry = pd.t > WET_TIME ? 1 - (pd.t - WET_TIME) / FADE_TIME : 1;
      const col = G.COLORS[pd.ci].hex;
      ctx.save();
      ctx.translate(pd.x, pd.y); ctx.scale(grow, grow);
      ctx.globalAlpha = Math.max(0, dry);
      ctx.fillStyle = col; ctx.fill(pd.path);
      ctx.lineWidth = 5; ctx.strokeStyle = G.OL; ctx.stroke(pd.path);
      if (pd.t < WET_TIME) {
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath(); ctx.ellipse(-30, -20, 34, 10, -0.3, 0, G.TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(28, 16, 12, 5, -0.3, 0, G.TAU); ctx.fill();
      }
      ctx.restore();
    }
  });

  G.on('drawWorld', ctx => {
    if (!active()) return;
    const OL = G.OL, TAU = G.TAU;
    for (const b of buckets) {
      const col = G.COLORS[b.ci].hex;
      let dy = 0, sq = 1;
      if (b.state === 'drop') { const k = Math.min(1, b.t / 0.45); dy = -(1 - k * k) * 500; }
      if (b.state === 'stand' && b.t < 0.2) sq = 1 - Math.sin(b.t / 0.2 * Math.PI) * 0.15;
      const fade = b.state === 'tipped' && b.t > WET_TIME ? 1 - (b.t - WET_TIME) / FADE_TIME : 1;
      const held = b.state === 'held';
      ctx.save();
      ctx.globalAlpha = Math.max(0, fade);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(b.x + (held ? 10 : 4), b.y + (held ? 18 : 6), BR * 1.2, BR * 0.35, 0, 0, TAU); ctx.fill();
      ctx.translate(b.x, b.y + dy - (held ? 10 : 0));
      ctx.rotate(b.tilt);
      ctx.scale(1 / sq, sq);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = OL; ctx.lineWidth = 4;
      const h = BR * 2;
      ctx.beginPath();
      ctx.moveTo(-BR, -h); ctx.lineTo(-BR * 0.85, 0);
      ctx.quadraticCurveTo(0, BR * 0.35, BR * 0.85, 0);
      ctx.lineTo(BR, -h); ctx.closePath();
      ctx.fillStyle = '#c9cfe0'; ctx.fill(); ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.rect(-BR * 0.93, -h * 0.62, BR * 1.86, h * 0.3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(-BR * 0.7, -h + 6, 7, h - 14);
      for (let i = 0; i < 3; i++) {
        const x = -BR * 0.6 + i * BR * 0.55, l = 10 + ((i * 7 + 3) % 9);
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(x - 5, -h); ctx.lineTo(x - 5, -h + l); ctx.arc(x, -h + l, 5, Math.PI, 0, true); ctx.lineTo(x + 5, -h); ctx.closePath();
        ctx.fill(); ctx.lineWidth = 2.5; ctx.stroke(); ctx.lineWidth = 4;
      }
      ctx.beginPath(); ctx.ellipse(0, -h, BR, BR * 0.32, 0, 0, TAU);
      ctx.fillStyle = '#8f96b2'; ctx.fill(); ctx.stroke();
      if (b.state !== 'tipped') {
        const wave = Math.sin(b.ph * 14) * 4 * b.slosh;
        ctx.save();
        ctx.beginPath(); ctx.ellipse(0, -h, BR - 3, BR * 0.32 - 3, 0, 0, TAU); ctx.clip();
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(-BR, -h + 2 + wave); ctx.quadraticCurveTo(0, -h - 4 - wave * 2, BR, -h + 2 - wave); ctx.lineTo(BR, -h + 20); ctx.lineTo(-BR, -h + 20); ctx.closePath(); ctx.fill();
        ctx.restore();
        ctx.beginPath(); ctx.ellipse(0, -h, BR, BR * 0.32, 0, 0, TAU); ctx.lineWidth = 4; ctx.stroke();
      }
      const ha = held ? -0.15 : 0.5 + Math.sin(b.ph * 2) * 0.05;
      ctx.save(); ctx.translate(0, -h); ctx.rotate(ha);
      ctx.beginPath(); ctx.ellipse(0, -2, BR * 0.95, BR * 0.85, 0, Math.PI * 1.05, Math.PI * 1.95);
      ctx.lineWidth = 4; ctx.strokeStyle = '#5a5f80'; ctx.stroke();
      ctx.restore();
      ctx.restore();
    }
  });
})();

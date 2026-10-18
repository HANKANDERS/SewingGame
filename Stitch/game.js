'use strict';
(() => {
  const cvs = document.getElementById('game');
  const ctx = cvs.getContext('2d');
  let W = 0, H = 0, DPR = 1;

  const TAU = Math.PI * 2;
  const OL = '#1d1630';
  const FONT = '"Comic Sans MS","Chalkboard SE","Microsoft YaHei","PingFang SC",sans-serif';
  const GAME_TIME = 180;
  const MAX_ORDERS = 6;
  const MAX_PIECES = 22;
  const S = 58;
  const ICON = 30;
  const CW = 150, CH = 124, GAP = 12, CARD_Y = 24;
  const MAT = { x: 0, y: 0, w: 3200, h: 2200 };
  const STITCH_LEN = 9;
  const NEED = { 1: 0.6, 2: 0.25, 3: 0.15 };

  const rand = (a, b) => a + Math.random() * (b - a);
  const randi = (a, b) => Math.floor(rand(a, b + 1));
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

  const COLORS = [
    { name: 'Red', hex: '#e8434f' },
    { name: 'Yellow', hex: '#f7d038' },
    { name: 'Blue', hex: '#3d8ee8' },
    { name: 'Green', hex: '#7cc84a' },
    { name: 'Purple', hex: '#9b5de5' },
    { name: 'Orange', hex: '#f28c28' },
  ];
  const hexRgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  COLORS.forEach(c => c.rgb = hexRgb(c.hex));
  function shade(hex, amt) {
    const [r, g, b] = hexRgb(hex);
    const t = amt < 0 ? 0 : 255, k = Math.abs(amt);
    const f = v => Math.round(v + (t - v) * k);
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  }
  const colorCache = new Map();
  function nearestColor(r, g, b) {
    const key = (r << 16) | (g << 8) | b;
    let v = colorCache.get(key);
    if (v !== undefined) return v;
    let best = 0, bd = 1e9;
    COLORS.forEach((c, i) => {
      const d = (c.rgb[0] - r) ** 2 + (c.rgb[1] - g) ** 2 + (c.rgb[2] - b) ** 2;
      if (d < bd) { bd = d; best = i; }
    });
    colorCache.set(key, best);
    return best;
  }

  // ---------- hand-drawn helpers ----------
  let boil = 0, boilT = 0;
  const wob = (seed, i, amp) => (hash(seed * 13.17 + i * 7.73 + boil * 91.3) - 0.5) * 2 * amp;

  function smoothClosed(p, pts) {
    const n = pts.length;
    const a0 = pts[n - 1], b0 = pts[0];
    p.moveTo((a0[0] + b0[0]) / 2, (a0[1] + b0[1]) / 2);
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      p.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    }
    p.closePath();
  }
  function polyPath(p, pts) {
    p.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
    p.closePath();
  }
  // The wob* builders set ctx's current path AND return the same shape as a Path2D.
  function wobEllipse(x, y, rx, ry, seed, amp) {
    const pts = [];
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * TAU;
      pts.push([x + Math.cos(a) * rx + wob(seed, i, amp), y + Math.sin(a) * ry + wob(seed, i + 50, amp)]);
    }
    const p = new Path2D(); smoothClosed(p, pts);
    ctx.beginPath(); smoothClosed(ctx, pts);
    return p;
  }
  function wobPoly(corners, seed, amp, seg = 3) {
    const pts = [];
    let k = 0;
    for (let c = 0; c < corners.length; c++) {
      const a = corners[c], b = corners[(c + 1) % corners.length];
      for (let i = 0; i < seg; i++) {
        const t = i / seg;
        pts.push([lerp(a[0], b[0], t) + wob(seed, k, amp), lerp(a[1], b[1], t) + wob(seed, k + 99, amp)]);
        k++;
      }
    }
    const p = new Path2D(); polyPath(p, pts);
    ctx.beginPath(); polyPath(ctx, pts);
    return p;
  }
  function wobRect(x, y, w, h, seed, amp) {
    return wobPoly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], seed, amp, 4);
  }
  // Comic ink: contour is heavier on the shadow side (screen bottom-right) whatever the current transform.
  function inkFill(path, fill, lw) {
    const m = ctx.getTransform(), sc = Math.hypot(m.a, m.b);
    ctx.save();
    ctx.setTransform(m.a, m.b, m.c, m.d, m.e + lw * 0.5 * sc, m.f + lw * 0.7 * sc);
    ctx.lineJoin = 'round'; ctx.lineWidth = lw * 1.6; ctx.strokeStyle = OL; ctx.stroke(path);
    ctx.restore();
    ctx.fillStyle = fill; ctx.fill(path);
    ctx.lineJoin = 'round'; ctx.lineWidth = lw; ctx.strokeStyle = OL; ctx.stroke(path);
  }
  // Brush stroke along a quadratic curve: thin ends, fat middle. Uses the current fillStyle.
  function taper(x0, y0, cx, cy, x1, y1, w) {
    const N = 10, L = [], R = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, u = 1 - t;
      const x = u * u * x0 + 2 * u * t * cx + t * t * x1, y = u * u * y0 + 2 * u * t * cy + t * t * y1;
      const dx = 2 * u * (cx - x0) + 2 * t * (x1 - cx), dy = 2 * u * (cy - y0) + 2 * t * (y1 - cy);
      const l = Math.hypot(dx, dy) || 1, hw = w / 2 * (0.12 + 0.88 * Math.sin(Math.PI * t));
      L.push([x - dy / l * hw, y + dx / l * hw]); R.push([x + dy / l * hw, y - dx / l * hw]);
    }
    ctx.beginPath(); ctx.moveTo(L[0][0], L[0][1]);
    for (const p of L) ctx.lineTo(p[0], p[1]);
    for (let i = R.length - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
    ctx.closePath(); ctx.fill();
  }
  const taperLine = (x0, y0, x1, y1, w) => taper(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2, x1, y1, w);
  function text(str, x, y, size, color, align = 'center', outline = true, base = 'middle') {
    ctx.font = `bold ${size}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = base;
    if (outline) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(3, size * 0.22);
      ctx.strokeStyle = OL;
      ctx.strokeText(str, x, y);
    }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }
  function makeCanvas(w, h, read) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, w); c.height = Math.max(1, h);
    return [c, c.getContext('2d', read ? { willReadFrequently: true } : undefined)];
  }

  // ---------- shapes ----------
  function ell(p, cx, cy, rx, ry, rot) {
    p.moveTo(cx + rx * Math.cos(rot), cy + rx * Math.sin(rot));
    p.ellipse(cx, cy, rx, ry, rot, 0, TAU);
    p.closePath();
  }
  function polyPos(p, pts) {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const u = pts[i], v = pts[(i + 1) % pts.length];
      a += u[0] * v[1] - v[0] * u[1];
    }
    polyPath(p, a < 0 ? pts.slice().reverse() : pts);
  }
  const SHAPE_DEFS = {
    star: { name: 'Star', build: (p, s) => { const pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5; const r = (i % 2 ? 0.47 : 1.02) * s; pts.push([Math.cos(a) * r, Math.sin(a) * r + 0.08 * s]); } polyPath(p, pts); } },
    heart: { name: 'Heart', build: (p, s) => { p.moveTo(0, 0.9 * s); p.bezierCurveTo(-1.35 * s, 0, -0.85 * s, -1.15 * s, 0, -0.45 * s); p.bezierCurveTo(0.85 * s, -1.15 * s, 1.35 * s, 0, 0, 0.9 * s); p.closePath(); } },
    shirt: { name: 'T-Shirt', poly: [[-0.3, -0.85], [-0.12, -0.68], [0.12, -0.68], [0.3, -0.85], [0.98, -0.48], [0.76, -0.08], [0.5, -0.22], [0.5, 0.9], [-0.5, 0.9], [-0.5, -0.22], [-0.76, -0.08], [-0.98, -0.48]] },
    sock: { name: 'Sock', poly: [[-0.5, -0.95], [0.15, -0.95], [0.15, 0.18], [0.75, 0.32], [0.95, 0.6], [0.78, 0.92], [-0.12, 0.92], [-0.45, 0.72], [-0.5, 0.4]] },
    bolt: { name: 'Bolt', poly: [[0.12, -1], [-0.62, 0.12], [-0.08, 0.12], [-0.3, 1], [0.66, -0.22], [0.1, -0.22], [0.42, -1]] },
    bowtie: { name: 'Bow Tie', poly: [[-0.98, -0.62], [-0.15, -0.18], [0.15, -0.18], [0.98, -0.62], [0.98, 0.62], [0.15, 0.18], [-0.15, 0.18], [-0.98, 0.62]] },
    pants: { name: 'Pants', poly: [[-0.62, -0.92], [0.62, -0.92], [0.72, 0.95], [0.18, 0.95], [0, -0.15], [-0.18, 0.95], [-0.72, 0.95]] },
    fish: { name: 'Fish', build: (p, s) => { ell(p, -0.2 * s, 0, 0.7 * s, 0.5 * s, 0); polyPos(p, [[0.35 * s, 0], [1.0 * s, -0.58 * s], [1.0 * s, 0.58 * s]]); } },
    cat: { name: 'Cat', build: (p, s) => { ell(p, 0, 0.12 * s, 0.74 * s, 0.7 * s, 0); polyPos(p, [[-0.7 * s, -0.05 * s], [-0.64 * s, -0.98 * s], [-0.1 * s, -0.5 * s]]); polyPos(p, [[0.7 * s, -0.05 * s], [0.64 * s, -0.98 * s], [0.1 * s, -0.5 * s]]); } },
    drop: { name: 'Drop', build: (p, s) => { p.moveTo(0, -1.0 * s); p.bezierCurveTo(0.3 * s, -0.5 * s, 0.74 * s, -0.1 * s, 0.74 * s, 0.3 * s); p.bezierCurveTo(0.74 * s, 0.75 * s, 0.38 * s, 0.96 * s, 0, 0.96 * s); p.bezierCurveTo(-0.38 * s, 0.96 * s, -0.74 * s, 0.75 * s, -0.74 * s, 0.3 * s); p.bezierCurveTo(-0.74 * s, -0.1 * s, -0.3 * s, -0.5 * s, 0, -1.0 * s); p.closePath(); } },
  };
  const SHAPE_KEYS = Object.keys(SHAPE_DEFS);
  const [, sctx] = makeCanvas(300, 300);
  sctx.setTransform(1, 0, 0, 1, 150, 150);
  function buildShape(def, s) {
    const p = new Path2D();
    if (def.poly) polyPath(p, def.poly.map(([x, y]) => [x * s, y * s]));
    else def.build(p, s);
    return p;
  }
  for (const k of SHAPE_KEYS) {
    const d = SHAPE_DEFS[k];
    d.path = buildShape(d, S);
    d.icon = buildShape(d, ICON);
    d.samples = [];
    for (let y = -S * 1.1; y <= S * 1.1; y += 5)
      for (let x = -S * 1.1; x <= S * 1.1; x += 5)
        if (sctx.isPointInPath(d.path, x + 150, y + 150)) d.samples.push([x, y]);
  }

  // ---------- module hooks ----------
  // Optional modules (audio.js / shop.js / tutorial.js) plug in via window.Game.
  // Core never depends on them: every hook is a no-op when nobody listens.
  const hooks = {};
  function on(ev, fn) { (hooks[ev] = hooks[ev] || []).push(fn); }
  function emit(ev, ...args) {
    const list = hooks[ev];
    if (!list) return false;
    let consumed = false;
    for (const fn of list) {
      try { if (fn(...args) === true) consumed = true; } catch (e) { console.error(`[hook ${ev}]`, e); }
    }
    return consumed;
  }
  let lastStitchSnd = 0;
  const sfx = name => emit('sfx', name);

  // ---------- fabric pieces ----------
  let zCounter = 0;
  class Piece {
    constructor(w, h) {
      this.w = Math.ceil(w); this.h = Math.ceil(h);
      [this.vis, this.vctx] = makeCanvas(this.w, this.h);
      [this.data, this.dctx] = makeCanvas(this.w, this.h, true);
      this.x = 0; this.y = 0; this.z = ++zCounter;
      this.img = null; this.fly = null; this.colors = new Set();
    }
    refresh() { this.img = this.dctx.getImageData(0, 0, this.w, this.h); }
    alphaAt(wx, wy) {
      const lx = Math.floor(wx - this.x), ly = Math.floor(wy - this.y);
      if (lx < 0 || ly < 0 || lx >= this.w || ly >= this.h) return 0;
      return this.img.data[(ly * this.w + lx) * 4 + 3];
    }
    opaqueCount() {
      const d = this.img.data; let n = 0;
      for (let i = 3; i < d.length; i += 8) if (d[i] > 110) n++;
      return n * 2;
    }
  }
  const PATTERNS = ['dots', 'stripes', 'plaid', 'zigzag', 'cross', 'plain'];
  function drawPattern(c, w, h, hex, kind) {
    const dark = shade(hex, -0.22), light = shade(hex, 0.3);
    c.save();
    if (kind === 'dots') {
      c.fillStyle = light;
      for (let y = 0, r = 0; y < h + 20; y += 20, r++)
        for (let x = (r % 2) * 10; x < w + 20; x += 20) { c.beginPath(); c.arc(x, y, 4, 0, TAU); c.fill(); }
    } else if (kind === 'stripes') {
      c.strokeStyle = dark; c.lineWidth = 7;
      for (let k = -h; k < w; k += 22) { c.beginPath(); c.moveTo(k, 0); c.lineTo(k + h, h); c.stroke(); }
    } else if (kind === 'plaid') {
      c.globalAlpha = 0.35; c.fillStyle = dark;
      for (let x = 0; x < w; x += 36) c.fillRect(x, 0, 12, h);
      for (let y = 0; y < h; y += 36) c.fillRect(0, y, w, 12);
      c.globalAlpha = 0.6; c.strokeStyle = light; c.lineWidth = 2;
      for (let x = 24; x < w; x += 36) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    } else if (kind === 'zigzag') {
      c.strokeStyle = light; c.lineWidth = 4; c.lineJoin = 'round';
      for (let y = 10; y < h; y += 24) {
        c.beginPath();
        for (let x = 0, i = 0; x <= w + 12; x += 12, i++) c.lineTo(x, y + (i % 2 ? 6 : -6));
        c.stroke();
      }
    } else if (kind === 'cross') {
      c.strokeStyle = dark; c.lineWidth = 3; c.lineCap = 'round';
      for (let y = 12; y < h; y += 26) for (let x = 12; x < w; x += 26) {
        c.beginPath(); c.moveTo(x - 5, y); c.lineTo(x + 5, y); c.moveTo(x, y - 5); c.lineTo(x, y + 5); c.stroke();
      }
    } else {
      c.strokeStyle = 'rgba(0,0,0,0.09)'; c.lineWidth = 2;
      for (let i = 0; i < w * h / 500; i++) {
        const x = Math.random() * w, y = Math.random() * h;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + rand(4, 9), y + rand(-2, 2)); c.stroke();
      }
    }
    c.restore();
  }
  function genFabric(ci, size) {
    const n = randi(12, 20);
    const sx = rand(0.75, 1.3), sy = rand(0.75, 1.3);
    const ph = rand(0, TAU), ph2 = rand(0, TAU);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + rand(-0.12, 0.12);
      let r = size * (0.8 + 0.14 * Math.sin(a * 2 + ph) + 0.1 * Math.sin(a * 3 + ph2) + rand(-0.08, 0.08));
      if (Math.random() < 0.15) r *= 0.74;
      pts.push([Math.cos(a) * r * sx, Math.sin(a) * r * sy]);
    }
    let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    for (const [x, y] of pts) { minx = Math.min(minx, x); miny = Math.min(miny, y); maxx = Math.max(maxx, x); maxy = Math.max(maxy, y); }
    const pad = 10;
    for (const p of pts) { p[0] += -minx + pad; p[1] += -miny + pad; }
    const pc = new Piece(maxx - minx + pad * 2, maxy - miny + pad * 2);
    const path = new Path2D();
    const n2 = pts.length;
    const a0 = pts[n2 - 1], b0 = pts[0];
    path.moveTo((a0[0] + b0[0]) / 2, (a0[1] + b0[1]) / 2);
    for (let i = 0; i < n2; i++) {
      const a = pts[i], b = pts[(i + 1) % n2];
      if (Math.random() < 0.3) { path.lineTo(a[0], a[1]); path.lineTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); }
      else path.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    }
    path.closePath();
    const hex = COLORS[ci].hex;
    pc.dctx.fillStyle = hex; pc.dctx.fill(path);
    const v = pc.vctx;
    v.fillStyle = hex; v.fill(path);
    v.save(); v.clip(path);
    drawPattern(v, pc.w, pc.h, hex, pick(PATTERNS));
    v.strokeStyle = 'rgba(255,255,255,0.35)'; v.lineWidth = 6;
    v.translate(-3, -3); v.stroke(path);
    v.restore();
    v.lineJoin = 'round'; v.lineCap = 'round';
    v.strokeStyle = OL; v.lineWidth = 4.5; v.stroke(path);
    v.save(); v.globalCompositeOperation = 'destination-over'; v.translate(2, 2.8); v.lineWidth = 6; v.stroke(path); v.restore();
    v.lineWidth = 2;
    for (const [x, y] of pts) {
      if (Math.random() < 0.5) continue;
      const cx = pc.w / 2, cy = pc.h / 2;
      const dx = x - cx, dy = y - cy, L = Math.hypot(dx, dy) || 1;
      v.beginPath(); v.moveTo(x, y); v.lineTo(x + dx / L * 6 + rand(-2, 2), y + dy / L * 6 + rand(-2, 2)); v.stroke();
    }
    pc.colors.add(ci);
    pc.refresh();
    return pc;
  }
  function composePieces(list) {
    list.sort((a, b) => a.z - b.z);
    let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    for (const p of list) { minx = Math.min(minx, p.x); miny = Math.min(miny, p.y); maxx = Math.max(maxx, p.x + p.w); maxy = Math.max(maxy, p.y + p.h); }
    minx = Math.floor(minx); miny = Math.floor(miny);
    const np = new Piece(maxx - minx + 1, maxy - miny + 1);
    np.x = minx; np.y = miny;
    for (const p of list) {
      np.vctx.drawImage(p.vis, Math.round(p.x - minx), Math.round(p.y - miny));
      np.dctx.drawImage(p.data, Math.round(p.x - minx), Math.round(p.y - miny));
      p.colors.forEach(c => np.colors.add(c));
    }
    np.refresh();
    return np;
  }
  function mergePieces(list) {
    const np = composePieces(list);
    pieces = pieces.filter(p => !list.includes(p));
    pieces.push(np);
    if (drag && list.includes(drag.p)) {
      drag.ox += drag.p.x - np.x; drag.oy += drag.p.y - np.y; drag.p = np;
    }
    return np;
  }
  function sortedPieces(desc) { return pieces.slice().sort((a, b) => desc ? b.z - a.z : a.z - b.z); }
  function pieceAt(wx, wy) {
    for (const p of sortedPieces(true)) if (!p.fly && p.alphaAt(wx, wy) > 110) return p;
    return null;
  }

  // ---------- customers ----------
  const SKINS = ['#f1c27d', '#a8dc7a', '#9ad7ff', '#f7a8c4', '#e0c3fc', '#ffd27f', '#c9f0e0'];
  const HAIRC = ['#a6dcff', '#7a4b2a', '#f7d038', '#e8434f', '#ffffff', '#5b3f8c', '#3a3a3a'];
  function genCustomer() {
    return {
      skin: pick(SKINS), hair: randi(0, 4), hairC: pick(HAIRC),
      eL: rand(0.26, 0.36), eR: rand(0.22, 0.32),
      pL: [rand(-0.5, 0.5), rand(-0.5, 0.5)], pR: [rand(-0.5, 0.5), rand(-0.5, 0.5)],
      seed: rand(0, 1000), hw: rand(0.82, 1.0), hh: rand(0.95, 1.15), drool: Math.random() < 0.3,
    };
  }
  function mixHex(hex, hex2, k) {
    const a = hexRgb(hex), b = hexRgb(hex2);
    return `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], k))).join(',')})`;
  }
  function drawFace(x, y, r, c, mood, t) {
    ctx.save();
    ctx.translate(x, y);
    if (mood === 'angry') ctx.translate(Math.sin(t * 70) * r * 0.08, 0);
    if (mood === 'happy') ctx.translate(0, -Math.abs(Math.sin(t * 9)) * r * 0.3);
    if (mood === 'meh') ctx.rotate(Math.sin(t * 4) * 0.08);
    const lw = Math.max(2, r * 0.1);
    ctx.lineWidth = lw; ctx.strokeStyle = OL; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (c.hair === 1) {
      ctx.beginPath();
      for (let i = 0; i <= 12; i++) {
        const a = -Math.PI * 0.98 + i / 12 * Math.PI * 0.96;
        const rr = (i % 2 ? 0.88 : 1.42) * r;
        const px = Math.cos(a) * rr * c.hw, py = Math.sin(a) * rr * c.hh - r * 0.05;
        i ? ctx.lineTo(px + wob(c.seed, i, 1), py + wob(c.seed, i + 9, 1)) : ctx.moveTo(px, py);
      }
      ctx.closePath(); ctx.fillStyle = c.hairC; ctx.fill(); ctx.stroke();
    }
    const skin = mood === 'angry' ? mixHex(c.skin, '#ff3030', 0.5) : c.skin;
    inkFill(wobEllipse(0, 0, r * c.hw, r * c.hh, c.seed, r * 0.04), skin, lw * 1.15);
    ctx.lineWidth = lw;
    if (c.hair === 2) {
      ctx.beginPath(); ctx.ellipse(0, -r * 0.32, r * c.hw * 1.04, r * 0.72, 0, Math.PI * 1.02, Math.PI * 1.98);
      ctx.quadraticCurveTo(0, -r * 0.55, -r * c.hw * 1.0, -r * 0.3);
      ctx.closePath(); ctx.fillStyle = c.hairC; ctx.fill(); ctx.stroke();
    } else if (c.hair === 3) {
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(s * r * 0.3, -r * c.hh * 0.9);
        ctx.quadraticCurveTo(s * r * 0.6, -r * 1.5, s * r * 0.45 + wob(c.seed, s, 2), -r * 1.65);
        ctx.stroke();
        ctx.beginPath(); ctx.arc(s * r * 0.45, -r * 1.7, r * 0.14, 0, TAU); ctx.fillStyle = '#7dff9a'; ctx.fill(); ctx.stroke();
      }
    } else if (c.hair === 4) {
      ctx.lineWidth = lw * 0.6;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath(); ctx.moveTo(i * r * 0.15, -r * c.hh * 0.95);
        ctx.quadraticCurveTo(i * r * 0.25 + r * 0.2, -r * 1.35, i * r * 0.1, -r * 1.3); ctx.stroke();
      }
      ctx.lineWidth = lw;
    }
    const ey = -r * 0.12;
    const eyes = [[-r * 0.32, ey, r * c.eL, c.pL], [r * 0.33, ey - r * 0.05, r * c.eR, c.pR]];
    for (const [ex, eyy, er, pp] of eyes) {
      if (mood === 'happy') {
        ctx.beginPath(); ctx.arc(ex, eyy + er * 0.3, er * 0.75, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
        continue;
      }
      ctx.lineWidth = lw * 0.75;
      ctx.beginPath(); ctx.arc(ex, eyy, er, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke();
      const jx = mood === 'angry' ? 0 : pp[0], jy = mood === 'angry' ? 0 : pp[1];
      ctx.beginPath(); ctx.arc(ex + jx * er * 0.5, eyy + jy * er * 0.5, Math.max(1.5, r * 0.07), 0, TAU); ctx.fillStyle = OL; ctx.fill();
      if (mood === 'meh') {
        ctx.save(); ctx.beginPath(); ctx.arc(ex, eyy, er - lw / 2, 0, TAU); ctx.clip();
        ctx.fillStyle = skin; ctx.fillRect(ex - er, eyy - er, er * 2, er * 1.05); ctx.restore();
        ctx.beginPath(); ctx.moveTo(ex - er, eyy + er * 0.05); ctx.lineTo(ex + er, eyy + er * 0.05); ctx.stroke();
      }
      if (mood === 'angry' || mood === 'impatient') {
        const k = mood === 'angry' ? 0.6 : 0.3;
        const sgn = ex < 0 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(ex - sgn * er * 1.1, eyy - er * (1.2 + k * 0.4));
        ctx.lineTo(ex + sgn * er * 0.9, eyy - er * (1.2 - k * 0.6));
        ctx.lineWidth = lw * 1.3; ctx.stroke(); ctx.lineWidth = lw;
      }
    }
    ctx.lineWidth = lw; ctx.fillStyle = OL;
    taper(r * 0.02, r * 0.1, r * 0.22, r * 0.3, r * 0.0, r * 0.32, lw * 1.2);
    const my = r * 0.55;
    if (mood === 'happy') {
      ctx.beginPath(); ctx.moveTo(-r * 0.45, my - r * 0.12); ctx.quadraticCurveTo(0, my + r * 0.75, r * 0.45, my - r * 0.12); ctx.closePath();
      ctx.fillStyle = '#5a1530'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, my + r * 0.2, r * 0.16, r * 0.09, 0, 0, TAU); ctx.fillStyle = '#ff7aa8'; ctx.fill();
    } else if (mood === 'angry') {
      ctx.beginPath(); ctx.rect(-r * 0.36, my - r * 0.12, r * 0.72, r * 0.26); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke();
      ctx.lineWidth = lw * 0.6;
      ctx.beginPath(); ctx.moveTo(-r * 0.36, my); ctx.lineTo(r * 0.36, my);
      for (let i = -2; i <= 2; i++) { ctx.moveTo(i * r * 0.12, my - r * 0.12); ctx.lineTo(i * r * 0.12, my + r * 0.14); }
      ctx.stroke(); ctx.lineWidth = lw;
      for (const s of [-1, 1]) {
        const k = (t * 1.5) % 1;
        ctx.globalAlpha = 1 - k;
        ctx.beginPath(); ctx.arc(s * r * (0.9 + k * 0.4), -r * (0.8 + k * 0.8), r * (0.16 + k * 0.15), 0, TAU);
        ctx.fillStyle = '#eee'; ctx.fill(); ctx.lineWidth = lw * 0.6; ctx.stroke();
        ctx.globalAlpha = 1; ctx.lineWidth = lw;
      }
    } else if (mood === 'meh') {
      ctx.beginPath(); ctx.moveTo(-r * 0.32, my); ctx.bezierCurveTo(-r * 0.1, my - r * 0.12, r * 0.1, my + r * 0.12, r * 0.32, my); ctx.stroke();
    } else if (mood === 'impatient') {
      ctx.beginPath(); ctx.arc(0, my + r * 0.25, r * 0.28, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(r * 0.85, -r * 0.5); ctx.quadraticCurveTo(r * 1.02, -r * 0.2, r * 0.9, -r * 0.12);
      ctx.quadraticCurveTo(r * 0.72, -r * 0.2, r * 0.85, -r * 0.5); ctx.fillStyle = '#8fd8ff'; ctx.fill(); ctx.lineWidth = lw * 0.6; ctx.stroke();
      ctx.lineWidth = lw;
    } else {
      ctx.fillStyle = OL;
      taper(-r * 0.25, my, 0, my + r * 0.08 + wob(c.seed, 3, r * 0.05), r * 0.25, my - r * 0.03, lw * 1.3);
    }
    if (c.drool && mood !== 'happy') {
      ctx.beginPath(); ctx.moveTo(r * 0.22, my + r * 0.02);
      ctx.quadraticCurveTo(r * 0.3, my + r * 0.3, r * 0.24, my + r * 0.42);
      ctx.strokeStyle = '#9fe6ff'; ctx.lineWidth = lw * 0.8; ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- state ----------
  let state = 'title';
  let time = 0, timeLeft = GAME_TIME, money = 0;
  // events: null = every optional event module allowed; otherwise a whitelist (see days.js).
  const DEFAULT_ROUND = {
    mode: 'normal', timer: true, autoOrders: true, autoFabric: true, initialPieces: true, noText: false,
    day: 1, events: null, money: 0, maxOrders: MAX_ORDERS, orderInterval: [5, 10], fabricInterval: [3.5, 7.5],
  };
  const eventOn = name => round.mode === 'normal' && (!round.events || round.events.includes(name));
  let startGameFn = () => startRound();
  let endPanelFn = null;
  let round = { ...DEFAULT_ROUND };
  const titleButtons = [];
  const titleLines = [];
  const HOW_TO = [
    'You are a tailor granny in a Gundam helmet, piloting a sewing mech.',
    'WASD / Arrows: steer the needle',
    'SPACE = foot pedal: tap in rhythm to cruise, mash to dash',
    'Needle over two overlapping cloths → they get sewn into one',
    'LMB: drag cloth    Click an order up top: grab its pattern',
    'Holding a pattern, LMB cuts (must fit inside one piece)',
    'Wheel rotates the pattern, RMB / Esc puts it down',
    'Match the order\'s color ratio; happy customers pay more! 3 minutes',
  ];
  let uiButtons = [];
  let stats = { happy: 0, meh: 0, angry: 0, expired: 0 };
  let pieces = [], orders = [], selected = null, drag = null, preview = null;
  let popups = [], particles = [], flyers = [], focus = [];
  let nextOrderT = 0, nextFabricT = 0, orderId = 0;
  let needle, cam;
  let lastPedal = 0, pedalAnim = 0, trackRoll = 0, stickX = 0, stickY = 0;
  let grains = [];
  const keys = {};
  const mouse = { x: 0, y: 0, down: false };
  let ax = 0, ay = 0;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cvs.width = W * DPR; cvs.height = H * DPR;
    cvs.style.width = W + 'px'; cvs.style.height = H + 'px';
    ax = W / 2; ay = H * 0.5;
  }
  window.addEventListener('resize', resize);
  resize();

  function viewWorld() {
    return { l: cam.x - ax, t: cam.y - ay, r: cam.x - ax + W, b: cam.y - ay + H };
  }
  const mouseWorld = () => ({ x: mouse.x - ax + cam.x, y: mouse.y - ay + cam.y });

  function reset(opts) {
    round = { ...DEFAULT_ROUND, ...(opts || {}) };
    time = 0; timeLeft = GAME_TIME; money = round.money || 0;
    stats = { happy: 0, meh: 0, angry: 0, expired: 0 };
    pieces = []; orders = []; selected = null; drag = null; preview = null;
    popups = []; particles = []; flyers = []; focus = [];
    needle = { x: MAT.w / 2, y: MAT.h / 2, heading: -Math.PI / 2, speed: 0, phase: 0, dist: 0, on: true, lx: MAT.w / 2, ly: MAT.h / 2 };
    cam = { x: needle.x, y: needle.y };
    nextOrderT = 1.2; nextFabricT = 7;
    grains = Array.from({ length: 80 }, () => ({ y: rand(-100, MAT.h + 100), a: rand(3, 10), f: rand(0.004, 0.012), ph: rand(0, TAU) }));
    if (!round.initialPieces) return;
    const cols = [0, 1, 2, 3, 4, 5].sort(() => Math.random() - 0.5);
    cols.push(randi(0, 5));
    const rx = Math.min(W * 0.3, 520), ry = Math.max(120, (H - 330) * 0.36);
    cols.forEach((ci, i) => {
      const p = genFabric(ci, rand(95, 130));
      const a = i / cols.length * TAU + rand(-0.2, 0.2);
      p.x = needle.x + Math.cos(a) * rx - p.w / 2;
      p.y = needle.y + Math.sin(a) * ry - p.h / 2 + 10;
      pieces.push(p);
    });
  }

  function startRound(opts) {
    reset(opts);
    state = 'play';
    emit('roundStart', round);
    sfx('start');
  }
  function endRound() {
    timeLeft = 0; state = 'end'; selected = null; drag = null; time = 0; stampHit = false;
    emit('roundEnd');
    sfx('end');
  }
  function addPopup(p) { popups.push({ t: 0, life: 1.2, size: 20, color: '#fff', seed: rand(0, 1000), rot: rand(-0.18, 0.18), ...p }); }
  // Comic focus lines (集中线) converging on a screen point, clipped to the cockpit window.
  function focusLines(x, y, opts) {
    focus.push({ x, y, t: 0, dur: 0.35, color: OL, inner: 120, n: 56, seed: rand(0, 1000), ...opts });
  }

  function launchPiece(p, tx, ty, sx, sy, dur) {
    p.fly = { sx, sy, tx, ty, t: 0, dur: dur || rand(0.6, 0.9), spin: rand(-1, 1) };
    p.x = sx; p.y = sy;
    pieces.push(p);
    return p;
  }

  function spawnFabric() {
    const cnt = new Array(COLORS.length).fill(0), need = new Array(COLORS.length).fill(0);
    for (const p of pieces) p.colors.forEach(c => cnt[c]++);
    for (const o of orders) if (o.state === 'wait') o.colors.forEach(c => need[c]++);
    const wts = COLORS.map((_, i) => Math.max(0.2, 1 + need[i] * 1.5 + (cnt[i] === 0 ? 2 : 0) - Math.min(cnt[i], 3) * 0.25));
    let r = Math.random() * wts.reduce((a, b) => a + b, 0), ci = 0;
    for (; ci < wts.length - 1; ci++) { r -= wts[ci]; if (r <= 0) break; }
    const p = genFabric(ci, rand(90, 145));
    const v = viewWorld();
    const top = v.t + CARD_Y + CH + 20, bot = v.b - 170;
    const edge = randi(0, 3);
    let cx, cy, dx = 0, dy = 0;
    if (edge === 0) { cx = v.l + 40 + p.w * 0.3; cy = rand(top + p.h * 0.3, Math.max(top + p.h * 0.3, bot - p.h * 0.3)); dx = -1; }
    else if (edge === 1) { cx = v.r - 40 - p.w * 0.3; cy = rand(top + p.h * 0.3, Math.max(top + p.h * 0.3, bot - p.h * 0.3)); dx = 1; }
    else if (edge === 2) { cy = top + p.h * 0.25; cx = rand(v.l + 100, v.r - 100); dy = -1; }
    else { cy = bot - p.h * 0.25; cx = rand(v.l + W * 0.3, v.r - W * 0.3); dy = 1; }
    const tx = clamp(cx - p.w / 2, MAT.x - p.w * 0.3, MAT.x + MAT.w - p.w * 0.7);
    const ty = clamp(cy - p.h / 2, MAT.y - p.h * 0.3, MAT.y + MAT.h - p.h * 0.7);
    launchPiece(p, tx, ty, tx + dx * 700 + rand(-200, 200), ty + dy * 700 + rand(-200, 200));
    sfx('whoosh');
  }

  function spawnOrder(opts) {
    const used = orders.map(o => o.shape);
    const pool = SHAPE_KEYS.filter(k => !used.includes(k));
    const shape = pick(pool.length ? pool : SHAPE_KEYS);
    const rr = Math.random();
    const n = rr < 0.4 ? 1 : rr < 0.85 ? 2 : 3;
    const colors = [0, 1, 2, 3, 4, 5].sort(() => Math.random() - 0.5).slice(0, n);
    const life = rand(45, 65) + n * 5;
    const o = { id: ++orderId, shape, colors, life, left: life, x: W + 60, y: CARD_Y, state: 'wait', rot: 0, cust: genCustomer(), reactT: 0, mood: null, gained: 0, noExpire: false, ...(opts || {}) };
    orders.push(o);
    sfx('order');
    return o;
  }

  function cardScale() {
    return Math.min(1, (W - 240) / (MAX_ORDERS * CW + (MAX_ORDERS - 1) * GAP));
  }
  function cardAt(x, y) {
    const s = cardScale();
    for (let i = orders.length - 1; i >= 0; i--) {
      const o = orders[i];
      if (x >= o.x && x <= o.x + CW * s && y >= o.y && y <= o.y + CH * s) return o;
    }
    return null;
  }

  function checkCutOn(p, order, wx, wy) {
    const samples = SHAPE_DEFS[order.shape].samples;
    const cs = Math.cos(order.rot), sn = Math.sin(order.rot);
    const d = p.img.data;
    const counts = new Array(COLORS.length).fill(0);
    for (const [x, y] of samples) {
      const lx = Math.floor(wx + x * cs - y * sn - p.x), ly = Math.floor(wy + x * sn + y * cs - p.y);
      if (lx < 0 || ly < 0 || lx >= p.w || ly >= p.h) return null;
      const i = (ly * p.w + lx) * 4;
      if (d[i + 3] < 110) return null;
      counts[nearestColor(d[i], d[i + 1], d[i + 2])]++;
    }
    return counts.map(c => c / samples.length);
  }
  // External cut sources (e.g. cat.js): { check(order, wx, wy) -> { p, shares } | null, cut(order, wx, wy) }.
  // Checked before regular pieces because they are drawn on top.
  const cutSources = [];
  function checkCut(order, wx, wy) {
    for (const src of cutSources) {
      const r = src.check(order, wx, wy);
      if (r) return { ok: true, p: r.p, shares: r.shares, src };
    }
    for (const p of sortedPieces(true)) {
      if (p.fly) continue;
      const shares = checkCutOn(p, order, wx, wy);
      if (shares) return { ok: true, p, shares };
    }
    return { ok: false };
  }

  function evaluate(order, shares) {
    const n = order.colors.length, need = NEED[n];
    const met = order.colors.filter(c => shares[c] >= need).length;
    if (met === n) return { mood: 'happy', pts: 100 + Math.round(60 * order.left / order.life) };
    if (met > 0) return { mood: 'meh', pts: 40 };
    return { mood: 'angry', pts: 10 };
  }

  function resolveOrder(o, shares) {
    if (!shares) { o.mood = 'angry'; o.gained = -Math.min(30, money); stats.expired++; }
    else {
      const r = evaluate(o, shares);
      o.mood = r.mood; o.gained = r.pts; stats[r.mood]++;
    }
    money += o.gained;
    o.state = 'react'; o.reactT = 0;
    if (selected === o) selected = null;
    const s = cardScale();
    const label = round.noText ? `${o.gained >= 0 ? '+' : ''}${o.gained}`
      : !shares ? 'TOO LATE!' : o.mood === 'happy' ? pick(['GOOD!', 'GREAT!', 'NICE!']) : o.mood === 'meh' ? 'MEH...' : pick(['BAD!', 'UGH!']);
    const col = o.mood === 'happy' ? '#7dff9a' : o.mood === 'meh' ? '#ffe066' : '#ff6b6b';
    addPopup({ x: o.x + CW * s / 2, y: o.y + CH * s + 30, text: label, color: '#fff', bg: col, burst: true, life: 1.6, size: 24 });
    if (o.mood === 'happy') focusLines(o.x + CW * s / 2, o.y + CH * s / 2, { color: '#fffbe6', inner: CW * s * 0.75, dur: 0.4 });
    else if (o.mood === 'angry') focusLines(o.x + CW * s / 2, o.y + CH * s / 2, { inner: CW * s * 0.75, dur: 0.35 });
    if (o.mood === 'happy') {
      for (let i = 0; i < 18; i++) particles.push({ screen: true, x: o.x + CW * s / 2, y: o.y + CH * s / 2, vx: rand(-260, 260), vy: rand(-300, 50), life: rand(0.6, 1.1), t: 0, color: pick(['#ffe066', '#7dff9a', '#fff', '#ff8fc7']), size: rand(4, 8), star: true });
    }
    sfx(o.mood);
    emit('orderResolved', o);
  }

  function doCut(o) {
    const mw = mouseWorld();
    const r = checkCut(o, mw.x, mw.y);
    if (emit('beforeCut', o, r, mw)) return;
    if (!r.ok) {
      addPopup(round.noText
        ? { x: mouse.x, y: mouse.y - S - 16, icon: 'cross', life: 1.1 }
        : { x: mouse.x, y: mouse.y - S - 16, text: 'Too small! Must fit on one piece', color: '#ff6b6b', life: 1.1, size: 18 });
      sfx('error');
      return;
    }
    const p = r.p, path = SHAPE_DEFS[o.shape].path;
    const D = Math.ceil(S * 2.9);
    const [fc, fx] = makeCanvas(D, D);
    fx.translate(D / 2, D / 2); fx.rotate(o.rot);
    fx.save(); fx.clip(path); fx.rotate(-o.rot);
    fx.drawImage(p.vis, p.x - mw.x, p.y - mw.y);
    fx.restore();
    fx.lineJoin = 'round'; fx.lineWidth = 4; fx.strokeStyle = OL; fx.stroke(path);
    if (r.src) r.src.cut(o, mw.x, mw.y);
    else {
      for (const c of [p.vctx, p.dctx]) {
        c.save(); c.translate(mw.x - p.x, mw.y - p.y); c.rotate(o.rot);
        c.globalCompositeOperation = 'destination-out'; c.fill(path); c.restore();
      }
      const v = p.vctx;
      v.save(); v.translate(mw.x - p.x, mw.y - p.y); v.rotate(o.rot);
      v.globalCompositeOperation = 'source-atop'; v.lineJoin = 'round';
      v.strokeStyle = OL; v.lineWidth = 8; v.stroke(path);
      v.restore();
      p.refresh();
      if (p.opaqueCount() < 500) {
        pieces = pieces.filter(q => q !== p);
        for (let i = 0; i < 10; i++) particles.push({ x: p.x + p.w / 2, y: p.y + p.h / 2, vx: rand(-120, 120), vy: rand(-120, 120), life: 0.6, t: 0, color: '#ddd', size: rand(5, 10) });
      }
    }
    for (let i = 0; i < 14; i++) particles.push({ x: mw.x + rand(-S, S), y: mw.y + rand(-S, S), vx: rand(-150, 150), vy: rand(-150, 150), life: rand(0.4, 0.8), t: 0, color: pick([...p.colors].map(c => COLORS[c].hex)), size: rand(3, 7) });
    flyers.push({ img: fc, sx: mouse.x, sy: mouse.y, x: mouse.x, y: mouse.y, order: o, t: 0, dur: 0.6, shares: r.shares, sc: 1 });
    o.state = 'incoming';
    selected = null;
    sfx('cut');
    emit('cut', o, r);
  }

  // ---------- input ----------
  window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (emit('keydown', e)) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat && state === 'play') {
        const now = performance.now() / 1000;
        const gap = now - lastPedal;
        lastPedal = now;
        const imp = gap < 0.22 ? 175 : 115;
        needle.speed = Math.min(700, needle.speed + imp);
        pedalAnim = 1;
        sfx('pedal');
      }
    }
    if (e.code === 'Escape' && selected) { selected = null; sfx('drop'); }
    if (e.code.startsWith('Arrow')) e.preventDefault();
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; drag = null; });
  cvs.addEventListener('contextmenu', e => e.preventDefault());
  cvs.addEventListener('mousemove', e => {
    trackRoll += e.clientX - mouse.x;
    mouse.x = e.clientX; mouse.y = e.clientY;
  });
  cvs.addEventListener('wheel', e => {
    e.preventDefault();
    if (selected) selected.rot += Math.sign(e.deltaY) * Math.PI / 12;
  }, { passive: false });
  cvs.addEventListener('mousedown', e => {
    mouse.x = e.clientX; mouse.y = e.clientY;
    if (emit('mousedown', e)) return;
    if (state !== 'play') {
      if (e.button !== 0 || (state === 'end' && time < 1)) return;
      for (const b of uiButtons) {
        if (mouse.x >= b.x && mouse.x <= b.x + b.w && mouse.y >= b.y && mouse.y <= b.y + b.h) { b.fn(); return; }
      }
      return;
    }
    if (e.button === 2) { if (selected) sfx('drop'); selected = null; return; }
    if (e.button !== 0) return;
    mouse.down = true;
    const card = cardAt(mouse.x, mouse.y);
    if (card) {
      if (card.state === 'wait') { selected = selected === card ? null : card; sfx(selected ? 'pick' : 'drop'); }
      return;
    }
    if (selected) { doCut(selected); return; }
    const mw = mouseWorld();
    const p = pieceAt(mw.x, mw.y);
    if (p) { p.z = ++zCounter; drag = { p, ox: mw.x - p.x, oy: mw.y - p.y }; sfx('grab'); }
  });
  window.addEventListener('mouseup', () => { mouse.down = false; if (drag) sfx('release'); drag = null; });
  const uiHitTests = [];
  const grabHoverTests = [];
  const shakers = [];
  const overUI = (x, y) => uiHitTests.some(fn => { try { return fn(x, y); } catch (e) { return false; } });

  // ---------- update ----------
  function stitch() {
    const under = pieces.filter(p => !p.fly && p.alphaAt(needle.x, needle.y) > 110);
    let top = null;
    if (under.length >= 2) {
      top = mergePieces(under);
      if (!round.noText) addPopup({ world: true, x: needle.x, y: needle.y - 40, text: pick(['THWIP!', 'KA-CHUNK!', 'ZZRRT!', 'CHUK-CHUK!']), color: '#fff', bg: '#7dff9a', burst: true, life: 0.9, size: 20 });
      for (let i = 0; i < 10; i++) particles.push({ x: needle.x, y: needle.y, vx: rand(-180, 180), vy: rand(-180, 180), life: 0.5, t: 0, color: '#fffbe6', size: rand(3, 5), star: true });
      sfx('merge');
      emit('merge', top);
    } else if (under.length === 1) top = under[0];
    if (top && needle.on) {
      const v = top.vctx;
      v.save(); v.globalCompositeOperation = 'source-atop'; v.lineCap = 'round';
      v.beginPath(); v.moveTo(needle.lx - top.x, needle.ly - top.y); v.lineTo(needle.x - top.x, needle.y - top.y);
      v.strokeStyle = OL; v.lineWidth = 4; v.stroke();
      v.strokeStyle = '#fffbe6'; v.lineWidth = 2; v.stroke();
      v.restore();
    }
    needle.on = !needle.on;
    needle.lx = needle.x; needle.ly = needle.y;
    if (top && time - lastStitchSnd > 0.045) { lastStitchSnd = time; sfx('stitch'); }
  }

  function update(dt) {
    boilT += dt;
    if (boilT > 0.12) { boilT = 0; boil = (boil + 1) % 3; }
    pedalAnim = Math.max(0, pedalAnim - dt * 5);
    trackRoll *= Math.exp(-dt * 0.5);
    for (const p of popups) p.t += dt;
    popups = popups.filter(p => p.t < p.life);
    for (const f of focus) f.t += dt;
    focus = focus.filter(f => f.t < f.dur);
    for (const p of particles) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.93; p.vy = p.vy * 0.93 + (p.screen ? 400 * dt : 0); }
    particles = particles.filter(p => p.t < p.life);
    if (state !== 'play') { emit('update', dt); return; }

    time += dt;
    if (round.timer) {
      const prevSec = Math.ceil(timeLeft);
      timeLeft -= dt;
      if (timeLeft <= 10 && Math.ceil(timeLeft) !== prevSec) sfx('tick');
      if (timeLeft <= 0) { endRound(); emit('update', dt); return; }
    }

    const kx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    const ky = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
    stickX = lerp(stickX, kx, 1 - Math.exp(-dt * 14));
    stickY = lerp(stickY, ky, 1 - Math.exp(-dt * 14));
    if (kx || ky) {
      const ta = Math.atan2(ky, kx);
      let diff = ((ta - needle.heading) % TAU + TAU * 1.5) % TAU - Math.PI;
      needle.heading += clamp(diff, -7 * dt, 7 * dt);
    }
    needle.speed *= Math.exp(-1.15 * dt);
    if (needle.speed < 4) needle.speed = 0;
    const step = needle.speed * dt;
    const nx = clamp(needle.x + Math.cos(needle.heading) * step, MAT.x + 10, MAT.x + MAT.w - 10);
    const ny = clamp(needle.y + Math.sin(needle.heading) * step, MAT.y + 10, MAT.y + MAT.h - 10);
    const moved = Math.hypot(nx - needle.x, ny - needle.y);
    needle.x = nx; needle.y = ny;
    needle.moved = moved;
    needle.phase += moved * 0.15;
    needle.dist += moved;
    while (needle.dist >= STITCH_LEN) { needle.dist -= STITCH_LEN; stitch(); }

    const kc = 1 - Math.exp(-dt * 6);
    cam.x += (needle.x - cam.x) * kc; cam.y += (needle.y - cam.y) * kc;

    if (drag) {
      const mw = mouseWorld();
      drag.p.x = clamp(mw.x - drag.ox, MAT.x - drag.p.w * 0.5, MAT.x + MAT.w - drag.p.w * 0.5);
      drag.p.y = clamp(mw.y - drag.oy, MAT.y - drag.p.h * 0.5, MAT.y + MAT.h - drag.p.h * 0.5);
    }

    for (const p of pieces) {
      if (!p.fly) continue;
      const f = p.fly; f.t += dt;
      const k = Math.min(1, f.t / f.dur), e = easeOut(k);
      p.x = lerp(f.sx, f.tx, e); p.y = lerp(f.sy, f.ty, e);
      if (k >= 1) {
        p.fly = null; p.x = f.tx; p.y = f.ty;
        for (let i = 0; i < 8; i++) particles.push({ x: p.x + p.w / 2 + rand(-p.w / 2, p.w / 2), y: p.y + p.h - 10, vx: rand(-80, 80), vy: rand(-60, 0), life: 0.5, t: 0, color: 'rgba(230,230,230,0.8)', size: rand(5, 10) });
        sfx('plop');
        emit('pieceLanded', p);
      }
    }

    if (round.autoFabric) {
      nextFabricT -= dt;
      if (nextFabricT <= 0) {
        nextFabricT = rand(...round.fabricInterval);
        if (pieces.length < MAX_PIECES) spawnFabric();
      }
    }
    const waiting = orders.filter(o => o.state !== 'react').length;
    if (round.autoOrders && waiting < round.maxOrders) {
      nextOrderT -= dt;
      if (nextOrderT <= 0) { nextOrderT = rand(...round.orderInterval); spawnOrder(); }
    }
    for (const o of orders) {
      if (o.state === 'wait' && !o.noExpire) {
        o.left -= dt;
        if (!o.warned && o.left < o.life * 0.25) { o.warned = true; sfx('warn'); }
        if (o.left <= 0) resolveOrder(o, null);
      }
      else if (o.state === 'react') o.reactT += dt;
    }
    orders = orders.filter(o => !(o.state === 'react' && o.reactT > 1.9));
    const s = cardScale();
    const n = orders.length;
    const startX = (W - (n * CW + (n - 1) * GAP) * s) / 2;
    const kk = 1 - Math.exp(-dt * 10);
    orders.forEach((o, i) => {
      o.x = lerp(o.x, startX + i * (CW + GAP) * s, kk);
      o.y = lerp(o.y, CARD_Y + (o === selected ? 10 : 0), kk);
    });

    for (const f of flyers) {
      f.t += dt;
      const k = Math.min(1, f.t / f.dur), e = easeOut(k);
      const tx = f.order.x + CW * s * 0.7, ty = f.order.y + 46 * s;
      f.x = lerp(f.sx, tx, e); f.y = lerp(f.sy, ty, e) - Math.sin(k * Math.PI) * 80;
      f.sc = lerp(1, 0.35, e);
      if (k >= 1) { f.done = true; resolveOrder(f.order, f.shares); }
    }
    flyers = flyers.filter(f => !f.done);

    if (selected && selected.state !== 'wait') selected = null;
    preview = selected && !cardAt(mouse.x, mouse.y) && !overUI(mouse.x, mouse.y) ? checkCut(selected, mouseWorld().x, mouseWorld().y) : null;
    emit('update', dt);
  }

  // ---------- render ----------
  function drawTable() {
    const v = viewWorld();
    ctx.fillStyle = '#a8693f';
    ctx.fillRect(MAT.x - 90, MAT.y - 90, MAT.w + 180, MAT.h + 180);
    ctx.strokeStyle = 'rgba(80,40,20,0.45)'; ctx.lineWidth = 3;
    for (const g of grains) {
      if (g.y < v.t - 20 || g.y > v.b + 20) continue;
      ctx.beginPath();
      for (let x = Math.max(MAT.x - 90, v.l - 40); x <= Math.min(MAT.x + MAT.w + 90, v.r + 40); x += 40)
        ctx.lineTo(x, g.y + Math.sin(x * g.f + g.ph) * g.a);
      ctx.stroke();
    }
    ctx.lineWidth = 6; ctx.strokeStyle = OL;
    wobRect(MAT.x - 90, MAT.y - 90, MAT.w + 180, MAT.h + 180, 61, 2.5); ctx.stroke();
    ctx.fillStyle = '#3c8c6e';
    ctx.fillRect(MAT.x, MAT.y, MAT.w, MAT.h);
    const l = Math.max(MAT.x, Math.floor(v.l / 40) * 40), r = Math.min(MAT.x + MAT.w, v.r);
    const t = Math.max(MAT.y, Math.floor(v.t / 40) * 40), b = Math.min(MAT.y + MAT.h, v.b);
    for (let x = l; x <= r; x += 40) {
      ctx.strokeStyle = x % 200 === 0 ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.1)';
      ctx.lineWidth = x % 200 === 0 ? 2.5 : 1.2;
      ctx.beginPath(); ctx.moveTo(x, Math.max(MAT.y, v.t)); ctx.lineTo(x, b); ctx.stroke();
    }
    for (let y = t; y <= b; y += 40) {
      ctx.strokeStyle = y % 200 === 0 ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.1)';
      ctx.lineWidth = y % 200 === 0 ? 2.5 : 1.2;
      ctx.beginPath(); ctx.moveTo(Math.max(MAT.x, v.l), y); ctx.lineTo(r, y); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = `bold 14px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    for (let x = Math.max(MAT.x, Math.floor(v.l / 200) * 200); x <= r; x += 200) ctx.fillText(String(x / 10), x + 4, MAT.y + 6);
    ctx.lineWidth = 5; ctx.strokeStyle = OL;
    wobRect(MAT.x, MAT.y, MAT.w, MAT.h, 62, 2.5); ctx.stroke();
  }

  // Speed lines (速度线) trailing behind something moving along (dx, dy). Re-rolled on every boil tick.
  function speedLines(x, y, dx, dy, back, spread, len, seed, n = 7) {
    const l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
    for (const [col, w] of [[OL, 8], ['#fffbe6', 4]]) {
      ctx.fillStyle = col;
      for (let i = 0; i < n; i++) {
        const h1 = hash(seed + i * 3.1 + boil * 17.7), h2 = hash(seed + i * 5.9 + boil * 9.3);
        const side = (i / (n - 1) - 0.5) * spread + (h1 - 0.5) * spread * 0.25;
        const b0 = back + h2 * back * 0.4, L = len * (0.5 + h1 * 0.6);
        const x0 = x - ux * b0 - uy * side, y0 = y - uy * b0 + ux * side;
        taperLine(x0, y0, x0 - ux * L, y0 - uy * L, w);
      }
    }
  }

  function drawFocus() {
    if (!focus.length) return;
    ctx.save();
    ctx.beginPath(); polyPath(ctx, windowPoly()); ctx.clip();
    const R = Math.hypot(W, H) + 200;
    for (const f of focus) {
      const seed = f.seed + boil * 17.3, grow = 1 + f.t / f.dur * 0.5;
      ctx.fillStyle = f.color;
      ctx.beginPath();
      for (let i = 0; i < f.n; i++) {
        const a = (i + hash(seed + i) * 0.8) / f.n * TAU;
        const r0 = f.inner * grow * (1 + hash(seed + i * 2.3) * 0.8);
        const wd = 0.004 + hash(seed + i * 4.1) * 0.012;
        ctx.moveTo(f.x + Math.cos(a) * r0, f.y + Math.sin(a) * r0);
        ctx.lineTo(f.x + Math.cos(a - wd) * R, f.y + Math.sin(a - wd) * R);
        ctx.lineTo(f.x + Math.cos(a + wd) * R, f.y + Math.sin(a + wd) * R);
        ctx.closePath();
      }
      ctx.fill();
    }
    ctx.restore();
  }

  // Onomatopoeia: spiky burst balloon + slanted, extruded lettering. Pops in, holds, snaps out.
  function drawBurst(p, k) {
    const sc = k < 0.08 ? 0.3 + k / 0.08 : k < 0.16 ? 1.3 - (k - 0.08) / 0.08 * 0.3 : k > 0.88 ? Math.max(0, 1 - (k - 0.88) / 0.12) : 1;
    if (sc <= 0) return;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.translate(p.x, p.y - Math.min(k, 0.16) * 60); ctx.rotate(p.rot); ctx.scale(sc, sc);
    ctx.font = `bold ${p.size}px ${FONT}`;
    const rx = ctx.measureText(p.text).width * 0.7 + p.size * 0.8, ry = p.size * 1.35;
    const n = 14, pts = [];
    for (let i = 0; i < n * 2; i++) {
      const a = i / (n * 2) * TAU, j = i % 2 ? 0.8 : 1 + hash(p.seed + i) * 0.4;
      pts.push([Math.cos(a) * rx * j, Math.sin(a) * ry * j]);
    }
    inkFill(wobPoly(pts, p.seed, 1.5, 1), p.bg || '#fff', 3.5);
    ctx.transform(1, 0, -0.2, 1, 0, 0);
    const d = Math.max(2, p.size * 0.07);
    for (let i = 3; i >= 1; i--) text(p.text, d * i * 0.8, d * i, p.size, OL);
    text(p.text, 0, 0, p.size, p.color);
    ctx.restore();
  }

  function drawPieces() {
    for (const p of sortedPieces(false)) {
      ctx.save();
      if (p.fly) {
        const k = Math.min(1, p.fly.t / p.fly.dur);
        const lift = Math.sin(k * Math.PI) * 60 + (1 - k) * 30;
        ctx.globalAlpha = 0.25; ctx.filter = 'brightness(0)';
        ctx.drawImage(p.data, p.x + lift * 0.4, p.y + lift * 0.8);
        ctx.globalAlpha = 1; ctx.filter = 'none';
        const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
        if (k < 0.75) speedLines(cx, cy - lift, p.fly.tx - p.fly.sx, p.fly.ty - p.fly.sy, Math.max(p.w, p.h) * 0.45, Math.max(p.w, p.h) * 0.8, 70 + 160 * (1 - k), p.z);
        ctx.translate(cx, cy - lift); ctx.rotate((1 - k) * p.fly.spin); ctx.scale(1 + lift * 0.002, 1 + lift * 0.002);
        ctx.drawImage(p.vis, -p.w / 2, -p.h / 2);
      } else {
        const lifted = drag && drag.p === p;
        ctx.shadowColor = 'rgba(10,20,15,0.35)';
        ctx.shadowOffsetX = lifted ? 10 : 4; ctx.shadowOffsetY = lifted ? 14 : 6;
        ctx.drawImage(p.vis, p.x - (lifted ? 3 : 0), p.y - (lifted ? 5 : 0));
      }
      ctx.restore();
    }
  }

  function drawParticles(screen) {
    for (const p of particles) {
      if (!!p.screen !== screen) continue;
      const a = 1 - p.t / p.life;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.strokeStyle = OL; ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (p.star) {
        for (let i = 0; i < 8; i++) {
          const ang = i * Math.PI / 4 + p.t * 5, r = (i % 2 ? 0.4 : 1) * p.size;
          ctx.lineTo(p.x + Math.cos(ang) * r, p.y + Math.sin(ang) * r);
        }
        ctx.closePath();
      } else ctx.arc(p.x, p.y, p.size * (0.6 + a * 0.4), 0, TAU);
      ctx.fill(); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawPopups(world) {
    for (const p of popups) {
      if (!!p.world !== world) continue;
      const k = p.t / p.life;
      if (p.burst) { drawBurst(p, k); continue; }
      ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      const sc = k < 0.15 ? 0.6 + k / 0.15 * 0.5 : 1.1 - Math.min(0.1, (k - 0.15));
      ctx.save(); ctx.translate(p.x, p.y - k * 30); ctx.scale(sc, sc);
      if (p.icon) drawIcon(p.icon, 0, 0, 18);
      else text(p.text, 0, 0, p.size, p.color);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawIcon(kind, x, y, r) {
    ctx.save();
    ctx.translate(x, y);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
    ctx.fillStyle = kind === 'check' ? '#7cc84a' : kind === 'coin' ? '#f7d038' : '#e8434f';
    ctx.fill(); ctx.lineWidth = Math.max(2.5, r * 0.18); ctx.strokeStyle = OL; ctx.stroke();
    ctx.beginPath();
    if (kind === 'check') { ctx.moveTo(-r * 0.45, 0); ctx.lineTo(-r * 0.1, r * 0.38); ctx.lineTo(r * 0.5, -r * 0.4); }
    else if (kind === 'coin') { ctx.arc(0, 0, r * 0.6, 0, TAU); ctx.moveTo(0, -r * 0.35); ctx.lineTo(0, r * 0.35); }
    else { ctx.moveTo(-r * 0.4, -r * 0.4); ctx.lineTo(r * 0.4, r * 0.4); ctx.moveTo(r * 0.4, -r * 0.4); ctx.lineTo(-r * 0.4, r * 0.4); }
    ctx.lineWidth = Math.max(2.5, r * 0.22); ctx.strokeStyle = kind === 'coin' ? '#a8761a' : '#fff'; ctx.stroke();
    ctx.restore();
  }

  function drawMachine(ox, oy) {
    const sx = needle.x + ox, sy = needle.y + oy;
    const h = needle.heading;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (needle.speed > 320) {
      const k = clamp((needle.speed - 320) / 380, 0, 1);
      speedLines(sx, sy - 40, Math.cos(h), Math.sin(h), 50, 130, 60 + 140 * k, 5, 8);
    }
    ctx.strokeStyle = 'rgba(95,255,240,0.75)'; ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 6]); ctx.lineDashOffset = -time * 30;
    ctx.beginPath(); ctx.arc(sx, sy, 30, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    const len = 38 + needle.speed * 0.09;
    const hx = sx + Math.cos(h) * len, hy = sy + Math.sin(h) * len;
    ctx.lineWidth = 6; ctx.strokeStyle = OL;
    ctx.beginPath(); ctx.moveTo(sx + Math.cos(h) * 32, sy + Math.sin(h) * 32); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = '#5ff3ff'; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(hx + Math.cos(h) * 12, hy + Math.sin(h) * 12);
    ctx.lineTo(hx + Math.cos(h + 2.4) * 10, hy + Math.sin(h + 2.4) * 10);
    ctx.lineTo(hx + Math.cos(h - 2.4) * 10, hy + Math.sin(h - 2.4) * 10);
    ctx.closePath(); ctx.fillStyle = '#5ff3ff'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = OL; ctx.stroke();

    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(sx + 18, sy + 12, 40, 14, 0, 0, TAU); ctx.fill();
    inkFill(wobPoly([[sx - 16, sy - 4], [sx + 16, sy - 4], [sx + 20, sy + 8], [sx - 20, sy + 8]], 31, 0.8, 2), '#c9cfe0', 3);
    ctx.fillStyle = '#2a2e50'; ctx.fillRect(sx - 3, sy - 4, 6, 10);
    const bob = needle.speed > 0 ? (1 - Math.abs(Math.sin(needle.phase))) : 0;
    const tipY = sy - 22 + bob * 22;
    ctx.lineWidth = 7; ctx.strokeStyle = OL;
    ctx.beginPath(); ctx.moveTo(sx, sy - 70); ctx.lineTo(sx, tipY); ctx.stroke();
    ctx.lineWidth = 3.5; ctx.strokeStyle = '#e8ecf8'; ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = '#fffbe6';
    ctx.beginPath(); ctx.moveTo(sx + 2, sy - 64); ctx.quadraticCurveTo(sx + 14, sy - 40, sx + 2, tipY - 4); ctx.stroke();
    inkFill(wobRect(sx - 7, sy - 78, 14, 22, 32, 0.8), '#c9cfe0', 3);
    const bx = sx - 40, by = sy - 128;
    inkFill(wobPoly([[bx, by + 8], [bx + 8, by], [bx + 72, by], [bx + 80, by + 8], [bx + 80, by + 44], [bx + 66, by + 54], [bx + 14, by + 54], [bx, by + 44]], 33, 1, 2), '#eef0f7', 4);
    ctx.lineWidth = 2; ctx.strokeStyle = OL;
    ctx.fillStyle = '#2f5fd0'; wobRect(bx + 4, by + 34, 72, 10, 34, 0.6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e8434f'; ctx.beginPath(); ctx.moveTo(bx + 30, by + 46); ctx.lineTo(bx + 50, by + 46); ctx.lineTo(bx + 40, by + 54); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#7dff9a';
    for (const ex of [bx + 26, bx + 54]) {
      ctx.beginPath(); ctx.moveTo(ex - 9, by + 16); ctx.lineTo(ex + 9, by + 18); ctx.lineTo(ex + 7, by + 25); ctx.lineTo(ex - 9, by + 22); ctx.closePath();
      ctx.globalAlpha = needle.speed > 0 ? 1 : 0.6; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
    }
    ctx.fillStyle = '#f7d038'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(bx + 40, by + 4); ctx.lineTo(bx + 10, by - 22); ctx.lineTo(bx + 34, by - 2); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx + 40, by + 4); ctx.lineTo(bx + 70, by - 22); ctx.lineTo(bx + 46, by - 2); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e8434f';
    ctx.beginPath(); ctx.arc(bx + 40, by + 2, 6, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawGlass() {
    ctx.save();
    ctx.beginPath(); polyPath(ctx, windowPoly()); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    for (const [x, w] of [[0.1, 0.06], [0.18, 0.022]]) {
      wobPoly([[W * x, 0], [W * (x + w), 0], [W * (x + w) - H * 0.3, H * 0.42], [W * x - H * 0.3, H * 0.42]], 40 + x * 100, 2, 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function windowPoly() {
    return [[70, 18], [W - 70, 18], [W - 18, 70], [W - 18, H - 200], [W - 80, H - 150], [W * 0.63, H - 150], [W * 0.59, H - 112], [W * 0.41, H - 112], [W * 0.37, H - 150], [80, H - 150], [18, H - 200], [18, 70]];
  }

  function drawCockpit() {
    const win = windowPoly();
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.rect(0, 0, W, H); polyPath(ctx, win);
    ctx.fillStyle = '#2c3470'; ctx.fill('evenodd');
    ctx.save(); ctx.clip('evenodd');
    ctx.fillStyle = '#1b1f45';
    ctx.beginPath(); polyPath(ctx, [[0, H * 0.58], [W, H * 0.46], [W, H], [0, H]]); ctx.fill();
    ctx.restore();
    const plates = [
      [[0, 0], [190, 0], [150, 18], [70, 18], [18, 70], [0, 110]],
      [[W, 0], [W - 190, 0], [W - 150, 18], [W - 70, 18], [W - 18, 70], [W, 110]],
      [[0, H - 260], [18, H - 200], [80, H - 150], [W * 0.2, H - 150], [W * 0.16, H - 130], [0, H - 130]],
      [[W, H - 260], [W - 18, H - 200], [W - 80, H - 150], [W * 0.8, H - 150], [W * 0.84, H - 130], [W, H - 130]],
    ];
    plates.forEach((pl, i) => inkFill(wobPoly(pl, 50 + i, 1.2, 2), '#414b8e', 4));
    wobPoly(win, 11, 1.5, 3);
    ctx.lineWidth = 10; ctx.strokeStyle = OL; ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = '#5ff3ff'; ctx.stroke();
    ctx.strokeStyle = OL;
    ctx.fillStyle = '#9aa3c7';
    const rivets = [[40, 40], [W - 40, 40], [9, H * 0.3], [9, H * 0.55], [W - 9, H * 0.3], [W - 9, H * 0.55], [W * 0.5, 9], [W * 0.3, 9], [W * 0.7, 9]];
    for (const [x, y] of rivets) { ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fill(); ctx.lineWidth = 2; ctx.stroke(); }
    for (const [x0, x1] of [[90, W * 0.36], [W * 0.64, W - 90]]) {
      ctx.save(); ctx.beginPath(); ctx.rect(x0, H - 144, x1 - x0, 10); ctx.clip();
      ctx.fillStyle = '#f7d038'; ctx.fillRect(x0, H - 144, x1 - x0, 10);
      ctx.fillStyle = OL;
      for (let x = x0 - 20; x < x1; x += 20) { ctx.beginPath(); ctx.moveTo(x, H - 134); ctx.lineTo(x + 10, H - 144); ctx.lineTo(x + 18, H - 144); ctx.lineTo(x + 8, H - 134); ctx.fill(); }
      ctx.restore();
      ctx.strokeStyle = OL; ctx.lineWidth = 2.5; ctx.strokeRect(x0, H - 144, x1 - x0, 10);
    }
    inkFill(wobRect(60, -4, W - 120, 18, 12, 1), '#2a3060', 4);
    const active = orders.filter(o => o.state !== 'react').length;
    if (!round.noText) {
      text(`ORDERS ${active}/${round.maxOrders}`, 76, 8, 11, active >= round.maxOrders ? '#ff6b6b' : '#5ff3ff', 'left', false);
      text('RX-78 GRANNY', W - 76, 8, 11, '#9aa3c7', 'right', false);
    }
    const blink = Math.floor(time * 2) % 2;
    ctx.fillStyle = blink ? '#ff6b6b' : '#5a2030';
    ctx.beginPath(); ctx.arc(W - 40, H - 110, 6, 0, TAU); ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = !blink ? '#7dff9a' : '#204a30';
    ctx.beginPath(); ctx.arc(40, H - 110, 6, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawConsole() {
    ctx.save();
    const sw = Math.max(170, W * 0.16 - 20), sh = 92;
    const sx = W / 2 - sw / 2, sy = H - 104;
    inkFill(wobRect(sx, sy, sw, sh, 13, 1.2), '#0c1824', 4);
    ctx.strokeStyle = 'rgba(95,255,240,0.6)'; ctx.lineWidth = 1.5; ctx.strokeRect(sx + 5, sy + 5, sw - 10, sh - 10);
    if (round.timer) {
      const m = Math.floor(timeLeft / 60), s = Math.floor(timeLeft % 60);
      const low = timeLeft < 20 && Math.floor(time * 3) % 2;
      text(`${m}:${String(s).padStart(2, '0')}`, W / 2, sy + 30, 30, low ? '#ff6b6b' : '#5ff3ff');
      drawIcon('coin', W / 2 - 34, sy + 68, 10);
      text(`${money}`, W / 2 - 18, sy + 68, 20, '#ffe066', 'left');
    } else {
      drawIcon('coin', W / 2 - 34, sy + sh / 2, 14);
      text(`${money}`, W / 2 - 12, sy + sh / 2, 30, '#ffe066', 'left');
    }

    const gx = sx - 80, gy = H - 58, gr = 44;
    const arcPts = [];
    for (let i = 0; i <= 14; i++) arcPts.push([gx + Math.cos(Math.PI + i / 14 * Math.PI) * gr, gy + Math.sin(Math.PI + i / 14 * Math.PI) * gr]);
    inkFill(wobPoly(arcPts, 14, 1, 1), '#0c1824', 4);
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI + i / 10 * Math.PI;
      ctx.strokeStyle = i > 7 ? '#ff6b6b' : '#5ff3ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(gx + Math.cos(a) * (gr - 4), gy + Math.sin(a) * (gr - 4)); ctx.lineTo(gx + Math.cos(a) * (gr - 11), gy + Math.sin(a) * (gr - 11)); ctx.stroke();
    }
    const na = Math.PI + clamp(needle.speed / 700, 0, 1) * Math.PI;
    ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + Math.cos(na) * (gr - 10), gy + Math.sin(na) * (gr - 10)); ctx.stroke();
    if (!round.noText) text('PEDAL', gx, gy + 18, 13, pedalAnim > 0.2 ? '#7dff9a' : '#9aa3c7');
    const px = gx - 70, py = H - 70;
    ctx.save(); ctx.translate(px, py); ctx.transform(1, 0, 0, 1 - pedalAnim * 0.3, 0, pedalAnim * 6);
    inkFill(wobRect(-20, -16, 40, 32, 15, 0.8), '#3a3f6e', 3);
    ctx.strokeStyle = '#9aa3c7'; ctx.lineWidth = 2;
    for (let i = -8; i <= 8; i += 8) { ctx.beginPath(); ctx.moveTo(-14, i); ctx.lineTo(14, i); ctx.stroke(); }
    ctx.restore();
    if (!round.noText) text('SPACE', px, py + 28, 12, '#9aa3c7');

    const rx = sx + sw + 18, ry = H - 102, rw = Math.max(150, W * 0.13), rh = 88;
    inkFill(wobRect(rx, ry, rw, rh, 16, 1.2), '#0c1824', 4);
    if (selected) {
      const d = SHAPE_DEFS[selected.shape];
      ctx.save(); ctx.translate(rx + 34, ry + rh / 2); ctx.scale(0.8, 0.8); ctx.rotate(selected.rot);
      ctx.strokeStyle = '#7dff9a'; ctx.lineWidth = 3; ctx.stroke(d.icon); ctx.restore();
      if (!round.noText) {
        text(d.name, rx + 66, ry + 22, 15, '#7dff9a', 'left', false);
        text('Wheel: turn', rx + 66, ry + 44, 12, '#9aa3c7', 'left', false);
        text('RMB/Esc: drop', rx + 66, ry + 64, 12, '#9aa3c7', 'left', false);
      }
    } else if (!round.noText) {
      text('Click an order', rx + rw / 2, ry + 30, 14, '#5ff3ff', 'center', false);
      text('to grab pattern', rx + rw / 2, ry + 56, 14, '#5ff3ff', 'center', false);
    }
    ctx.restore();
  }

  function drawHand(x, y, s, flip, kind, tx, ty, roll) {
    const SK = '#f3c9a8', SKD = '#d49a78';
    ctx.save();
    ctx.translate(x, y); ctx.scale(flip ? -s : s, s);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = OL;
    const kx = kind === 'stick' ? tx * 20 : 0, ky = kind === 'stick' ? ty * 12 : 0;
    if (kind === 'stick') {
      inkFill(wobEllipse(0, 40, 64, 20, 21, 1), '#262a4f', 4);
      ctx.lineWidth = 3; ctx.fillStyle = '#3a3f6e'; wobEllipse(0, 34, 36, 12, 22, 0.8); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 20; ctx.beginPath(); ctx.moveTo(0, 34); ctx.lineTo(kx, -40 + ky); ctx.stroke();
      ctx.lineWidth = 12; ctx.strokeStyle = '#a9b1d6'; ctx.stroke(); ctx.strokeStyle = OL;
      inkFill(wobEllipse(kx, -55 + ky, 31, 31, 23, 1), '#e8434f', 4);
    } else if (kind === 'ball') {
      inkFill(wobEllipse(0, -8, 68, 26, 24, 1), '#262a4f', 4);
      ctx.save(); ctx.beginPath(); ctx.arc(0, -46, 42, 0, TAU); ctx.fillStyle = '#46d3e6'; ctx.fill(); ctx.clip();
      ctx.strokeStyle = 'rgba(20,60,90,0.5)'; ctx.lineWidth = 6;
      const off = ((roll * 0.5) % 28 + 28) % 28;
      for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(-50 + i * 28 + off, -100); ctx.quadraticCurveTo(-10 + i * 28 + off, -46, -50 + i * 28 + off, 0); ctx.stroke(); }
      ctx.restore();
      ctx.lineWidth = 4.5; wobEllipse(0, -46, 42, 42, 25, 1); ctx.stroke();
    }
    ctx.translate(kx, ky);
    const fingers = [[-30, -34, -34, -78], [-11, -38, -12, -88], [9, -38, 10, -86], [27, -34, 30, -74]];
    fingers.forEach(([x1, y1, x2, y2], i) => {
      x2 += wob(30 + i, 0, 1); y2 += wob(30 + i, 1, 1);
      ctx.strokeStyle = OL; ctx.lineWidth = 24; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.strokeStyle = SK; ctx.lineWidth = 17; ctx.stroke();
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      ctx.fillStyle = SKD;
      taper(mx - 5, my, mx, my + 3, mx + 5, my, 2.6); taper(mx - 4, my + 5, mx, my + 7, mx + 4, my + 5, 2.2);
      ctx.fillStyle = '#c9a3e6'; ctx.strokeStyle = OL; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x2, y2 + 1, 5.5, 5, 0, 0, TAU); ctx.fill(); ctx.stroke();
    });
    const palm = new Path2D();
    palm.moveTo(-34, 60);
    palm.bezierCurveTo(-40, 30, -50, 0, -44, -28);
    palm.bezierCurveTo(-40, -44, -20, -50, 0, -48);
    palm.bezierCurveTo(20, -50, 34, -44, 38, -30);
    palm.bezierCurveTo(46, -20, 50, 0, 40, 20);
    palm.bezierCurveTo(36, 40, 34, 50, 34, 60);
    palm.closePath();
    inkFill(palm, SK, 4);
    ctx.fillStyle = SKD;
    for (const [fx] of fingers) {
      taper(fx - 6, -36, fx, -42, fx + 6, -36, 2.6);
      taper(fx - 4, -31, fx, -35, fx + 4, -31, 2.2);
    }
    taper(-28, 30, -20, 26, -14, 32, 3); taper(-26, 38, -18, 34, -12, 40, 2.6);
    ctx.strokeStyle = '#8ea3cc'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-6, 58); ctx.bezierCurveTo(-14, 30, -2, 10, -14, -22); ctx.moveTo(-10, 18); ctx.quadraticCurveTo(-24, 0, -28, -24);
    ctx.moveTo(12, 58); ctx.bezierCurveTo(6, 30, 18, 6, 12, -26); ctx.stroke();
    ctx.fillStyle = '#d4936f';
    for (const [x, y, r] of [[-22, 6, 4], [18, -10, 3], [26, 26, 5], [-4, -20, 2.5], [4, 36, 3]]) { ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.8, 0.4, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = OL; ctx.lineWidth = 25; ctx.beginPath(); ctx.moveTo(38, 6); ctx.lineTo(25, -44); ctx.stroke();
    ctx.strokeStyle = SK; ctx.lineWidth = 18; ctx.stroke();
    ctx.fillStyle = SKD; taper(26, -18, 32, -16, 36, -20, 2.6);
    ctx.fillStyle = '#c9a3e6'; ctx.strokeStyle = OL; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(25, -46, 6, 5, -0.3, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f7d038'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.rect(-36, -38, 13, 8); ctx.fill(); ctx.stroke();
    inkFill(wobPoly([[-52, 40], [52, 40], [64, 200], [-64, 200]], 26, 1.2, 2), '#eef0f7', 4.5);
    ctx.lineWidth = 3;
    ctx.fillStyle = '#2f5fd0'; wobPoly([[-55, 72], [55, 72], [58, 102], [-58, 102]], 27, 1, 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e8434f'; wobPoly([[-52, 40], [52, 40], [53, 52], [-53, 52]], 28, 1, 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f7d038'; wobPoly([[-12, 110], [12, 110], [0, 130]], 29, 0.8, 1); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#9aa3c7'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-44, 145); ctx.lineTo(44, 145); ctx.moveTo(-30, 60); ctx.lineTo(-30, 70); ctx.moveTo(30, 60); ctx.lineTo(30, 70); ctx.stroke();
    ctx.restore();
  }

  function drawHands() {
    const s = clamp(H / 820, 0.7, 1.25);
    drawHand(W * 0.12, H - 40 * s, s, false, 'stick', stickX, stickY, 0);
    drawHand(W * 0.88, H - 40 * s, s, true, 'ball', 0, 0, trackRoll);
  }

  function drawOrderCard(o) {
    const s = cardScale();
    const d = SHAPE_DEFS[o.shape];
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.scale(s, s);
    if (o.state === 'react' && o.reactT > 1.3) {
      const k = (o.reactT - 1.3) / 0.6;
      ctx.translate(0, -k * 60); ctx.globalAlpha = Math.max(0, 1 - k);
    }
    if (o.state === 'react' && o.mood === 'angry') ctx.translate(Math.sin(o.reactT * 60) * 3, 0);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = OL; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(CW / 2, -o.y / s); ctx.lineTo(CW / 2, 4); ctx.stroke();
    const frac = o.left / o.life;
    const cardPath = wobRect(0, 0, CW, CH, o.id, 1.5);
    if (o === selected) {
      ctx.lineWidth = 20; ctx.strokeStyle = OL; ctx.stroke(cardPath);
      ctx.lineWidth = 14; ctx.strokeStyle = '#5ff3ff'; ctx.stroke(cardPath);
    }
    inkFill(cardPath, o.state === 'react' ? (o.mood === 'happy' ? '#e6ffe0' : o.mood === 'meh' ? '#fff6cc' : '#ffe0e0') : '#fff6dc', 3.5);
    const warn = o.state === 'wait' && frac < 0.25 && Math.floor(time * 4) % 2;
    if (o === selected || warn) {
      ctx.lineWidth = o === selected ? 5 : 3.5; ctx.strokeStyle = o === selected ? '#2bc4d6' : '#e8434f'; ctx.stroke(cardPath);
    }
    ctx.fillStyle = '#9aa3c7'; ctx.strokeStyle = OL; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.rect(CW / 2 - 12, -6, 24, 12); ctx.fill(); ctx.stroke();
    const mood = o.state === 'react' ? o.mood : (frac < 0.3 ? 'impatient' : 'neutral');
    drawFace(36, 48, 25, o.cust, mood, o.state === 'react' ? o.reactT : time);
    ctx.save(); ctx.translate(106, 48); ctx.rotate(o.rot);
    ctx.save(); ctx.clip(d.icon);
    const n = o.colors.length;
    o.colors.forEach((c, i) => { ctx.fillStyle = COLORS[c].hex; ctx.fillRect(-ICON * 1.2 + i * ICON * 2.4 / n, -ICON * 1.2, ICON * 2.4 / n + 1, ICON * 2.4); });
    ctx.restore();
    ctx.lineWidth = 3; ctx.strokeStyle = OL; ctx.stroke(d.icon);
    ctx.restore();
    o.colors.forEach((c, i) => {
      ctx.beginPath(); ctx.arc(16 + i * 18, 96, 7, 0, TAU);
      ctx.fillStyle = COLORS[c].hex; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OL; ctx.stroke();
    });
    if (!round.noText) {
      ctx.font = `bold 12px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = OL;
      ctx.fillText(`${n > 1 ? 'each ' : ''}≥${Math.round(NEED[n] * 100)}%`, 10 + n * 18, 96);
    }
    if ((o.state === 'wait' || o.state === 'incoming') && !o.noExpire) {
      ctx.fillStyle = '#2a2140'; ctx.fillRect(10, CH - 15, CW - 20, 8);
      ctx.fillStyle = frac > 0.5 ? '#7cc84a' : frac > 0.25 ? '#f7d038' : '#e8434f';
      ctx.fillRect(10, CH - 15, (CW - 20) * Math.max(0, frac), 8);
      ctx.lineWidth = 2; ctx.strokeStyle = OL; ctx.strokeRect(10, CH - 15, CW - 20, 8);
    }
    if (o === selected && !round.noText) text('HOLDING', CW / 2, CH + 14, 14, '#5ff3ff');
    ctx.restore();
  }

  function drawFlyers() {
    for (const f of flyers) {
      ctx.save(); ctx.translate(f.x, f.y); ctx.scale(f.sc, f.sc); ctx.rotate(f.t * 6);
      ctx.drawImage(f.img, -f.img.width / 2, -f.img.height / 2);
      ctx.restore();
    }
  }

  function drawCursor() {
    const mx = mouse.x, my = mouse.y;
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const ui = overUI(mx, my) || cardAt(mx, my);
    if (state === 'play' && selected && !ui) {
      const d = SHAPE_DEFS[selected.shape];
      const ok = preview && preview.ok;
      ctx.translate(mx, my);
      ctx.save(); ctx.rotate(selected.rot);
      ctx.fillStyle = ok ? 'rgba(125,255,154,0.2)' : 'rgba(255,90,90,0.18)'; ctx.fill(d.path);
      ctx.setLineDash([10, 7]); ctx.lineDashOffset = -time * 40;
      ctx.lineWidth = 5; ctx.strokeStyle = OL; ctx.stroke(d.path);
      ctx.lineWidth = 2.5; ctx.strokeStyle = ok ? '#7dff9a' : '#ff6b6b'; ctx.stroke(d.path);
      ctx.setLineDash([]);
      ctx.restore();
      ctx.strokeStyle = OL; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.moveTo(0, -8); ctx.lineTo(0, 8); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      if (ok) {
        const n = selected.colors.length;
        selected.colors.forEach((c, i) => {
          const pct = Math.round(preview.shares[c] * 100);
          const good = preview.shares[c] >= NEED[n];
          const yy = -S + 4 + i * 22;
          ctx.beginPath(); ctx.arc(S + 22, yy, 8, 0, TAU); ctx.fillStyle = COLORS[c].hex; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = OL; ctx.stroke();
          text(`${pct}%`, S + 36, yy, 15, good ? '#7dff9a' : '#ffb0b0', 'left');
        });
      }
    } else {
      const w = mouseWorld();
      const ext = state === 'play' && !ui ? grabHoverTests.map(fn => fn(w.x, w.y)).find(Boolean) : null;
      const hover = state === 'play' && !ui && (ext || pieceAt(w.x, w.y));
      const closed = drag || ext === 'hold';
      if (closed || hover) {
        ctx.translate(mx, my);
        ctx.fillStyle = '#f3c9a8'; ctx.strokeStyle = OL; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(0, 4, 13, 11, 0, 0, TAU); ctx.fill(); ctx.stroke();
        for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(-9 + i * 6, closed ? -4 : -10, 3.5, closed ? 4 : 7, 0, 0, TAU); ctx.fill(); ctx.stroke(); }
      } else {
        ctx.translate(mx, my);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 22); ctx.lineTo(6, 17); ctx.lineTo(11, 27); ctx.lineTo(15, 25); ctx.lineTo(10, 15); ctx.lineTo(17, 14); ctx.closePath();
        ctx.fillStyle = '#5ff3ff'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = OL; ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Rubber-stamp grade on the end panel: { text, color, label?, sfx? }. Slams down shortly after the panel opens.
  const STAMP_R = 78, STAMP_IN = 0.7, STAMP_FALL = 0.14;
  const stampCache = new Map();
  let stampHit = false;
  function stampImage(st) {
    const key = `${st.text}|${st.color}|${st.label || ''}`;
    let cv = stampCache.get(key);
    if (cv) return cv;
    const K = 2, R = STAMP_R, D = Math.ceil((R + 12) * 2 * K);
    let x;
    [cv, x] = makeCanvas(D, D);
    x.scale(K, K); x.translate(D / K / 2, D / K / 2);
    x.strokeStyle = x.fillStyle = st.color; x.lineJoin = 'round';
    const ring = (r, w, seed) => {
      x.beginPath();
      for (let i = 0; i < 40; i++) {
        const a = i / 40 * TAU, rr = r + (hash(seed + i) - 0.5) * 3.5;
        x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      x.closePath(); x.lineWidth = w; x.stroke();
    };
    ring(R, 8, 3); ring(R - 27, 3, 7);
    const arcText = (s, r, top, step) => {
      x.font = `bold 13px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      for (let i = 0; i < s.length; i++) {
        const d = (i - (s.length - 1) / 2) * step;
        const a = top ? -Math.PI / 2 + d : Math.PI / 2 - d;
        x.save(); x.translate(Math.cos(a) * r, Math.sin(a) * r); x.rotate(top ? a + Math.PI / 2 : a - Math.PI / 2);
        x.fillText(s[i], 0, 0); x.restore();
      }
    };
    arcText(st.label || 'RATING', R - 15, true, 0.2);
    arcText('GRANNY TAILOR CO.', R - 15, false, 0.125);
    for (const a of [0, Math.PI]) {
      x.beginPath();
      for (let i = 0; i < 10; i++) { const b = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 2.2 : 5.5; x.lineTo(Math.cos(a) * (R - 15) + Math.cos(b) * r, Math.sin(a) * (R - 15) + Math.sin(b) * r); }
      x.closePath(); x.fill();
    }
    x.font = `bold 88px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(st.text, 0, 5);
    // worn rubber: speckles, a lighter side, a couple of scratches
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'destination-out';
    const side = rand(0, TAU);
    for (let i = 0; i < 520; i++) {
      const px = rand(0, D), py = rand(0, D);
      const facing = Math.cos(Math.atan2(py - D / 2, px - D / 2) - side);
      if (Math.random() > 0.45 + facing * 0.4) continue;
      x.beginPath(); x.arc(px, py, rand(0.6, 2.4) * K, 0, TAU); x.fill();
    }
    x.lineWidth = 1.5 * K;
    for (let i = 0; i < 3; i++) {
      const a = rand(0, TAU), r0 = rand(10, R * 0.8) * K;
      x.beginPath(); x.moveTo(D / 2 + Math.cos(a) * r0, D / 2 + Math.sin(a) * r0);
      x.lineTo(D / 2 + Math.cos(a + 0.5) * (r0 + 30 * K), D / 2 + Math.sin(a + 0.5) * (r0 + 30 * K)); x.stroke();
    }
    stampCache.set(key, cv);
    return cv;
  }
  function drawStamp(st, cx, cy) {
    const t = time - STAMP_IN;
    if (t < 0) return;
    const k = Math.min(1, t / STAMP_FALL);
    if (!stampHit && k >= 1) { stampHit = true; sfx('stamp'); if (st.sfx) sfx(st.sfx); }
    const img = stampImage(st);
    let sc = 1, rot = -0.22;
    if (k < 1) { sc = 2.6 - 1.6 * k * k; rot = -0.22 - (1 - k) * 0.35; }
    else { const u = Math.min(1, (t - STAMP_FALL) / 0.16); sc = 1 - Math.sin(u * Math.PI) * 0.07; }
    ctx.save();
    ctx.translate(cx, cy);
    if (k >= 1) {
      ctx.fillStyle = st.color;
      for (let i = 0; i < 9; i++) {
        const a = hash(i * 7.7 + 1) * TAU, r = STAMP_R + 10 + hash(i * 3.3) * 26;
        ctx.beginPath(); ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 1.5 + hash(i * 5.1) * 4, 0, TAU); ctx.fill();
      }
      const fl = 1 - (t - STAMP_FALL) / 0.28;
      if (fl > 0) {
        ctx.fillStyle = OL;
        for (let i = 0; i < 10; i++) {
          const a = i / 10 * TAU + 0.3, r0 = STAMP_R + 14 + (1 - fl) * 20;
          taperLine(Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(a) * (r0 + 26 * fl), Math.sin(a) * (r0 + 26 * fl), 6);
        }
      }
    }
    ctx.rotate(rot); ctx.scale(sc, sc);
    ctx.globalAlpha = k < 1 ? 0.35 + 0.65 * k : 1;
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(img, -img.width / 4, -img.height / 4, img.width / 2, img.height / 2);
    ctx.restore();
  }

  function drawPanel(lines, title, buttons, stamp) {
    ctx.save();
    ctx.fillStyle = 'rgba(10,6,24,0.6)'; ctx.fillRect(0, 0, W, H);
    let ph = 110 + lines.length * 30 + 90;
    if (stamp) ph = Math.max(ph, 330);
    const pw = Math.min(760, W - 80);
    const px = W / 2 - pw / 2, py = H / 2 - ph / 2 - 40;
    const sk = stamp && stampHit ? Math.max(0, 1 - (time - STAMP_IN - STAMP_FALL) / 0.3) : 0;
    if (sk > 0) ctx.translate(Math.sin(time * 80) * 7 * sk, Math.cos(time * 67) * 4 * sk);
    inkFill(wobRect(px, py, pw, ph, 7, 2), '#fff6dc', 6);
    text(title, W / 2, py + 50, 34, '#7cc84a');
    lines.forEach((l, i) => {
      ctx.font = `bold 17px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = OL;
      ctx.fillText(l, px + 40, py + 104 + i * 30);
    });
    if (stamp) drawStamp(stamp, px + pw - 140, py + 160);
    const bw = 200, bh = 48, gap = 24;
    const total = buttons.length * bw + (buttons.length - 1) * gap;
    uiButtons = buttons.map((b, i) => ({ ...b, x: W / 2 - total / 2 + i * (bw + gap), y: py + ph - 70, w: bw, h: bh }));
    for (const b of uiButtons) {
      const hov = mouse.x >= b.x && mouse.x <= b.x + b.w && mouse.y >= b.y && mouse.y <= b.y + b.h;
      inkFill(wobRect(b.x, b.y + (hov ? -2 : 0), b.w, b.h, b.x, 1.5), hov ? '#ffe066' : (b.color || '#f7d038'), 4);
      text(b.label, b.x + b.w / 2, b.y + b.h / 2 + (hov ? -2 : 0), 20, '#fff');
    }
    ctx.restore();
  }

  function draw() {
    let shx = 0, shy = 0;
    for (const fn of shakers) { const o = fn(); if (o) { shx += o.x || 0; shy += o.y || 0; } }
    ctx.setTransform(DPR, 0, 0, DPR, shx * DPR, shy * DPR);
    if (state === 'title' && hooks.drawCover) {
      uiButtons = [];
      emit('drawCover', ctx);
      ctx.save(); drawFocus(); ctx.restore();
      drawParticles(true);
      drawPopups(false);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      emit('drawCoverHUD', ctx);
      if (!emit('drawCoverCursor', ctx)) drawCursor();
      return;
    }
    const ox = ax - cam.x, oy = ay - cam.y;
    ctx.fillStyle = '#231b38'; ctx.fillRect(-40, -40, W + 80, H + 80);
    ctx.save(); ctx.translate(ox, oy);
    drawTable();
    emit('drawTable', ctx);
    drawPieces();
    drawParticles(false);
    ctx.save(); ctx.translate(-ox, -oy); drawFocus(); ctx.restore();
    drawPopups(true);
    emit('drawWorld', ctx);
    ctx.restore();
    drawMachine(ox, oy);
    drawGlass();
    drawCockpit();
    drawConsole();
    drawHands();
    emit('drawHUD', ctx);
    for (const o of orders) drawOrderCard(o);
    drawFlyers();
    drawParticles(true);
    drawPopups(false);
    emit('drawOverlay', ctx);
    uiButtons = [];
    if (state === 'title') {
      drawPanel([...HOW_TO, ...titleLines], 'Stitch, Snip, Ship', [{ label: 'Open Shop', fn: () => startGameFn() }, ...titleButtons]);
    } else if (state === 'end') {
      const custom = endPanelFn && endPanelFn(stats);
      if (custom) drawPanel(custom.lines, custom.title, custom.buttons, custom.stamp);
      else drawPanel([
        `Cash left: ${money}`,
        `Happy: ${stats.happy}    Meh: ${stats.meh}    Angry: ${stats.angry}    Expired: ${stats.expired}`,
      ], 'Closing Time!', [{ label: 'Another Day', fn: () => startGameFn() }, { label: 'Title', fn: () => { state = 'title'; }, color: '#9aa3c7' }]);
    }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawCursor();
  }

  // ---------- public API for optional modules ----------
  const Game = window.Game = {
    on, emit, sfx,
    TAU, OL, FONT, COLORS, SHAPE_DEFS, SHAPE_KEYS, NEED, MAT, S, CW, CH, CARD_Y, MAX_PIECES,
    rand, randi, pick, clamp, lerp, easeOut,
    ctx, keys, mouse,
    get W() { return W; }, get H() { return H; },
    get state() { return state; }, set state(v) { state = v; },
    get round() { return round; },
    get time() { return time; },
    get timeLeft() { return timeLeft; },
    GAME_TIME,
    get money() { return money; },
    get needle() { return needle; },
    get cam() { return cam; },
    get pieces() { return pieces; },
    get orders() { return orders; },
    get selected() { return selected; },
    deselect: () => { selected = null; },
    get drag() { return drag; },
    get particles() { return particles; },
    titleButtons, titleLines, howTo: HOW_TO,
    addUIHit: fn => uiHitTests.push(fn),
    addGrabHover: fn => grabHoverTests.push(fn),
    addCutSource: src => cutSources.push(src),
    addShaker: fn => shakers.push(fn),
    cardAt, overUI,
    addMoney: v => { money += v; },
    spendMoney: v => { if (money < v) return false; money -= v; return true; },
    startRound, endRound, addPopup,
    eventOn,
    startGame: () => startGameFn(),
    setStartGame: fn => { startGameFn = fn; },
    setEndPanel: fn => { endPanelFn = fn; },
    get stats() { return stats; },
    genFabric, composePieces, launchPiece, spawnOrder, pieceAt,
    checkCutOn, evaluate, cardScale, viewWorld, mouseWorld,
    worldToScreen: (x, y) => ({ x: x - cam.x + ax, y: y - cam.y + ay }),
    screenToWorld: (x, y) => ({ x: x - ax + cam.x, y: y - ay + cam.y }),
    text, wobRect, wobEllipse, wobPoly, inkFill, taper, focusLines, drawFace, drawIcon, drawHand, polyPath, makeCanvas, shade,
  };

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (state === 'end') time += dt;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }
  reset();
  window.addEventListener('load', () => {
    emit('init', Game);
    last = performance.now();
    requestAnimationFrame(loop);
  });
})();

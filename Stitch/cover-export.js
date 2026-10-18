// 640x512 cover. title letters are cut out of different cloths, scraps keep the letter-shaped holes.
// press S to save cover.png
'use strict';
(() => {
  const G = window.Game;
  if (!G) return;

  const { ctx, OL, FONT, COLORS, TAU } = G;
  const THREAD = '#fffbe6';
  const BODY = 10;

  const FABRICS = [
    { hex: COLORS[0].hex, kind: 'dots', thread: THREAD },
    { hex: COLORS[5].hex, kind: 'gingham', thread: THREAD },
    { hex: COLORS[1].hex, kind: 'stripes', thread: '#8a5a12' },
    { hex: COLORS[3].hex, kind: 'zigzag', thread: THREAD },
    { hex: COLORS[2].hex, kind: 'plaid', thread: THREAD },
    { hex: '#f59ac0', kind: 'flowers', thread: '#9c2f5f' },
    { hex: COLORS[4].hex, kind: 'cross', thread: THREAD },
    { hex: '#41639e', kind: 'denim', thread: '#f2b134' },
  ];

  const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

  function weave(c, w, h, hex, kind, s) {
    const dark = G.shade(hex, -0.25), light = G.shade(hex, 0.35);
    c.save();
    c.lineCap = 'round'; c.lineJoin = 'round';
    if (kind === 'dots') {
      c.fillStyle = light;
      for (let y = 0, r = 0; y < h + 16 * s; y += 16 * s, r++)
        for (let x = (r % 2) * 8 * s; x < w + 16 * s; x += 16 * s) { c.beginPath(); c.arc(x, y, 3.4 * s, 0, TAU); c.fill(); }
    } else if (kind === 'stripes') {
      c.strokeStyle = dark; c.lineWidth = 6 * s;
      for (let k = -h; k < w; k += 17 * s) { c.beginPath(); c.moveTo(k, 0); c.lineTo(k + h, h); c.stroke(); }
    } else if (kind === 'plaid') {
      c.globalAlpha = 0.4; c.fillStyle = dark;
      for (let x = 0; x < w; x += 28 * s) c.fillRect(x, 0, 10 * s, h);
      for (let y = 0; y < h; y += 28 * s) c.fillRect(0, y, w, 10 * s);
      c.globalAlpha = 0.75; c.strokeStyle = light; c.lineWidth = 2;
      for (let x = 19 * s; x < w; x += 28 * s) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
      for (let y = 19 * s; y < h; y += 28 * s) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    } else if (kind === 'zigzag') {
      c.strokeStyle = light; c.lineWidth = 3.5 * s;
      for (let y = 8 * s; y < h + 18 * s; y += 18 * s) {
        c.beginPath();
        for (let x = 0, i = 0; x <= w + 10 * s; x += 10 * s, i++) c.lineTo(x, y + (i % 2 ? 5 : -5) * s);
        c.stroke();
      }
    } else if (kind === 'gingham') {
      c.fillStyle = light; c.globalAlpha = 0.45;
      for (let x = 0; x < w; x += 20 * s) c.fillRect(x, 0, 10 * s, h);
      for (let y = 0; y < h; y += 20 * s) c.fillRect(0, y, w, 10 * s);
    } else if (kind === 'cross') {
      c.strokeStyle = dark; c.lineWidth = 2.5 * s;
      for (let y = 10 * s, r = 0; y < h; y += 20 * s, r++)
        for (let x = (r % 2) * 10 * s + 10 * s; x < w; x += 20 * s) {
          c.beginPath(); c.moveTo(x - 4 * s, y); c.lineTo(x + 4 * s, y); c.moveTo(x, y - 4 * s); c.lineTo(x, y + 4 * s); c.stroke();
        }
    } else if (kind === 'denim') {
      c.strokeStyle = dark; c.globalAlpha = 0.55; c.lineWidth = 1.4;
      for (let k = -h; k < w; k += 4) { c.beginPath(); c.moveTo(k, h); c.lineTo(k + h * 0.6, 0); c.stroke(); }
      c.fillStyle = light; c.globalAlpha = 0.5;
      for (let i = 0; i < w * h / 90; i++) c.fillRect(hash(i) * w, hash(i + 999) * h, 2, 1);
    } else if (kind === 'flowers') {
      for (let y = 6 * s, r = 0; y < h + 26 * s; y += 26 * s, r++)
        for (let x = (r % 2) * 13 * s; x < w + 26 * s; x += 26 * s) {
          c.fillStyle = '#fff6dc';
          for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; c.beginPath(); c.arc(x + Math.cos(a) * 4.5 * s, y + Math.sin(a) * 4.5 * s, 3.4 * s, 0, TAU); c.fill(); }
          c.fillStyle = COLORS[1].hex; c.beginPath(); c.arc(x, y, 2.6 * s, 0, TAU); c.fill();
        }
    }
    c.globalAlpha = 0.06; c.strokeStyle = '#000'; c.lineWidth = 1;
    c.beginPath();
    for (let x = 0.5; x < w; x += 3) { c.moveTo(x, 0); c.lineTo(x, h); }
    for (let y = 0.5; y < h; y += 3) { c.moveTo(0, y); c.lineTo(w, y); }
    c.stroke();
    c.restore();
  }

  function cutLetter(ch, size, f) {
    const font = `bold ${size}px ${FONT}`;
    ctx.font = font;
    const adv = ctx.measureText(ch).width;
    const pad = 20, w = Math.ceil(adv + pad * 2), h = Math.ceil(size * 1.4 + pad * 2);
    const [cv, c] = G.makeCanvas(w, h);
    const x = w / 2, y = h / 2;
    c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    c.fillStyle = c.strokeStyle = f.hex; c.lineWidth = BODY;
    c.strokeText(ch, x, y); c.fillText(ch, x, y);
    c.globalCompositeOperation = 'source-atop';
    weave(c, w, h, f.hex, f.kind, 0.75);
    const g = c.createLinearGradient(0, pad, 0, h - pad);
    g.addColorStop(0, 'rgba(255,255,255,0.25)');
    g.addColorStop(0.5, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(29,22,48,0.28)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.setLineDash([5, 4]); c.lineWidth = 2; c.strokeStyle = f.thread;
    c.strokeText(ch, x, y);
    c.setLineDash([]);
    c.globalCompositeOperation = 'destination-over';
    c.strokeStyle = OL; c.lineWidth = BODY + 7;
    c.strokeText(ch, x, y);
    return { cv, adv };
  }

  function smooth(p, pts) {
    const n = pts.length;
    p.moveTo((pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2);
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      p.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    }
    p.closePath();
  }

  // a leftover cloth with the letters' holes still in it
  function scrap(f, rx, ry, holes) {
    const pad = 14, w = Math.ceil(rx * 2.3 + pad * 2), h = Math.ceil(ry * 2.3 + pad * 2);
    const [cv, c] = G.makeCanvas(w, h);
    const pts = [], n = 16;
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU, k = 0.85 + Math.random() * 0.25;
      pts.push([w / 2 + Math.cos(a) * rx * k, h / 2 + Math.sin(a) * ry * k]);
    }
    const path = new Path2D(); smooth(path, pts);
    c.fillStyle = f.hex; c.fill(path);
    c.save(); c.clip(path);
    weave(c, w, h, f.hex, f.kind, 1);
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 6; c.translate(-3, -3); c.stroke(path);
    c.restore();
    c.save(); c.clip(path);
    c.setLineDash([7, 6]); c.lineWidth = 2.2; c.strokeStyle = f.thread;
    c.translate(w / 2, h / 2); c.scale(0.88, 0.86); c.translate(-w / 2, -h / 2); c.stroke(path);
    c.restore();
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.strokeStyle = OL; c.lineWidth = 4.5; c.stroke(path);
    c.lineWidth = 2;
    for (const [x, y] of pts) {
      if (Math.random() < 0.45) continue;
      const dx = x - w / 2, dy = y - h / 2, L = Math.hypot(dx, dy);
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + dx / L * 7, y + dy / L * 7 + 2); c.stroke();
    }
    for (const o of holes) {
      c.save();
      c.translate(w / 2 + o.x, h / 2 + o.y); c.rotate(o.rot);
      c.font = `bold ${o.size}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
      c.globalCompositeOperation = 'source-atop';
      c.strokeStyle = OL; c.lineWidth = BODY + 9; c.strokeText(o.ch, 0, 0);
      c.globalCompositeOperation = 'destination-out';
      c.lineWidth = BODY; c.strokeText(o.ch, 0, 0); c.fillText(o.ch, 0, 0);
      c.restore();
    }
    return cv;
  }

  const WORDS = [
    { str: 'Stitch,', x: 16, y: 94, size: 114, rot: -0.06 },
    { str: 'Snip,', x: 146, y: 206, size: 114, rot: 0.02 },
    { str: 'Ship', x: 246, y: 324, size: 134, rot: -0.05 },
  ];
  const ORDER = [0, 4, 2, 3, 5, 6, 1, 7];
  let words = [], scraps = [];

  G.on('init', () => {
    let k = 0;
    words = WORDS.map(wd => ({
      ...wd,
      letters: [...wd.str].map(ch => {
        const f = FABRICS[ORDER[k++ % ORDER.length]];
        return { ...cutLetter(ch, wd.size, f), rot: (Math.random() - 0.5) * 0.2, dy: (Math.random() - 0.5) * 10 };
      }),
    }));
    scraps = [
      { cv: scrap(FABRICS[0], 96, 80, [{ ch: 'S', x: -6, y: 4, size: 114, rot: -0.1 }]), x: 48, y: 318, rot: 0.2 },
      { cv: scrap(FABRICS[3], 120, 78, [{ ch: 'n', x: 6, y: -4, size: 114, rot: 0.15 }]), x: 236, y: 452, rot: -0.12 },
      { cv: scrap(FABRICS[7], 86, 104, [{ ch: 'p', x: -8, y: -10, size: 134, rot: 0.1 }]), x: 618, y: 262, rot: -0.3 },
      { cv: scrap(FABRICS[5], 70, 54, []), x: 590, y: 476, rot: 0.25 },
    ];
  });

  function background() {
    const W = G.W, H = G.H;
    ctx.fillStyle = '#3c8c6e';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-0.05);
    const R = Math.hypot(W, H) / 2 + 50;
    for (let v = -480; v <= 480; v += 40) {
      const major = (v / 40) % 5 === 0;
      ctx.strokeStyle = major ? 'rgba(255,255,255,0.24)' : 'rgba(255,255,255,0.08)';
      ctx.lineWidth = major ? 2.5 : 1.2;
      ctx.beginPath();
      ctx.moveTo(v, -R); ctx.lineTo(v, R);
      ctx.moveTo(-R, v); ctx.lineTo(R, v);
      ctx.stroke();
    }
    ctx.restore();
    const g = ctx.createRadialGradient(W * 0.45, H * 0.45, H * 0.3, W * 0.45, H * 0.45, H * 0.95);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(10,25,20,0.45)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  function shadowed(fn, ox = 5, oy = 7, a = 0.38) {
    ctx.save();
    ctx.shadowColor = `rgba(10,20,15,${a})`; ctx.shadowOffsetX = ox; ctx.shadowOffsetY = oy;
    fn();
    ctx.restore();
  }

  function drawScrap(s) {
    shadowed(() => {
      ctx.translate(s.x, s.y); ctx.rotate(s.rot);
      ctx.drawImage(s.cv, -s.cv.width / 2, -s.cv.height / 2);
    });
  }

  function title() {
    for (const wd of words) {
      ctx.save();
      ctx.translate(wd.x, wd.y); ctx.rotate(wd.rot);
      let x = 0;
      for (const l of wd.letters) {
        if (l.adv && l.cv) {
          shadowed(() => {
            ctx.translate(x + l.adv / 2, l.dy); ctx.rotate(l.rot);
            ctx.drawImage(l.cv, -l.cv.width / 2, -l.cv.height / 2);
          }, 5, 8, 0.45);
        }
        x += l.adv - 2;
      }
      ctx.restore();
    }
  }

  function pin(x, y, a, color) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(a);
    ctx.lineCap = 'round';
    ctx.strokeStyle = OL; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(16, 0); ctx.stroke();
    ctx.strokeStyle = '#d9deef'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(-17, 0, 6, 0, TAU);
    ctx.fillStyle = color; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = OL; ctx.stroke();
    ctx.restore();
  }

  function snippet(x, y, a, color) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(a);
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-14, 0); ctx.bezierCurveTo(-6, -10, 2, 10, 14, -2);
    ctx.strokeStyle = OL; ctx.lineWidth = 5; ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.restore();
  }

  function spool(x, y, a, color) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = 'rgba(10,20,15,0.3)';
    ctx.beginPath(); ctx.ellipse(8, 10, 40, 30, 0, 0, TAU); ctx.fill();
    G.inkFill(G.wobRect(-24, -30, 48, 60, 501, 0.8), color, 3);
    ctx.save(); ctx.clip(G.wobRect(-24, -30, 48, 60, 501, 0.8));
    ctx.strokeStyle = G.shade(color, -0.25); ctx.lineWidth = 1.5;
    for (let yy = -28; yy < 32; yy += 4) { ctx.beginPath(); ctx.moveTo(-26, yy); ctx.lineTo(26, yy + 3); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(-16, -30, 8, 60);
    ctx.restore();
    for (const yy of [-34, 34]) G.inkFill(G.wobEllipse(0, yy, 34, 9, 502 + yy, 0.6), '#c9915a', 3);
    ctx.beginPath(); ctx.ellipse(0, -34, 7, 2.5, 0, 0, TAU); ctx.fillStyle = OL; ctx.fill();
    ctx.restore();
  }

  function scissors(x, y, a, s) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(s, s);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.fillStyle = 'rgba(10,20,15,0.3)';
    ctx.beginPath(); ctx.ellipse(10, 14, 120, 24, 0, 0, TAU); ctx.fill();
    for (const side of [-1, 1]) {
      ctx.save(); ctx.rotate(side * 0.2);
      G.inkFill(G.wobPoly([[-6, -6 * side], [118, -side], [126, 2 * side], [-6, 7 * side]], 80 + side, 0.6, 2), '#d9deef', 3);
      ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(-34, 14 * side);
      ctx.strokeStyle = OL; ctx.lineWidth = 13; ctx.stroke();
      ctx.strokeStyle = '#e8434f'; ctx.lineWidth = 8; ctx.stroke();
      G.wobEllipse(-56, 20 * side, 24, 15, 82 + side, 0.8);
      ctx.strokeStyle = OL; ctx.lineWidth = 14; ctx.stroke();
      ctx.strokeStyle = '#e8434f'; ctx.lineWidth = 8; ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0, 0, 6, 0, TAU);
    ctx.fillStyle = '#9aa3c7'; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = OL; ctx.stroke();
    ctx.restore();
  }

  function cutTrail() {
    ctx.save();
    ctx.lineCap = 'round'; ctx.setLineDash([2, 9]);
    ctx.beginPath(); ctx.moveTo(612, 344); ctx.quadraticCurveTo(560, 380, 520, 404);
    ctx.strokeStyle = 'rgba(255,251,230,0.8)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
  }

  function needleAndThread() {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(470, 92);
    ctx.bezierCurveTo(430, 140, 520, 160, 470, 210);
    ctx.bezierCurveTo(440, 240, 500, 250, 528, 236);
    ctx.strokeStyle = OL; ctx.lineWidth = 5; ctx.stroke();
    ctx.strokeStyle = '#e8434f'; ctx.lineWidth = 2.4; ctx.stroke();
    ctx.translate(474, 84); ctx.rotate(-0.9);
    ctx.strokeStyle = OL; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(52, 0); ctx.stroke();
    ctx.strokeStyle = '#d9deef'; ctx.lineWidth = 2.2; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-2, 0, 5, 2.5, 0, 0, TAU); ctx.strokeStyle = OL; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }

  function granny() {
    ctx.save();
    ctx.translate(88, 470); ctx.rotate(0.6);
    G.drawHand(0, 0, 0.7, false);
    ctx.restore();
  }

  function draw() {
    background();
    if (!words.length) return;
    for (const s of scraps) drawScrap(s);
    pin(30, 222, 0.9, COLORS[1].hex);
    pin(262, 430, 2.2, COLORS[2].hex);
    pin(560, 210, 1.9, COLORS[0].hex);
    snippet(410, 452, 0.4, COLORS[1].hex);
    snippet(250, 128, -0.3, COLORS[4].hex);
    snippet(560, 32, 0.8, COLORS[3].hex);
    snippet(330, 470, -0.9, '#f59ac0');
    spool(580, 92, 0.18, COLORS[0].hex);
    needleAndThread();
    granny();
    title();
    cutTrail();
    scissors(470, 432, -0.55, 0.8);
  }

  G.on('drawCover', draw);
  G.on('drawCoverCursor', () => true);

  window.addEventListener('keydown', e => {
    if (e.code !== 'KeyS') return;
    const a = document.createElement('a');
    a.download = 'cover.png';
    a.href = document.getElementById('game').toDataURL('image/png');
    a.click();
  });
})();

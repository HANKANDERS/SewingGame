// someone's hand left on the table. drag it, or sew over it and it rips out of the cloth (and tips you)
'use strict';
(() => {
  const G = window.Game;
  if (!G) return;

  const FIRST = [20, 35], INTERVAL = [35, 60], STAY = [30, 45];
  const REST_IN = 320, MAX_ARM = 640;
  const STITCHES = 5, STITCH_DIST = 14, STITCH_R = 50;
  const PULL = 0.45, SPRING = 60, DAMP = 11;
  const TIP = [40, 90];
  const SKINS = ['#f3c9a8', '#c68a62', '#8d5a3b', '#a8dc7a', '#9ad7ff'];
  const SLEEVES = ['#e8434f', '#2f5fd0', '#f7d038', '#7a4b2a', '#9b5de5', '#3a3a3a'];

  let hand = null, next = 0, holdOff = null;
  const active = () => G.state === 'play' && G.eventOn('hand');

  function spawn() {
    const v = G.viewWorld();
    const edges = [
      { sx: v.l - 160, sy: G.rand(v.t + 300, v.b - 300), dx: 1, dy: 0 },
      { sx: v.r + 160, sy: G.rand(v.t + 300, v.b - 300), dx: -1, dy: 0 },
      { sx: G.rand(v.l + 300, v.r - 300), sy: v.b + 120, dx: 0, dy: -1 },
    ];
    const e = G.pick(edges);
    const sh = { x: e.sx, y: e.sy };
    const rest = { x: sh.x + e.dx * REST_IN + G.rand(-60, 60) * Math.abs(e.dy), y: sh.y + e.dy * REST_IN + G.rand(-60, 60) * Math.abs(e.dx) };
    hand = {
      sh, rest, x: sh.x, y: sh.y, vx: 0, vy: 0, state: 'enter', t: 0, life: G.rand(...STAY),
      skin: G.pick(SKINS), sleeve: G.pick(SLEEVES), ring: Math.random() < 0.5,
      stitches: [], stitchDist: 0, yankT: 1, flinch: 0, piece: null, drum: 0,
    };
  }
  function despawn() { hand = null; next = G.rand(...INTERVAL); }
  const angle = () => Math.atan2(hand.y - hand.sh.y, hand.x - hand.sh.x);
  const toLocal = (wx, wy) => {
    const a = angle(), dx = wx - hand.x, dy = wy - hand.y;
    return { x: dx * Math.cos(a) + dy * Math.sin(a), y: -dx * Math.sin(a) + dy * Math.cos(a) };
  };
  const toWorld = (lx, ly) => {
    const a = angle();
    return { x: hand.x + lx * Math.cos(a) - ly * Math.sin(a), y: hand.y + lx * Math.sin(a) + ly * Math.cos(a) };
  };
  function onHand(wx, wy) {
    if (!hand) return false;
    const l = toLocal(wx, wy);
    return (l.x > -20 && l.x < 78 && Math.abs(l.y) < 46) || Math.hypot(l.x - 4, l.y) < 42;
  }
  function clampArm() {
    const dx = hand.x - hand.sh.x, dy = hand.y - hand.sh.y, d = Math.hypot(dx, dy);
    if (d > MAX_ARM) { hand.x = hand.sh.x + dx / d * MAX_ARM; hand.y = hand.sh.y + dy / d * MAX_ARM; }
  }

  const FINGERS = [[-0.5, 62, 13], [-0.17, 72, 13], [0.15, 70, 13], [0.46, 58, 12]];
    function handShapes(jit) {
    const j = (i, a) => jit ? (Math.sin(i * 12.9898 + a * 78.233) * 43758.5453 % 1) * jit : 0;
    const out = [];
    const palm = new Path2D(); palm.ellipse(4, 0, 40 + j(1, 1), 44 + j(2, 1), 0, 0, G.TAU); out.push(palm);
    FINGERS.forEach(([a, len, w], i) => {
      const ex = Math.cos(a) * len, ey = Math.sin(a) * len;
      const tip = new Path2D(); tip.arc(ex, ey, w + j(i, 4), 0, G.TAU); out.push(tip);
      const nx = -Math.sin(a) * w, ny = Math.cos(a) * w;
      const bar = new Path2D(); bar.moveTo(nx, ny); bar.lineTo(ex + nx, ey + ny); bar.lineTo(ex - nx, ey - ny); bar.lineTo(-nx, -ny); bar.closePath(); out.push(bar);
    });
    const th = new Path2D(); th.arc(18, 52, 13 + j(9, 9), 0, G.TAU); out.push(th);
    const thb = new Path2D(); thb.moveTo(-8, 16); thb.lineTo(8, 24); thb.lineTo(26, 46); thb.lineTo(10, 58); thb.closePath(); out.push(thb);
    return out;
  }

  function rip() {
    const p = hand.piece;
    hand.from = { x: hand.x, y: hand.y };
    if (p && G.pieces.includes(p)) {
      const a = angle(), ox = hand.x - p.x, oy = hand.y - p.y;
      const torn = handShapes(6), exact = handShapes(0);
      const v = p.vctx;
      v.save(); v.translate(ox, oy); v.rotate(a);
      v.globalCompositeOperation = 'source-atop'; v.strokeStyle = G.OL; v.lineWidth = 16; v.lineJoin = 'round';
      torn.forEach(s => v.stroke(s));
      v.globalCompositeOperation = 'destination-out';
      torn.forEach(s => v.fill(s)); exact.forEach(s => v.fill(s));
      v.restore();
      const d = p.dctx;
      d.save(); d.translate(ox, oy); d.rotate(a);
      d.globalCompositeOperation = 'destination-out';
      torn.forEach(s => d.fill(s)); exact.forEach(s => d.fill(s));
      d.restore();
      p.refresh();
      const cols = [...p.colors].map(c => G.COLORS[c].hex);
      for (let i = 0; i < 26; i++) {
        const s = G.rand(150, 380), aa = a + Math.PI + G.rand(-1.1, 1.1);
        G.particles.push({ x: hand.x, y: hand.y, vx: Math.cos(aa) * s, vy: Math.sin(aa) * s, life: G.rand(0.4, 0.9), t: 0, color: G.pick(cols.length ? cols : ['#ddd']), size: G.rand(4, 9) });
      }
    }
    const tip = G.randi(...TIP);
    G.addMoney(tip);
    const s = G.worldToScreen(hand.x, hand.y);
    G.addPopup({ x: s.x, y: s.y - 70, text: `+${tip}`, color: '#ffe066', size: 26, life: 1.5 });
    G.sfx('rip'); G.sfx('coin');
    hand.state = 'rip'; hand.t = 0; hand.piece = null;
  }

  function stitchHand() {
    const n = G.needle;
    if (!['rest', 'held', 'snap'].includes(hand.state) || n.speed < 20) return;
    if (Math.hypot(n.x - hand.x, n.y - hand.y) > STITCH_R) { hand.stitchDist = 0; return; }
    hand.stitchDist += n.moved || 0;
    if (hand.stitchDist < STITCH_DIST) return;
    hand.stitchDist = 0;
    const under = G.pieces.filter(p => !p.fly && p.alphaAt(n.x, n.y) > 110).sort((a, b) => b.z - a.z)[0];
    hand.flinch = 1;
    G.sfx('yelp');
    if (!under) return;
    const l = toLocal(n.x, n.y);
    hand.stitches.push({ x: l.x, y: l.y, r: G.rand(-0.5, 0.5) });
    hand.piece = under;
    if (hand.stitches.length >= STITCHES) {
      hand.state = 'sewn'; hand.t = 0; hand.vx = 0; hand.vy = 0;
      hand.sewnAt = { x: hand.x, y: hand.y, px: under.x, py: under.y };
      holdOff = null;
      G.sfx('grunt');
    }
  }

  G.hand = { spawn: () => { if (active()) spawn(); } };
  G.on('roundStart', () => { hand = null; holdOff = null; next = G.rand(...FIRST); });
  G.on('update', dt => {
    if (G.state !== 'play') return;
    if (!active()) { hand = null; holdOff = null; return; }
    if (!hand) { next -= dt; if (next <= 0) spawn(); return; }
    hand.t += dt; hand.life -= dt;
    hand.flinch = Math.max(0, hand.flinch - dt * 4);
    switch (hand.state) {
      case 'enter': {
        const k = G.easeOut(Math.min(1, hand.t / 0.7));
        hand.x = G.lerp(hand.sh.x, hand.rest.x, k); hand.y = G.lerp(hand.sh.y, hand.rest.y, k);
        if (hand.t >= 0.7) { hand.state = 'rest'; hand.t = 0; }
        break;
      }
      case 'rest':
        hand.drum += dt;
        if (hand.life <= 0 && hand.stitches.length === 0) { hand.state = 'leave'; hand.t = 0; hand.from = { x: hand.x, y: hand.y }; }
        break;
      case 'held': case 'snap': {
        let tx, ty;
        if (hand.state === 'held') {
          const mw = G.mouseWorld();
          tx = G.lerp(hand.rest.x, mw.x + holdOff.x, PULL);
          ty = G.lerp(hand.rest.y, mw.y + holdOff.y, PULL);
          hand.yankT -= dt;
          if (hand.yankT <= 0) {
            hand.yankT = G.rand(0.6, 1.3);
            const dx = hand.rest.x - hand.x, dy = hand.rest.y - hand.y, d = Math.hypot(dx, dy) || 1;
            const f = G.rand(500, 900);
            hand.vx += dx / d * f + G.rand(-200, 200); hand.vy += dy / d * f + G.rand(-200, 200);
            G.sfx('grunt');
          }
        } else {
          tx = hand.rest.x; ty = hand.rest.y;
          if (Math.hypot(hand.x - tx, hand.y - ty) < 4 && Math.hypot(hand.vx, hand.vy) < 20) { hand.state = 'rest'; hand.t = 0; }
        }
        hand.vx += ((tx - hand.x) * SPRING - hand.vx * DAMP) * dt;
        hand.vy += ((ty - hand.y) * SPRING - hand.vy * DAMP) * dt;
        hand.x += hand.vx * dt; hand.y += hand.vy * dt;
        clampArm();
        break;
      }
      case 'sewn': {
        const p = hand.piece;
        const sx = Math.sin(hand.t * 38) * 14 + G.rand(-4, 4), sy = Math.cos(hand.t * 31) * 10 + G.rand(-4, 4);
        hand.x = hand.sewnAt.x + sx; hand.y = hand.sewnAt.y + sy;
        if (p && G.pieces.includes(p)) { p.x = hand.sewnAt.px + sx; p.y = hand.sewnAt.py + sy; }
        if (Math.floor(hand.t / 0.35) !== Math.floor((hand.t - dt) / 0.35)) G.sfx(Math.random() < 0.5 ? 'grunt' : 'yelp');
        if (hand.t > 2) rip();
        break;
      }
      case 'rip': {
        const k = Math.min(1, hand.t / 0.35);
        hand.x = G.lerp(hand.from.x, hand.sh.x, k * k); hand.y = G.lerp(hand.from.y, hand.sh.y, k * k);
        if (k >= 1) { despawn(); return; }
        break;
      }
      case 'leave': {
        const k = Math.min(1, hand.t / 0.8);
        hand.x = G.lerp(hand.from.x, hand.sh.x, k * k); hand.y = G.lerp(hand.from.y, hand.sh.y, k * k);
        if (k >= 1) { despawn(); return; }
        break;
      }
    }
    stitchHand();
  });

  G.on('mousedown', e => {
    if (!active() || !hand || e.button !== 0 || G.selected) return;
    if (!['rest', 'snap'].includes(hand.state)) return;
    if (G.cardAt(e.clientX, e.clientY) || G.overUI(e.clientX, e.clientY)) return;
    const w = G.screenToWorld(e.clientX, e.clientY);
    if (!onHand(w.x, w.y)) return;
    holdOff = { x: hand.x - w.x, y: hand.y - w.y };
    hand.state = 'held'; hand.t = 0; hand.yankT = G.rand(0.4, 0.8);
    G.sfx('grunt');
    return true;
  });
  window.addEventListener('mouseup', () => {
    if (hand && hand.state === 'held') { hand.state = 'snap'; hand.t = 0; }
    holdOff = null;
  });
  G.addGrabHover((wx, wy) => {
    if (!hand || !active()) return null;
    if (hand.state === 'held') return 'hold';
    return !G.selected && ['rest', 'snap'].includes(hand.state) && onHand(wx, wy) ? true : null;
  });

  // ---------- rendering ----------
  G.on('drawWorld', ctx => {
    if (!hand || !active()) return;
    const OL = G.OL, TAU = G.TAU, a = angle();
    const sk = hand.skin, skd = G.shade(sk, -0.2);
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    if (hand.state === 'held') {
      const mw = G.mouseWorld();
      ctx.setLineDash([6, 8]); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,224,102,0.8)';
      ctx.beginPath(); ctx.moveTo(hand.x, hand.y); ctx.lineTo(mw.x, mw.y); ctx.stroke();
      ctx.setLineDash([]);
    }

    const len = Math.hypot(hand.x - hand.sh.x, hand.y - hand.sh.y);
    const mx = (hand.x + hand.sh.x) / 2, my = (hand.y + hand.sh.y) / 2;
    const nx = -Math.sin(a), ny = Math.cos(a);
    const bend = Math.min(50, len * 0.08);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(hand.x + 12, hand.y + 16, 56, 40, a, 0, TAU); ctx.fill();
    const arm = new Path2D();
    arm.moveTo(hand.sh.x, hand.sh.y); arm.quadraticCurveTo(mx + nx * bend, my + ny * bend, hand.x, hand.y);
    ctx.strokeStyle = OL; ctx.lineWidth = 62; ctx.stroke(arm);
    ctx.strokeStyle = sk; ctx.lineWidth = 52; ctx.stroke(arm);
    const cuffK = Math.max(0.2, 1 - 210 / Math.max(len, 1));
    const cx = G.lerp(hand.sh.x, hand.x, cuffK), cy = G.lerp(hand.sh.y, hand.y, cuffK);
    const sleeve = new Path2D();
    sleeve.moveTo(hand.sh.x - Math.cos(a) * 200, hand.sh.y - Math.sin(a) * 200); sleeve.lineTo(cx, cy);
    ctx.strokeStyle = OL; ctx.lineWidth = 84; ctx.stroke(sleeve);
    ctx.strokeStyle = hand.sleeve; ctx.lineWidth = 74; ctx.stroke(sleeve);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
    ctx.fillStyle = G.shade(hand.sleeve, 0.25); ctx.fillRect(-8, -38, 14, 76);
    ctx.strokeStyle = OL; ctx.lineWidth = 4; ctx.strokeRect(-8, -38, 14, 76);
    ctx.restore();

    const shake = hand.flinch * 6;
    ctx.translate(hand.x + G.rand(-shake, shake), hand.y + G.rand(-shake, shake));
    ctx.rotate(a);
    const drum = hand.state === 'rest' ? hand.drum : -1;
    FINGERS.forEach(([fa, flen, w], i) => {
      const lift = drum >= 0 ? Math.max(0, Math.sin(drum * 9 - i * 0.9)) * 10 : 0;
      const struggle = (hand.state === 'held' || hand.state === 'sewn') ? Math.sin(hand.t * 25 + i) * 8 : 0;
      const L = flen - lift + struggle * 0.5;
      const ex = Math.cos(fa + struggle * 0.01) * L, ey = Math.sin(fa + struggle * 0.01) * L;
      ctx.strokeStyle = OL; ctx.lineWidth = w * 2 + 8; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.strokeStyle = sk; ctx.lineWidth = w * 2; ctx.stroke();
      ctx.strokeStyle = skd; ctx.lineWidth = 2;
      const kx = ex * 0.6, ky = ey * 0.6, px = -Math.sin(fa) * 6, py = Math.cos(fa) * 6;
      ctx.beginPath(); ctx.moveTo(kx - px, ky - py); ctx.lineTo(kx + px, ky + py); ctx.stroke();
      ctx.fillStyle = '#ffe9f0'; ctx.strokeStyle = OL; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(ex - Math.cos(fa) * 4, ey - Math.sin(fa) * 4, 7, 6, fa, 0, TAU); ctx.fill(); ctx.stroke();
      if (hand.ring && i === 2) {
        ctx.fillStyle = '#f7d038';
        ctx.beginPath(); ctx.ellipse(ex * 0.42, ey * 0.42, 6, w + 2, fa, 0, TAU); ctx.fill(); ctx.stroke();
      }
    });
    ctx.strokeStyle = OL; ctx.lineWidth = 34; ctx.beginPath(); ctx.moveTo(0, 20); ctx.lineTo(16, 52); ctx.stroke();
    ctx.strokeStyle = sk; ctx.lineWidth = 26; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(4, 0, 40, 44, 0, 0, TAU);
    ctx.fillStyle = sk; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = OL; ctx.stroke();
    ctx.strokeStyle = skd; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-14, -18); ctx.quadraticCurveTo(-4, -8, -12, 6); ctx.moveTo(6, -24); ctx.quadraticCurveTo(14, -6, 4, 12); ctx.stroke();
    for (const s of hand.stitches) {
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.r);
      ctx.strokeStyle = OL; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(-9, -9); ctx.lineTo(9, 9); ctx.moveTo(9, -9); ctx.lineTo(-9, 9); ctx.stroke();
      ctx.strokeStyle = '#fffbe6'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = '#e8434f'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill();
      ctx.restore();
    }
    if (hand.flinch > 0.3 || hand.state === 'sewn') {
      for (let i = 0; i < 3; i++) {
        const aa = -1.2 + i * 0.6;
        ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(Math.cos(aa) * 58, Math.sin(aa) * 58 - 30); ctx.lineTo(Math.cos(aa) * 78, Math.sin(aa) * 78 - 40); ctx.stroke();
      }
    }
    ctx.restore();

    if (hand.stitches.length && hand.state !== 'rip') {
      const s = toWorld(-10, -64);
      for (let i = 0; i < STITCHES; i++) {
        ctx.beginPath(); ctx.arc(s.x - (STITCHES - 1) * 9 + i * 18, s.y, 6, 0, TAU);
        ctx.fillStyle = i < hand.stitches.length ? '#e8434f' : 'rgba(255,255,255,0.5)';
        ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = OL; ctx.stroke();
      }
    }
  });
})();

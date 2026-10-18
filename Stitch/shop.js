// fabric gacha machine, bottom right
'use strict';
(() => {
  const G = window.Game;
  if (!G) return;

  const PRICE = 30;
  const COUNT = 5;
  const RARE_PATCH = 0.1;
  const RARE_BIG = 0.15;
  const W_ = 118, H_ = 200;

  const shop = { shake: 0, deny: 0, cd: 0, queue: [], caps: [] };
  // Capsules pile up in the lower part of the globe; sorted so the front ones draw last.
  for (let i = 0; i < 13; i++) {
    const a = G.rand(0.15, Math.PI - 0.15), r = G.rand(8, 34);
    shop.caps.push({ x: Math.cos(a) * r, y: Math.sin(a) * r * 0.9 + 2, c: G.COLORS[i % 6].hex, rot: G.rand(0, G.TAU), ph: G.rand(0, 10) });
  }
  shop.caps.sort((a, b) => a.y - b.y);

  const rect = () => ({ x: G.W - 24 - W_, y: G.H - 262 - H_, w: W_, h: H_ });
  const button = () => { const r = rect(); return { x: r.x + 12, y: r.y + r.h - 48, w: r.w - 24, h: 36 }; };
  const inRect = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

  G.shop = { price: PRICE, rect, button };
  G.titleLines.push(`Mystery box: ${PRICE} cash for ${COUNT} cloths, maybe a big or patchwork one`);

  function genPatchwork() {
    const n = G.randi(2, 3);
    const cols = [0, 1, 2, 3, 4, 5].sort(() => Math.random() - 0.5).slice(0, n);
    const base = G.genFabric(cols[0], G.rand(100, 125));
    base.x = 0; base.y = 0;
    const list = [base];
    for (let i = 1; i < n; i++) {
      const p = G.genFabric(cols[i], G.rand(80, 105));
      const a = i / n * G.TAU + G.rand(-0.4, 0.4);
      p.x = base.w / 2 + Math.cos(a) * base.w * 0.32 - p.w / 2;
      p.y = base.h / 2 + Math.sin(a) * base.h * 0.32 - p.h / 2;
      list.push(p);
    }
    const np = G.composePieces(list);
    const v = np.vctx;
    v.save();
    v.globalCompositeOperation = 'source-atop';
    v.setLineDash([7, 6]); v.lineCap = 'round';
    for (const p of list.slice(1)) {
      v.beginPath();
      v.ellipse(p.x - np.x + p.w / 2, p.y - np.y + p.h / 2, p.w * 0.36, p.h * 0.36, 0, 0, G.TAU);
      v.strokeStyle = G.OL; v.lineWidth = 4; v.stroke();
      v.strokeStyle = '#fffbe6'; v.lineWidth = 2; v.stroke();
    }
    v.restore();
    np.x = 0; np.y = 0;
    return np;
  }
  function roll() {
    const r = Math.random();
    if (r < RARE_PATCH) return { p: genPatchwork(), rare: true };
    if (r < RARE_PATCH + RARE_BIG) return { p: G.genFabric(G.randi(0, 5), G.rand(165, 200)), rare: true };
    return { p: G.genFabric(G.randi(0, 5), G.rand(90, 130)), rare: false };
  }

  function buy() {
    if (shop.cd > 0) return;
    const b = button();
    if (!G.spendMoney(PRICE)) {
      shop.deny = 0.5;
      G.sfx('error');
      G.addPopup(G.round.noText
        ? { x: b.x + b.w / 2, y: b.y - 20, icon: 'cross', life: 0.9 }
        : { x: b.x + b.w / 2, y: b.y - 20, text: 'NO CASH!', color: '#ff6b6b', size: 18, life: 0.9 });
      return;
    }
    shop.cd = 0.35;
    shop.shake = 0.7;
    G.sfx('coin');
    G.sfx('gacha');
    G.addPopup({ x: b.x + b.w / 2, y: b.y - 20, text: `-${PRICE}`, color: '#ffe066', size: 20, life: 1 });
    for (let i = 0; i < COUNT; i++) shop.queue.push({ ...roll(), delay: 0.55 + i * 0.14 });
    G.emit('shopBuy');
  }

  function launch(item) {
    const r = rect();
    const s = G.cardScale();
    const chute = G.screenToWorld(r.x + r.w / 2 - 16, r.y + 135);
    const tw = G.screenToWorld(G.rand(G.W * 0.45, G.W - 240), G.rand(G.CARD_Y + G.CH * s + 60, G.H - 220));
    const p = item.p, M = G.MAT;
    const tx = G.clamp(tw.x - p.w / 2, M.x - p.w * 0.3, M.x + M.w - p.w * 0.7);
    const ty = G.clamp(tw.y - p.h / 2, M.y - p.h * 0.3, M.y + M.h - p.h * 0.7);
    G.launchPiece(p, tx, ty, chute.x - p.w / 2, chute.y - p.h / 2, 0.75);
    p.rare = item.rare;
    G.sfx(item.rare ? 'rare' : 'whoosh');
  }

  G.addUIHit((x, y) => G.state === 'play' && inRect(rect(), x, y));
  G.on('mousedown', e => {
    if (G.state !== 'play' || e.button !== 0 || !inRect(rect(), e.clientX, e.clientY)) return;
    buy();
    return true;
  });
  G.on('roundStart', () => { shop.queue = []; shop.shake = 0; shop.deny = 0; });
  G.on('update', dt => {
    shop.shake = Math.max(0, shop.shake - dt);
    shop.deny = Math.max(0, shop.deny - dt);
    shop.cd = Math.max(0, shop.cd - dt);
    if (G.state !== 'play') return;
    for (const q of shop.queue) { q.delay -= dt; if (q.delay <= 0) { q.done = true; launch(q); } }
    shop.queue = shop.queue.filter(q => !q.done);
  });
  G.on('pieceLanded', p => {
    if (!p.rare) return;
    p.rare = false;
    for (let i = 0; i < 16; i++) {
      G.particles.push({ x: p.x + p.w / 2, y: p.y + p.h / 2, vx: G.rand(-260, 260), vy: G.rand(-260, 260), life: G.rand(0.5, 0.9), t: 0, color: G.pick(['#ffe066', '#fff', '#5ff3ff']), size: G.rand(5, 9), star: true });
    }
  });

  const BODY = '#d9474f', BODY_D = '#a8323d', METAL = '#c9cfe0', DARK = '#2a2e50';
  function capsule(ctx, x, y, r, col, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.beginPath(); ctx.arc(0, 0, r, Math.PI, G.TAU); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI); ctx.closePath(); ctx.fillStyle = G.shade(col, 0.6); ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, r, 0, G.TAU); ctx.lineWidth = 2.2; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(-r * 0.35, -r * 0.45, r * 0.22, 0, G.TAU); ctx.fill();
    ctx.restore();
  }

  G.on('drawHUD', ctx => {
    const r = rect(), { OL, TAU } = G;
    const now = performance.now() / 1000;
    const afford = G.money >= PRICE;
    const k = shop.shake / 0.7;
    const w = r.w, h = r.h;
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = OL;

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(w / 2 + 6, h - 2, w * 0.55, 9, 0, 0, TAU); ctx.fill();
    // Whole machine rocks on its base when a coin goes in.
    ctx.translate(w / 2, h); ctx.rotate(Math.sin(now * 38) * 0.05 * k); ctx.translate(-w / 2, -h);

    // Globe (back): glass + capsules. Collar and body are drawn after it, so they cover its base.
    const gx = w / 2, gy = 50, gr = 46;
    const globe = G.wobEllipse(gx, gy, gr, gr, 41, 0.6);
    ctx.fillStyle = 'rgba(190,235,255,0.22)'; ctx.fill(globe);
    ctx.save(); ctx.clip(globe);
    for (const c of shop.caps) {
      const jx = Math.sin(now * 40 + c.ph) * 6 * k, jy = -Math.abs(Math.cos(now * 33 + c.ph)) * 10 * k;
      capsule(ctx, gx + c.x + jx, gy + c.y + jy, 10, c.c, c.rot + k * Math.sin(now * 20 + c.ph));
    }
    ctx.fillStyle = 'rgba(29,22,48,0.18)';
    ctx.beginPath(); ctx.arc(gx + 10, gy + 8, gr, -0.4, 1.9); ctx.arc(gx, gy, gr + 2, 1.9, -0.4, true); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = OL; ctx.lineWidth = 4; ctx.stroke(globe);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(gx, gy, gr - 9, 3.5, 4.3); ctx.stroke();
    ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(gx, gy, gr - 9, 4.45, 4.6); ctx.stroke();
    G.inkFill(G.wobEllipse(gx, gy - gr + 1, 13, 6, 42, 0.4), BODY, 3);

    // Body: tapered cabinet with a shaded right side.
    const body = G.wobPoly([[20, 98], [w - 20, 98], [w - 4, h - 4], [4, h - 4]], 43, 0.8, 2);
    G.inkFill(body, BODY, 4);
    ctx.save(); ctx.clip(body);
    ctx.fillStyle = BODY_D;
    ctx.beginPath(); ctx.moveTo(w - 34, 90); ctx.lineTo(w, 90); ctx.lineTo(w, h); ctx.lineTo(w - 22, h); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(24, 108); ctx.lineTo(13, h - 16); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = OL; ctx.lineWidth = 4; ctx.stroke(body);

    // Collar ring over the globe's base.
    G.inkFill(G.wobRect(12, 84, w - 24, 16, 44, 0.6), DARK, 3.5);
    ctx.fillStyle = '#9aa3c7';
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(22 + i * (w - 44) / 3, 92, 2.6, 0, TAU); ctx.fill(); }

    // Crank (right): spins while dispensing.
    const ca = -k * 8 + Math.sin(now * 1.5) * 0.04, kx = gx + 25, ky = 125;
    G.inkFill(G.wobEllipse(kx, ky, 12, 12, 45, 0.4), METAL, 3);
    ctx.save(); ctx.translate(kx, ky); ctx.rotate(ca);
    ctx.lineWidth = 8; ctx.strokeStyle = OL; ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(9, 0); ctx.stroke();
    ctx.lineWidth = 4; ctx.strokeStyle = '#eef0f7'; ctx.stroke();
    ctx.restore();
    ctx.beginPath(); ctx.arc(kx, ky, 3, 0, TAU); ctx.fillStyle = OL; ctx.fill();

    // Chute (left).
    const cx = gx - 16;
    ctx.beginPath(); ctx.moveTo(cx - 15, 146); ctx.lineTo(cx - 15, 125); ctx.arc(cx, 125, 15, Math.PI, TAU); ctx.lineTo(cx + 15, 146); ctx.closePath();
    ctx.fillStyle = '#1a0f1f'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = OL; ctx.stroke();
    if (k > 0) {
      const d = 1 - k, cy = 122 + Math.min(1, d * 2.5) * 16;
      ctx.save(); ctx.beginPath(); ctx.rect(cx - 14, 108, 28, 37); ctx.clip();
      ctx.globalAlpha = Math.min(1, k * 3);
      capsule(ctx, cx, cy, 9, G.COLORS[Math.floor(now * 7) % 6].hex, d * 6);
      ctx.restore();
    }
    ctx.fillStyle = METAL; ctx.fillRect(cx - 15, 143, 30, 4);
    ctx.lineWidth = 2; ctx.strokeStyle = OL; ctx.strokeRect(cx - 15, 143, 30, 4);

    // Price plate (the clickable button).
    const bx = 12, by = h - 48, bw = w - 24, bh = 36;
    const py = shop.shake > 0.45 ? 3 : 0;
    const plate = G.wobRect(bx, by + py, bw, bh, 31, 1);
    if (afford && shop.deny <= 0) {
      ctx.save(); ctx.globalAlpha = 0.35 + Math.sin(now * 5) * 0.25;
      ctx.lineWidth = 9; ctx.strokeStyle = '#ffe066'; ctx.stroke(plate);
      ctx.restore();
    }
    G.inkFill(plate, shop.deny > 0 ? '#ff6b6b' : afford ? '#fff6dc' : '#9aa3c7', 3);
    G.drawIcon('coin', bx + 26, by + bh / 2 + py, 10);
    ctx.font = `bold 19px ${G.FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = OL;
    ctx.fillText(String(PRICE), bx + 42, by + bh / 2 + py + 1);
    ctx.restore();
  });
})();


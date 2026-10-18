// neighbours gossiping in speech bubbles that cover part of the screen. lines are in gossip-stories.js
'use strict';
(() => {
  const G = window.Game;
  if (!G) return;

  const DATA = window.GOSSIP;
  const LINES_PER_POP = DATA.linesPerPop;
  const CPS = 40;
  const FIRST = [8, 14], INTERVAL = [18, 26];
  const WHO = DATA.speakers;
  const VOICES = DATA.voices;
  const voiceOf = who => VOICES[who] || 260 + ([...who].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 100003, 7) % 160);

  let story = [], idx = 0;
  function takeLines() {
    const lines = story.slice(idx, idx + LINES_PER_POP);
    idx += lines.length;
    return { lines, end: idx >= story.length };
  }

  let bubble = null, nextT = 0;
  const active = () => G.state === 'play' && G.eventOn('gossip');
  // Mumble voice: one wordless syllable per tick while typing; rests after punctuation; silent while the name types.
  const SYL = [0.08, 0.13], REST = 0.16, NAME_GAP = 0.03;
  const PUNCT = /[,.;:!?…，。；：！？、]/, ENDS = /[.!?。！？]/;

  function open() {
    if (idx >= story.length) return;
    const { lines, end } = takeLines();
    const items = lines.map(([who, text]) => ({ who, str: `${who}: ${text}` }));
    const total = items.reduce((a, it) => a + it.str.length, 0);
    let pos = 0;
    const segs = items.map(it => { const s = { who: it.who, start: pos, nameEnd: pos + it.who.length + 2, end: pos + it.str.length }; pos = s.end; return s; });
    bubble = {
      items, end, total, shown: 0, t: 0, life: total / CPS + 4, side: Math.random() < 0.5 ? -1 : 1, rx: Math.random(), ry: Math.random(),
      text: items.map(it => it.str).join(''), segs, talkT: 0,
    };
  }
  const segAt = (b, i) => b.segs.find(s => i < s.end) || b.segs[b.segs.length - 1];
  // '?' / '!' if the sentence under the cursor ends with one within a few characters (pitch goes up / gets louder).
  function markAhead(b, seg, i) {
    const m = b.text.slice(i, Math.min(seg.end, i + 8)).match(ENDS);
    return !m ? '' : /[?？]/.test(m[0]) ? '?' : /[!！]/.test(m[0]) ? '!' : '';
  }
  function talk(b, dt) {
    for (let i = b.prevShown || 0; i < b.shown; i++) {
      if (i >= segAt(b, i).nameEnd && PUNCT.test(b.text[i])) b.talkT = Math.max(b.talkT, REST);
    }
    b.prevShown = b.shown;
    if (b.shown >= b.total) return;
    b.talkT -= dt;
    if (b.talkT > 0) return;
    const seg = segAt(b, b.shown);
    if (b.shown < seg.nameEnd) { b.talkT = NAME_GAP; return; }
    const d = G.rand(...SYL);
    G.emit('gossipVoice', { f: voiceOf(seg.who), dur: d, mark: markAhead(b, seg, b.shown) });
    b.talkT = d;
  }

  G.gossip = { open: () => { if (active() && !bubble) open(); } };
  G.on('roundStart', r => {
    bubble = null; idx = 0;
    nextT = G.rand(...FIRST);
    const lastDay = Math.max(...Object.keys(DATA.days).map(Number));
    story = DATA.days[Math.min(r.day || 1, lastDay)].lines;
  });
  G.on('update', dt => {
    if (!active()) { bubble = null; return; }
    if (bubble) {
      bubble.t += dt;
      bubble.shown = Math.min(bubble.total, Math.floor(bubble.t * CPS));
      talk(bubble, dt);
      if (bubble.t > bubble.life) { bubble = null; nextT = G.rand(...INTERVAL); }
      return;
    }
    nextT -= dt;
    if (nextT <= 0) open();
  });

  // ---------- drawing ----------
  // Rounded rect as a jittered polygon so it boils like the rest of the ink.
  function bubblePath(x, y, w, h, r, seed) {
    const pts = [];
    for (const [cx, cy, a0] of [[x + w - r, y + r, -Math.PI / 2], [x + w - r, y + h - r, 0], [x + r, y + h - r, Math.PI / 2], [x + r, y + r, Math.PI]])
      for (let i = 0; i <= 4; i++) { const a = a0 + i / 4 * Math.PI / 2; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    return G.wobPoly(pts, seed, 1.5, 2);
  }
  // Word wrap that keeps trailing spaces on each line, so line lengths still add up to str.length (typewriter count).
  function wrap(ctx, str, maxW) {
    const out = [];
    let cur = '';
    for (const word of str.match(/\S+\s*/g) || []) {
      if (cur && ctx.measureText((cur + word).trimEnd()).width > maxW) { out.push(cur); cur = word; } else cur += word;
    }
    if (cur) out.push(cur);
    return out;
  }
  function drawEavesdrop(ctx, x, y, d, t) {
    const OL = G.OL, TAU = G.TAU;
    ctx.save();
    ctx.translate(x, y); ctx.scale(d, 1);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = OL;
    const shown = Math.floor(t * 6) % 4;
    for (let i = 0; i < shown; i++) {
      ctx.beginPath(); ctx.arc(44, 4, 10 + i * 9, -0.8, 0.8);
      ctx.lineWidth = 6; ctx.strokeStyle = OL; ctx.stroke();
      ctx.lineWidth = 3; ctx.strokeStyle = '#5ff3ff'; ctx.stroke();
    }
    ctx.strokeStyle = OL;
    ctx.save();
    ctx.translate(31, 6); ctx.rotate(Math.sin(t * 9) * 0.12);
    ctx.beginPath(); ctx.ellipse(0, 0, 12, 18, 0.15, 0, TAU);
    ctx.fillStyle = '#f3c9a8'; ctx.fill(); ctx.lineWidth = 3.5; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-3, -9); ctx.quadraticCurveTo(7, -4, 1, 6); ctx.quadraticCurveTo(-4, 9, 2, 12);
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#d49a78'; ctx.stroke();
    ctx.restore();
    ctx.beginPath(); ctx.arc(0, 0, 32, 0, TAU);
    ctx.fillStyle = '#0c1824'; ctx.fill(); ctx.lineWidth = 3.5; ctx.stroke();
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, 30, 0, TAU); ctx.clip();
    ctx.beginPath(); ctx.arc(-4, 10, 28, 0, TAU); ctx.fillStyle = '#f3c9a8'; ctx.fill(); ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-4, -16, 34, 13, 0, 0, TAU); ctx.fillStyle = '#eef0f7'; ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e8434f'; ctx.fillRect(-36, -8, 64, 5); ctx.strokeRect(-36, -8, 64, 5);
    ctx.fillStyle = '#f7d038';
    ctx.beginPath(); ctx.moveTo(-4, -24); ctx.lineTo(-20, -36); ctx.lineTo(-8, -22); ctx.closePath(); ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-4, -24); ctx.lineTo(12, -36); ctx.lineTo(0, -22); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(2, 8, 10, 7, 0, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2.5; ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.ellipse(2, 8, 9, 6, 0, 0, TAU); ctx.clip();
    ctx.fillStyle = '#f3c9a8'; ctx.fillRect(-10, 0, 24, 6); ctx.restore();
    ctx.beginPath(); ctx.moveTo(-8, 8); ctx.lineTo(12, 8); ctx.stroke();
    ctx.beginPath(); ctx.arc(9, 11, 2.6, 0, TAU); ctx.fillStyle = OL; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-8, -1); ctx.quadraticCurveTo(2, -6, 12, -2); ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-10, 24); ctx.quadraticCurveTo(-3, 21, 4, 24); ctx.lineWidth = 2.5; ctx.stroke();
    ctx.restore();
    ctx.restore();
  }

  G.on('drawOverlay', ctx => {
    if (!bubble || !active()) return;
    const W = G.W, H = G.H, OL = G.OL, b = bubble;
    const bw = Math.min(440, W * 0.38), pad = 18, lineH = 26, fs = 17;
    ctx.save();
    ctx.font = `bold ${fs}px ${G.FONT}`;
    const wrapped = b.items.map(it => wrap(ctx, it.str, bw - pad * 2));
    const nLines = wrapped.reduce((a, l) => a + l.length, 0);
    const bh = pad * 2 + nLines * lineH + 6;
    const bx = b.side < 0 ? G.lerp(50, W * 0.2, b.rx) : W - bw - G.lerp(50, W * 0.2, b.rx);
    const by = G.lerp(175, Math.max(175, H - 330 - bh), b.ry);

    const tIn = Math.min(1, b.t / 0.25);
    const pop = tIn < 1 ? 1 + 2.2 * Math.pow(tIn - 1, 3) + 1.2 * Math.pow(tIn - 1, 2) : 1;
    const fade = Math.min(1, (b.life - b.t) / 0.4);
    ctx.globalAlpha = Math.max(0, fade);
    const ex = b.side < 0 ? bx : bx + bw;
    ctx.translate(ex, by + bh / 2); ctx.scale(pop, pop); ctx.translate(-ex, -(by + bh / 2));

    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    G.inkFill(bubblePath(bx, by, bw, bh, 22, 41), '#fffdf2', 4.5);
    const ty = by + bh * 0.42;
    ctx.beginPath();
    ctx.moveTo(ex - b.side * 3, ty); ctx.lineTo(ex + b.side * 46, ty + 30); ctx.lineTo(ex - b.side * 3, ty + 24);
    ctx.fillStyle = '#fffdf2'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(ex, ty); ctx.lineTo(ex + b.side * 46, ty + 30); ctx.lineTo(ex, ty + 24); ctx.stroke();

    let left = b.shown, row = 0;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    b.items.forEach((it, idx) => {
      const nameLen = it.who.length + 1;
      let used = 0;
      for (const line of wrapped[idx]) {
        const vis = Math.max(0, Math.min(line.length, left));
        const yy = by + pad + row * lineH + lineH / 2;
        if (vis > 0) {
          const s = line.slice(0, vis);
          ctx.fillStyle = '#2a2140';
          ctx.fillText(s, bx + pad, yy);
          if (used < nameLen) {
            const nm = s.slice(0, Math.max(0, nameLen - used));
            ctx.fillStyle = WHO[it.who] || '#e8434f';
            ctx.fillText(nm, bx + pad, yy);
          }
        }
        left -= line.length; used += line.length; row++;
      }
    });
    if (b.shown >= b.total) {
      const dot = Math.floor(b.t * 3) % 4;
      ctx.fillStyle = '#9aa3c7'; ctx.textAlign = 'right';
      ctx.fillText(b.end ? '(THE END)' : '...'.slice(0, Math.max(1, dot)), bx + bw - pad, by + bh - 14);
    }
    drawEavesdrop(ctx, b.side < 0 ? bx + bw + 40 : bx - 40, by + 34, b.side, b.t);
    ctx.restore();
  });
})();

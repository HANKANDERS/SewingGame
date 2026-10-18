// upstairs neighbour renovating: noise, shake, dust. emits 'quake' so paint/cat can react
'use strict';
(() => {
  const G = window.Game;
  if (!G) return;

  const FIRST = [25, 40], INTERVAL = [40, 70];
  const DRILL_SHAKE = 3.5, HAMMER_SHAKE = 15;

  let next = 0, ev = null, shake = 0, impulse = 0, drillOn = false;
  const active = () => G.state === 'play' && G.eventOn('reno');

  function setDrill(on) {
    if (on === drillOn) return;
    drillOn = on;
    G.sfx(on ? 'drill_on' : 'drill_off');
  }
  function stop() { ev = null; setDrill(false); }
  function start() {
    ev = { kind: Math.random() < 0.5 ? 'drill' : 'hammer', t: 0, dur: G.rand(4, 7), hitT: 0, burst: 0 };
    if (ev.kind === 'drill') setDrill(true);
  }
  function dust(n) {
    for (let i = 0; i < n; i++) {
      const w = G.screenToWorld(G.rand(0, G.W), G.rand(-20, G.H * 0.5));
      G.particles.push({ x: w.x, y: w.y, vx: G.rand(-30, 30), vy: G.rand(60, 160), life: G.rand(0.7, 1.4), t: 0, color: G.pick(['#c8c3b8', '#a9a399', '#e6e0d4']), size: G.rand(2, 5) });
    }
  }
  function jostle(k) {
    for (const p of G.pieces) {
      if (p.fly || (G.drag && G.drag.p === p)) continue;
      p.x += G.rand(-1, 1) * 10 * k;
      p.y += G.rand(-1, 1) * 10 * k;
    }
  }

  G.reno = { start: kind => { if (active() && !ev) { start(); if (kind) ev.kind = kind; setDrill(ev.kind === 'drill'); } } };
  G.on('roundStart', () => { stop(); next = G.rand(...FIRST); shake = 0; impulse = 0; });
  G.on('roundEnd', stop);
  G.on('update', dt => {
    impulse *= Math.exp(-dt * 9);
    if (!active()) { if (ev) stop(); shake = 0; return; }
    if (!ev) { next -= dt; if (next <= 0) start(); shake = impulse; return; }
    ev.t += dt;
    if (ev.kind === 'drill') {
      const env = Math.min(1, ev.t / 0.3) * Math.min(1, (ev.dur - ev.t) / 0.3);
      const surge = 0.6 + 0.4 * Math.sin(ev.t * 2.3);
      shake = DRILL_SHAKE * env * surge + impulse;
      if (Math.random() < dt * 6) dust(1);
      if (Math.random() < dt * 1.5) { jostle(0.25); G.emit('quake', 0.25); }
    } else {
      ev.hitT -= dt;
      if (ev.hitT <= 0) {
        if (ev.burst <= 0) ev.burst = G.randi(2, 4);
        ev.burst--;
        ev.hitT = ev.burst > 0 ? G.rand(0.22, 0.32) : G.rand(0.7, 1.2);
        G.sfx('hammer');
        impulse = HAMMER_SHAKE * G.rand(0.7, 1);
        G.focusLines(G.rand(G.W * 0.3, G.W * 0.7), -80, { inner: G.H * 0.5, dur: 0.18, n: 44 });
        dust(G.randi(3, 6));
        jostle(0.6);
        G.emit('quake', 0.6);
      }
      shake = impulse;
    }
    if (ev.t >= ev.dur) { stop(); next = G.rand(...INTERVAL); }
  });

  G.addShaker(() => shake > 0.05 ? { x: G.rand(-1, 1) * shake, y: G.rand(-1, 1) * shake } : null);
})();

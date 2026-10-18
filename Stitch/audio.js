// all sound is synthesized here. going for cheesy B-movie noisemakers (Rocky Horror / Beetlejuice vibe)
'use strict';
(() => {
  const G = window.Game;
  if (!G) return;

  let AC = null, master = null, sfxBus = null, musBus = null, noiseBuf = null, motor = null;
  let muted = false;
  try { muted = localStorage.getItem('granny_muted') === '1'; } catch (e) {}
  const MASTER_VOL = 0.9;
  const SPRING_MIX = 0.12;
  const SLOP = 15; // default random detune per note, in cents
  const BASE_BPM = 118, MAX_BPM = 182, RAMP_FROM = 30;
  const bgm = { step: 0, nextT: 0 };
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const cents = c => Math.pow(2, c / 1200);

  function driveCurve(k) {
    const n = 2048, c = new Float32Array(n), m = Math.tanh(k);
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(x * k) / m; }
    return c;
  }
  // Cheap spring tank: repeating downward chirps ("drip") over a decaying rattle.
  function springIR() {
    const sr = AC.sampleRate, len = Math.floor(sr * 1.1), P = 0.043;
    const buf = AC.createBuffer(1, len, sr), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / sr, tau = t % P;
      const ph = 2 * Math.PI * (3400 * tau + (400 - 3400) * tau * tau / (2 * P));
      d[i] = (Math.sin(ph) * 0.6 * Math.exp(-tau * 30) + (Math.random() * 2 - 1) * 0.2) * Math.exp(-t * 4);
    }
    return buf;
  }

  function init() {
    if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
    try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; return; }

    // master -> light overdrive -> cheap-speaker EQ (bright, honky) -> (dry + spring) -> compressor -> out
    const comp = AC.createDynamicsCompressor();
    comp.threshold.value = -10; comp.ratio.value = 4;
    comp.connect(AC.destination);
    const hp = AC.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 85;
    const mid = AC.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1900; mid.Q.value = 0.9; mid.gain.value = 3;
    const air = AC.createBiquadFilter(); air.type = 'highshelf'; air.frequency.value = 3500; air.gain.value = 5;
    hp.connect(mid); mid.connect(air); air.connect(comp);
    const spring = AC.createConvolver(); spring.buffer = springIR();
    const wet = AC.createGain(); wet.gain.value = SPRING_MIX;
    air.connect(spring); spring.connect(wet); wet.connect(comp);
    const pre = AC.createGain(); pre.gain.value = 1.4;
    const drive = AC.createWaveShaper(); drive.curve = driveCurve(1.6);
    const post = AC.createGain(); post.gain.value = 0.6;
    pre.connect(drive); drive.connect(post); post.connect(hp);
    master = AC.createGain(); master.gain.value = muted ? 0 : MASTER_VOL; master.connect(pre);
    sfxBus = AC.createGain(); sfxBus.gain.value = 1; sfxBus.connect(master);
    musBus = AC.createGain(); musBus.gain.value = 0.32; musBus.connect(master);

    noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // sewing motor: rattly square + saw, chopped by a square tremolo
    const mlp = AC.createBiquadFilter(); mlp.type = 'lowpass'; mlp.frequency.value = 300; mlp.Q.value = 7;
    const trem = AC.createGain(); trem.gain.value = 1;
    const g = AC.createGain(); g.gain.value = 0;
    const o1 = AC.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 45;
    const o2 = AC.createOscillator(); o2.type = 'square'; o2.frequency.value = 91;
    const lfo = AC.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 10;
    const lg = AC.createGain(); lg.gain.value = 0.5;
    lfo.connect(lg); lg.connect(trem.gain);
    o1.connect(mlp); o2.connect(mlp); mlp.connect(trem); trem.connect(g); g.connect(sfxBus);
    o1.start(); o2.start(); lfo.start();
    motor = { o1, o2, lp: mlp, g, lfo };

    bgm.nextT = AC.currentTime + 0.1; bgm.step = 0;
  }
  window.addEventListener('mousedown', init, true);
  window.addEventListener('keydown', init, true);

  function setMuted(m) {
    muted = m;
    try { localStorage.setItem('granny_muted', m ? '1' : '0'); } catch (e) {}
    if (master) master.gain.setTargetAtTime(m ? 0 : MASTER_VOL, AC.currentTime, 0.05);
  }

  // ---------- synth primitives ----------
  const now = () => AC.currentTime;
  // Pitch program: o.f start; then o.path [[dt, f], ...] (linear, hand-played) | o.steps (stepped) | o.f2 (exp sweep).
  function pitch(param, o, t, k) {
    param.setValueAtTime(o.f * k, t);
    if (o.path) for (const [dt, f] of o.path) param.linearRampToValueAtTime(f * k, t + dt);
    else if (o.steps) o.steps.forEach((f, i) => param.setValueAtTime(f * k, t + i * (o.dur / o.steps.length)));
    else if (o.f2) param.exponentialRampToValueAtTime(o.f2 * k, t + o.dur);
  }
  // Envelope: default = exp decay; o.gate = hard on/off box (crude, slightly clicky on purpose).
  function env(gp, o, t) {
    const v = o.vol || 0.1;
    if (o.gate) {
      gp.setValueAtTime(0, t); gp.linearRampToValueAtTime(v, t + 0.003);
      gp.setValueAtTime(v, t + Math.max(0.004, o.dur - 0.006)); gp.linearRampToValueAtTime(0, t + o.dur);
    } else {
      gp.setValueAtTime(0.0001, t);
      gp.exponentialRampToValueAtTime(v, t + (o.attack || 0.003));
      gp.exponentialRampToValueAtTime(0.0001, t + o.dur);
    }
  }
  // o: f/path/steps/f2, dur, type, vol, gate, attack, lp|bp + q, vib (rate) + vibAmt, slop (cents), at, dest
  function voice(o) {
    const t = o.at != null ? o.at : now();
    const k = cents(rnd(-1, 1) * (o.slop != null ? o.slop : SLOP));
    const osc = AC.createOscillator();
    osc.type = o.type || 'square';
    pitch(osc.frequency, o, t, k);
    const g = AC.createGain();
    env(g.gain, o, t);
    let node = osc;
    if (o.lp || o.bp) {
      const f = AC.createBiquadFilter(); f.type = o.bp ? 'bandpass' : 'lowpass'; f.frequency.value = o.bp || o.lp; f.Q.value = o.q || 1;
      node.connect(f); node = f;
    }
    node.connect(g); g.connect(o.dest || sfxBus);
    if (o.vib) {
      const l = AC.createOscillator(); l.frequency.value = o.vib;
      const lg = AC.createGain(); lg.gain.value = o.f * (o.vibAmt || 0.025);
      l.connect(lg); lg.connect(osc.frequency);
      l.start(t); l.stop(t + o.dur + 0.05);
    }
    osc.start(t); osc.stop(t + o.dur + 0.05);
  }
  function nz(o) {
    const t = o.at != null ? o.at : now();
    const s = AC.createBufferSource(); s.buffer = noiseBuf;
    const f = AC.createBiquadFilter(); f.type = o.type || 'bandpass'; f.frequency.setValueAtTime(o.freq || 1000, t); f.Q.value = o.q || 1;
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
    const g = AC.createGain();
    env(g.gain, o, t);
    s.connect(f).connect(g).connect(o.dest || sfxBus);
    s.start(t, Math.random() * 0.3); s.stop(t + o.dur + 0.02);
  }

  // --- crude "real world" noisemakers ---
  // Kazoo (character voices only: cat, yelps): clipped saw through nasal formants, shaky vibrato.
  const clipCurve = (() => { const n = 256, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.max(-0.45, Math.min(0.45, x)) / 0.45; } return c; })();
  function kazoo(o) {
    const t = o.at != null ? o.at : now(), dest = o.dest || sfxBus;
    const k = cents(rnd(-1, 1) * (o.slop != null ? o.slop : 30));
    const osc = AC.createOscillator(); osc.type = 'sawtooth';
    pitch(osc.frequency, o, t, k);
    for (const [r, a] of [[5.1 + rnd(-1, 1), 0.018], [7.3 + rnd(-1, 1), 0.011]]) {
      const l = AC.createOscillator(); l.frequency.value = r;
      const lg = AC.createGain(); lg.gain.value = o.f * a;
      l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(t + o.dur + 0.05);
    }
    const sh = AC.createWaveShaper(); sh.curve = clipCurve;
    osc.connect(sh);
    const g = AC.createGain();
    const v = o.vol || 0.08;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.02);
    g.gain.setValueAtTime(v, t + o.dur - 0.04); g.gain.linearRampToValueAtTime(0, t + o.dur);
    for (const [f, q, a] of [[700, 5, 1], [1600, 6, 0.9], [3100, 7, 0.6]]) {
      const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * rnd(0.95, 1.05); bp.Q.value = q;
      const bg = AC.createGain(); bg.gain.value = a;
      sh.connect(bp); bp.connect(bg); bg.connect(g);
    }
    g.connect(dest);
    osc.start(t); osc.stop(t + o.dur + 0.05);
  }
  // Slide whistle: breathy triangle + air noise, glides with linear (hand-pushed) moves.
  function slide(o) {
    const t = o.at != null ? o.at : now();
    voice({ ...o, type: 'triangle', gate: true, vib: 6.5 + rnd(-1, 1), vibAmt: 0.012, slop: 0, at: t });
    nz({ dur: o.dur, vol: (o.vol || 0.08) * 0.35, freq: o.f * 1.5, f2: (o.path ? o.path[o.path.length - 1][1] : o.f) * 1.5, q: 2, gate: true, at: t, dest: o.dest });
  }
  // Bulb (clown) horn: two detuned squares through a resonant honky band, pitch sags at the end.
  function honk(o) {
    const t = o.at != null ? o.at : now(), f = o.f || 370, dur = o.dur || 0.17, vol = o.vol || 0.07, dest = o.dest || sfxBus;
    const g = AC.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.setValueAtTime(vol, t + dur * 0.7); g.gain.linearRampToValueAtTime(0, t + dur);
    const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2.5;
    bp.frequency.setValueAtTime(1100, t); bp.frequency.linearRampToValueAtTime(1900, t + dur * 0.3); bp.frequency.linearRampToValueAtTime(900, t + dur);
    bp.connect(g); g.connect(dest);
    for (const det of [0, 4.5]) {
      const osc = AC.createOscillator(); osc.type = 'square';
      osc.frequency.setValueAtTime(f + det, t); osc.frequency.setValueAtTime(f + det, t + dur * 0.6);
      osc.frequency.linearRampToValueAtTime((f + det) * 0.85, t + dur);
      osc.connect(bp); osc.start(t); osc.stop(t + dur + 0.02);
    }
    nz({ dur: dur * 0.6, vol: vol * 0.4, freq: 3000, q: 4, at: t, dest });
  }
  // Cheap brass section: per note two detuned saws, filter "blat" that opens fast then closes.
  function brass(notes, o) {
    const t0 = o.at != null ? o.at : now(), dur = o.dur || 0.18, vol = o.vol || 0.03, dest = o.dest || sfxBus;
    for (const n of notes) {
      const t = t0 + rnd(0, 0.015), f = midi(n) * cents(rnd(-12, 12));
      const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
      lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(5200, t + 0.035); lp.frequency.linearRampToValueAtTime(2200, t + dur);
      const g = AC.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.02);
      g.gain.setValueAtTime(vol * 0.8, t + dur * 0.75); g.gain.linearRampToValueAtTime(0, t + dur);
      lp.connect(g); g.connect(dest);
      for (const det of [-9, 9]) {
        const osc = AC.createOscillator(); osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f * cents(det) * 0.97, t); osc.frequency.linearRampToValueAtTime(f * cents(det), t + 0.03);
        if (o.vib) {
          const l = AC.createOscillator(); l.frequency.value = o.vib;
          const lg = AC.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.03, t + dur);
          l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(t + dur + 0.05);
        }
        if (o.sag) osc.frequency.linearRampToValueAtTime(f * cents(det) * o.sag, t + dur);
        osc.connect(lp); osc.start(t); osc.stop(t + dur + 0.05);
      }
    }
  }
  // Honky-tonk piano: triangle + thin square an octave up, each slightly out of tune, hard hammer click.
  function piano(notes, o) {
    const t0 = o.at != null ? o.at : now(), dur = o.dur || 0.3, vol = o.vol || 0.03, dest = o.dest || sfxBus;
    for (const n of notes) {
      const t = t0 + rnd(0, 0.012), f = midi(n);
      voice({ f, dur, type: 'triangle', vol, slop: 14, at: t, dest });
      voice({ f: f * 2, dur: dur * 0.6, type: 'square', vol: vol * 0.16, slop: 20, at: t, dest });
    }
    nz({ dur: 0.008, vol: vol * 1.5, freq: 4000, q: 1, at: t0, dest });
  }
  // Xylophone: bright wooden bar — fundamental + 3x/6x partials + mallet click.
  function xylo(o) {
    const t = o.at != null ? o.at : now(), f = o.f * cents(rnd(-8, 8)), v = o.vol || 0.06, dest = o.dest || sfxBus;
    voice({ f, dur: o.dur || 0.3, type: 'sine', vol: v, slop: 0, at: t, dest });
    voice({ f: f * 3, dur: 0.08, type: 'sine', vol: v * 0.45, slop: 0, at: t, dest });
    voice({ f: f * 6.1, dur: 0.03, type: 'triangle', vol: v * 0.25, slop: 0, at: t, dest });
    nz({ dur: 0.008, vol: v * 1.3, freq: 5500, q: 1, at: t, dest });
  }
  // Cheap combo organ stab: two squares per note (8' + 4'), each a little out of tune.
  function organ(notes, o) {
    const t = o.at != null ? o.at : now();
    for (const n of notes) {
      const f = midi(n);
      voice({ f, dur: o.dur, gate: true, vol: o.vol, lp: o.lp || 5500, slop: 20, vib: 6.2, vibAmt: 0.006, at: t + rnd(0, 0.012), dest: o.dest });
      voice({ f: f * 2, dur: o.dur, gate: true, vol: o.vol * 0.4, lp: o.lp || 5500, slop: 20, at: t + rnd(0, 0.012), dest: o.dest });
    }
  }
  // Desk / service bell: inharmonic metal partials + strike click.
  function bell(o) {
    const t = o.at != null ? o.at : now(), f = (o.f || 1350) * rnd(0.98, 1.02), dur = o.dur || 0.7, vol = o.vol || 0.05;
    [[1, 1, 1], [2.76, 0.5, 0.6], [5.4, 0.25, 0.35]].forEach(([r, a, dk]) =>
      voice({ f: f * r, dur: dur * dk, type: 'sine', vol: vol * a, slop: 0, at: t, dest: o.dest }));
    nz({ dur: 0.012, vol: vol * 2, freq: 3500, q: 2, at: t, dest: o.dest });
  }
  // Woodblock tok.
  function tok(o) {
    const t = o.at != null ? o.at : now(), f = (o.f || 900) * rnd(0.96, 1.04), vol = o.vol || 0.12;
    voice({ f, f2: f * 0.88, dur: 0.06, type: 'sine', vol, slop: 0, at: t, dest: o.dest });
    voice({ f: f * 2.4, dur: 0.025, type: 'triangle', vol: vol * 0.3, slop: 0, at: t, dest: o.dest });
    nz({ dur: 0.01, vol: vol * 0.8, freq: 2400, q: 2, at: t, dest: o.dest });
  }
  // Spring "boing": pitch wobble that dies out.
  function boing(o) {
    const t = o.at != null ? o.at : now(), f = o.f || 180, dur = o.dur || 0.45, vol = o.vol || 0.08;
    const osc = AC.createOscillator(); osc.type = 'triangle';
    osc.frequency.setValueAtTime(f, t); osc.frequency.linearRampToValueAtTime(f * 1.25, t + dur);
    const l = AC.createOscillator(); l.frequency.value = 11 + rnd(-2, 2);
    const lg = AC.createGain(); lg.gain.setValueAtTime(f * 0.6, t); lg.gain.exponentialRampToValueAtTime(1, t + dur);
    l.connect(lg); lg.connect(osc.frequency);
    const g = AC.createGain(); env(g.gain, { vol, dur }, t);
    osc.connect(g); g.connect(o.dest || sfxBus);
    osc.start(t); l.start(t); osc.stop(t + dur + 0.05); l.stop(t + dur + 0.05);
  }
  // Raspberry / razz: buzzy saw flapped by an irregular square + spit noise.
  function razz(o) {
    const t = o.at != null ? o.at : now(), f = o.f || 75, dur = o.dur || 0.55, vol = o.vol || 0.14, dest = o.dest || sfxBus;
    const osc = AC.createOscillator(); osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f * 1.15, t); osc.frequency.linearRampToValueAtTime(f * 0.8, t + dur);
    const flap = AC.createGain(); flap.gain.value = 0.5;
    const l = AC.createOscillator(); l.type = 'square'; l.frequency.setValueAtTime(24, t); l.frequency.linearRampToValueAtTime(31, t + dur * 0.5); l.frequency.linearRampToValueAtTime(19, t + dur);
    const lg = AC.createGain(); lg.gain.value = 0.5;
    l.connect(lg); lg.connect(flap.gain);
    const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200; lp.Q.value = 3;
    const g = AC.createGain(); env(g.gain, { vol, dur, gate: true }, t);
    osc.connect(lp); lp.connect(flap); flap.connect(g); g.connect(dest);
    osc.start(t); l.start(t); osc.stop(t + dur + 0.05); l.stop(t + dur + 0.05);
    nz({ dur, vol: vol * 0.35, freq: 900, q: 1.5, gate: true, at: t, dest });
  }
  // Ratchet / crank: uneven clicks.
  function ratchet(o) {
    const t = o.at != null ? o.at : now();
    let dt = 0;
    for (let i = 0; i < (o.n || 6); i++) { nz({ dur: 0.012, vol: o.vol || 0.18, freq: 3200 + rnd(-600, 600), q: 3, at: t + dt, dest: o.dest }); dt += (o.gap || 0.045) * rnd(0.7, 1.3); }
  }
  // Game-show wrong buzzer: raw beating squares, hard gate.
  function buzzer(o) {
    const t = o.at != null ? o.at : now(), dur = o.dur || 0.32;
    for (const f of [98, 104, 147]) voice({ f, dur, gate: true, vol: (o.vol || 0.032), slop: 0, at: t, dest: o.dest });
  }
  // Tin crash cymbal.
  const crash = o => nz({ dur: o.dur || 0.7, vol: o.vol || 0.1, freq: 7000, q: 0.7, at: o.at, dest: o.dest });

  let drill = null;
  function setDrill(on) {
    if (!drill) {
      const o1 = AC.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 160;
      const o2 = AC.createOscillator(); o2.type = 'square'; o2.frequency.value = 323;
      const n = AC.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
      const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1300; bp.Q.value = 2;
      const trem = AC.createGain(); trem.gain.value = 0.7;
      const lfo = AC.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 28;
      const lg = AC.createGain(); lg.gain.value = 0.3;
      lfo.connect(lg); lg.connect(trem.gain);
      const wob = AC.createOscillator(); wob.frequency.value = 0.7;
      const wg = AC.createGain(); wg.gain.value = 25;
      wob.connect(wg); wg.connect(o1.frequency);
      const g = AC.createGain(); g.gain.value = 0;
      o1.connect(bp); o2.connect(bp); n.connect(bp); bp.connect(trem); trem.connect(g); g.connect(sfxBus);
      [o1, o2, n, lfo, wob].forEach(x => x.start());
      drill = { g };
    }
    drill.g.gain.setTargetAtTime(on ? 0.12 : 0, AC.currentTime, on ? 0.05 : 0.12);
  }

  // ---------- sound effects ----------
  const SFX = {
    // typewriter clack
    stitch: () => { nz({ dur: 0.012, vol: 0.07, freq: rnd(3000, 4200), q: 3 }); voice({ f: rnd(1900, 2500), dur: 0.01, vol: 0.012, slop: 0 }); },
    // pedal: wooden clunk + the odd little spring
    pedal: () => {
      const t = now();
      voice({ f: 120, f2: 50, dur: 0.09, type: 'sine', vol: 0.24, slop: 0 });
      tok({ f: 620, vol: 0.09 });
      if (Math.random() < 0.5) boing({ f: 260, dur: 0.22, vol: 0.025, at: t + 0.03 });
    },
    // scissors: two snips
    cut: () => {
      const t = now();
      nz({ dur: 0.04, vol: 0.3, freq: 5000, q: 3 }); tok({ f: 1700, vol: 0.05 });
      nz({ dur: 0.05, vol: 0.3, freq: 4300, q: 3, at: t + 0.08 + rnd(0, 0.02) }); tok({ f: 1500, vol: 0.06, at: t + 0.08 });
    },
    // two pieces stitched: tok-tok + quick whistle blip
    merge: () => {
      const t = now();
      tok({ f: 900 }); tok({ f: 1150, at: t + 0.07 + rnd(0, 0.02) });
      slide({ f: 1000, path: [[0.12, 1900]], dur: 0.13, vol: 0.05, at: t + 0.1 });
    },
    // order done, happy: slide whistle up -> honk honk, brass "ta-da" under the second honk
    happy: () => {
      const t = now();
      slide({ f: 700, path: [[0.08, 950], [0.2, 1850], [0.24, 1750]], dur: 0.26, vol: 0.08 });
      const h2 = t + 0.42 + rnd(-0.03, 0.03);
      honk({ at: t + 0.24 }); honk({ at: h2, f: 400 });
      brass([60, 64, 67, 72], { dur: 0.3, vol: 0.022, at: h2 });
    },
    // meh: deflating slide whistle + a shrugging honk
    meh: () => {
      const t = now();
      slide({ f: 1100, path: [[0.12, 1000], [0.4, 520]], dur: 0.42, vol: 0.07 });
      honk({ f: 300, dur: 0.22, vol: 0.05, at: t + 0.4 });
    },
    // angry / expired: raspberry + sagging low honk
    angry: () => {
      const t = now();
      razz({});
      honk({ f: 190, dur: 0.3, vol: 0.06, at: t + 0.12 });
    },
    // new order: desk bell, slapped twice
    order: () => { const t = now(); bell({}); bell({ vol: 0.035, at: t + 0.16 + rnd(0, 0.03) }); },
    // fabric flying in: short swanee-whistle drop + cloth swish
    whoosh: () => {
      slide({ f: 1600 * rnd(0.9, 1.1), path: [[0.22, 650]], dur: 0.24, vol: 0.035 });
      nz({ dur: 0.25, vol: 0.07, freq: 700, f2: 3000, q: 1.2 });
    },
    // landing: rubber "bwop"
    plop: () => { voice({ f: 560, f2: 120, dur: 0.1, type: 'sine', vol: 0.15, slop: 0 }); tok({ f: 500, vol: 0.05 }); },
    error: () => buzzer({}),
    pick: () => tok({ f: 1300, vol: 0.08 }),
    drop: () => tok({ f: 800, vol: 0.08 }),
    grab: () => { nz({ dur: 0.08, vol: 0.12, freq: 1800, q: 0.8 }); tok({ f: 750, vol: 0.05 }); },
    release: () => { nz({ dur: 0.07, vol: 0.08, freq: 1200, q: 0.8 }); tok({ f: 600, vol: 0.04 }); },
    // last-10-seconds tick: clock tock
    tick: () => tok({ f: 1400, vol: 0.1 }),
    // customer losing patience: wind-up alarm clock trill
    warn: () => {
      const t = now();
      for (let i = 0; i < 7; i++) bell({ f: 2100, dur: 0.12, vol: 0.025, at: t + i * 0.045 + rnd(0, 0.008) });
    },
    // shop opens: crank, then a cheesy brass fanfare + crash
    start: () => {
      const t = now();
      ratchet({ n: 6, at: t });
      brass([60, 64, 67], { dur: 0.12, vol: 0.025, at: t + 0.3 });
      brass([62, 65, 69], { dur: 0.12, vol: 0.025, at: t + 0.45 + rnd(0, 0.02) });
      brass([64, 67, 72, 76], { dur: 0.55, vol: 0.028, at: t + 0.62 });
      crash({ at: t + 0.62, vol: 0.08 });
      honk({ at: t + 0.66, f: 420 });
    },
    // closing: shop shutter rattles down and hits the floor (the grade stamp follows)
    end: () => {
      const t = now();
      ratchet({ n: 10, gap: 0.038, vol: 0.14, at: t });
      voice({ f: 130, f2: 55, dur: 0.14, type: 'sine', vol: 0.3, slop: 0, at: t + 0.45 });
      nz({ dur: 0.1, vol: 0.18, freq: 1600, q: 0.8, at: t + 0.45 });
    },
    // rubber stamp slammed on paper
    stamp: () => {
      voice({ f: 150, f2: 42, dur: 0.2, type: 'sine', vol: 0.5, slop: 0 });
      nz({ dur: 0.06, vol: 0.35, freq: 1200, q: 0.7 });
      tok({ f: 340, vol: 0.12 });
    },
    // grade jingles (played right after the stamp lands)
    rankS: () => {
      const t = now() + 0.12;
      [72, 74, 76, 79, 81, 84, 86, 88].forEach((n, i) => xylo({ f: midi(n), vol: 0.05, dur: 0.18, at: t + i * 0.035 }));
      brass([60, 64, 67], { dur: 0.12, vol: 0.03, at: t });
      brass([62, 65, 69], { dur: 0.12, vol: 0.03, at: t + 0.15 });
      brass([64, 67, 72, 76], { dur: 0.8, vol: 0.034, vib: 6, at: t + 0.3 });
      crash({ at: t + 0.3, vol: 0.1, dur: 1 });
      honk({ at: t + 0.55, f: 440 }); honk({ at: t + 0.72, f: 440 });
      slide({ f: 900, path: [[0.35, 2300]], dur: 0.36, vol: 0.05, at: t + 0.9 });
      bell({ f: 1760, dur: 1, vol: 0.05, at: t + 1.25 });
    },
    rankA: () => {
      const t = now() + 0.12;
      [72, 76, 79, 84].forEach((n, i) => xylo({ f: midi(n), vol: 0.05, dur: 0.2, at: t + i * 0.05 }));
      brass([60, 64, 67], { dur: 0.13, vol: 0.03, at: t });
      brass([65, 69, 72], { dur: 0.55, vol: 0.032, vib: 6, at: t + 0.17 });
      crash({ at: t + 0.17, vol: 0.06 });
      honk({ at: t + 0.45, f: 420 });
      bell({ f: 1568, dur: 0.8, vol: 0.045, at: t + 0.75 });
    },
    rankB: () => {
      const t = now() + 0.12;
      xylo({ f: midi(79), vol: 0.09, dur: 0.3, at: t });
      xylo({ f: midi(72), vol: 0.09, dur: 0.45, at: t + 0.2 });
      tok({ f: 1000, vol: 0.08, at: t + 0.45 });
    },
    // the only "sad" one: cheap brass sad trombone + sproing
    rankC: () => {
      const t = now() + 0.15;
      [[63, 0], [62, 0.34], [61, 0.68]].forEach(([n, dt]) => brass([n - 12], { dur: 0.3, vol: 0.05, sag: 0.98, at: t + dt }));
      brass([48], { dur: 1, vol: 0.05, vib: 5, sag: 0.96, at: t + 1.02 });
      boing({ f: 150, dur: 0.6, vol: 0.06, at: t + 2.1 });
    },
    // cash register: ratchet + ding
    coin: () => { const t = now(); ratchet({ n: 3, gap: 0.03, vol: 0.14 }); bell({ f: 1700, dur: 0.5, at: t + 0.1 }); },
    // capsule machine: crank, rattle, bloop
    gacha: () => {
      const t = now();
      ratchet({ n: 8, gap: 0.055, vol: 0.15, at: t + 0.08 });
      boing({ f: 320, dur: 0.25, vol: 0.05, at: t + 0.55 });
      voice({ f: 560, f2: 150, dur: 0.1, type: 'sine', vol: 0.12, slop: 0, at: t + 0.58 });
    },
    // rare drop: whistle up + brass chord + double honk
    rare: () => {
      const t = now();
      slide({ f: 650, path: [[0.3, 2100]], dur: 0.32, vol: 0.07 });
      brass([65, 69, 72, 77], { dur: 0.45, vol: 0.028, at: t + 0.3 });
      honk({ at: t + 0.32, f: 430 }); honk({ at: t + 0.5, f: 430 });
      crash({ at: t + 0.3, vol: 0.06 });
    },
    tutStep: () => bell({ f: 1600 }),
    // the cat: someone doing a meow into a kazoo
    meow: () => {
      const k = rnd(0.85, 1.15);
      kazoo({ f: 560 * k, path: [[0.12, 880 * k], [0.4, 460 * k]], dur: 0.42, vol: 0.07, slop: 0 });
    },
    yowl: () => {
      kazoo({ f: 650, path: [[0.2, 1200], [0.35, 1100], [0.7, 450]], dur: 0.72, vol: 0.1 });
      nz({ dur: 0.4, vol: 0.06, freq: 4000, type: 'highpass', at: now() + 0.1 });
    },
    hiss: () => nz({ dur: 0.35, vol: 0.1, freq: 3600, type: 'highpass', gate: true }),
    purr: () => razz({ f: 45, dur: 0.7, vol: 0.06 }),
    yelp: () => {
      const k = rnd(0.85, 1.2);
      kazoo({ f: 520 * k, path: [[0.08, 780 * k], [0.32, 280 * k]], dur: 0.34, vol: 0.1 });
    },
    grunt: () => kazoo({ f: 160, path: [[0.2, 120]], dur: 0.22, vol: 0.13 }),
    rip: () => {
      const t = now();
      nz({ dur: 0.55, vol: 0.28, freq: 1500, f2: 5000, q: 1.2 });
      for (let i = 0; i < 6; i++) nz({ dur: 0.03, vol: 0.18, freq: rnd(3000, 5000), q: 4, at: t + i * 0.07 * rnd(0.7, 1.3) });
    },
    // tin bucket: BONK
    plonk: () => {
      voice({ f: 110, f2: 60, dur: 0.18, type: 'sine', vol: 0.24, slop: 0 });
      bell({ f: 560, dur: 0.45, vol: 0.06 });
    },
    // SPLOOSH + rubber bloops
    splash: () => {
      const t = now();
      nz({ dur: 0.5, vol: 0.3, freq: 2400, f2: 400, q: 0.7 });
      for (let i = 0; i < 5; i++) voice({ f: rnd(1000, 1600), f2: rnd(250, 450), dur: 0.07, type: 'sine', vol: 0.06, slop: 0, at: t + 0.12 + i * 0.07 * rnd(0.7, 1.3) });
    },
    slosh: () => nz({ dur: 0.18, vol: 0.08, freq: 900, f2: 500, q: 1.5 }),
    // upstairs hammer: thud + clang
    hammer: () => {
      voice({ f: 95, f2: 45, dur: 0.22, type: 'sine', vol: 0.42, slop: 0 });
      nz({ dur: 0.08, vol: 0.25, freq: 2500, q: 1.5 });
      bell({ f: 820, dur: 0.4, vol: 0.05 });
    },
    drill_on: () => setDrill(true),
    drill_off: () => setDrill(false),
  };
  G.on('sfx', name => {
    if (AC && SFX[name]) SFX[name]();
  });

  // ---------- gossip mumble: "wah-wah" wordless talk heard through the wall ----------
  // One syllable = buzzy saw through two vowel formants that glide (the "wa"), muffled by a lowpass.
  // o: f (speaker pitch), dur, mark ('?' rises, '!' louder and higher, '' falls like a statement)
  const VOWELS = [[800, 1250], [550, 900], [450, 1900], [350, 800], [300, 2200], [650, 1100]];
  function mumble(o) {
    const t = now(), dur = o.dur, dest = sfxBus;
    const f0 = o.f * rnd(0.9, 1.12) * (o.mark === '!' ? 1.15 : 1);
    const f1 = o.mark === '?' ? f0 * rnd(1.3, 1.5) : f0 * rnd(0.82, 1.02);
    const osc = AC.createOscillator(); osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.linearRampToValueAtTime(f0 * rnd(1.02, 1.1), t + dur * 0.35);
    osc.frequency.linearRampToValueAtTime(f1, t + dur);
    const a = VOWELS[Math.floor(Math.random() * VOWELS.length)], b = VOWELS[Math.floor(Math.random() * VOWELS.length)];
    const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
    lp.frequency.setValueAtTime(500, t);
    lp.frequency.linearRampToValueAtTime(1900, t + dur * 0.3);
    lp.frequency.linearRampToValueAtTime(700, t + dur);
    const g = AC.createGain(), v = 0.2 * (o.mark === '!' ? 1.4 : 1);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.018);
    g.gain.linearRampToValueAtTime(v * 0.7, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0, t + dur);
    [[0, 5, 1], [1, 7, 0.55]].forEach(([i, q, amp]) => {
      const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q;
      bp.frequency.setValueAtTime(a[i], t); bp.frequency.linearRampToValueAtTime(b[i], t + dur);
      const bg = AC.createGain(); bg.gain.value = amp;
      osc.connect(bp); bp.connect(bg); bg.connect(lp);
    });
    lp.connect(g); g.connect(dest);
    osc.start(t); osc.stop(t + dur + 0.05);
  }
  G.on('gossipVoice', o => {
    if (AC && AC.state === 'running') mumble(o);
  });

  // ---------- BGM: spooky rock'n'roll / carnival loop (A minor -> F -> D minor -> E) ----------
  // xylophone lead, plucked walking bass, honky-tonk piano offbeats, brass stabs, brushy kit.
  const ROOTS = [45, 41, 38, 40];
  const CHORDS = [[0, 3, 7], [0, 4, 7], [0, 3, 7], [0, 4, 7]];
  const WALK = [[0, 7, 12, 7], [0, 7, 12, 7], [0, 7, 12, 10], [0, 4, 7, 11]];
  const LEAD = [
    81, 0, 0, 84, 0, 0, 88, 0, 0, 0, 89, 0, 88, 0, 84, 0,
    77, 0, 0, 81, 0, 0, 84, 0, 0, 0, 86, 0, 84, 0, 81, 0,
    74, 0, 0, 77, 0, 0, 81, 0, 0, 0, 82, 0, 81, 0, 77, 0,
    76, 0, 0, 80, 0, 0, 83, 0, 86, 0, 84, 0, 83, 0, 80, 0,
  ];
  const sloppy = t => t + rnd(0, 0.012);
  function bpmNow() {
    if (G.state !== 'play' || !G.round.timer) return BASE_BPM;
    const k = Math.max(0, Math.min(1, 1 - G.timeLeft / RAMP_FROM));
    return BASE_BPM + (MAX_BPM - BASE_BPM) * k * k;
  }
  function pluck(n, t) {
    const f = midi(n);
    voice({ f, dur: 0.3, type: 'triangle', vol: 0.2, slop: 8, at: t, dest: musBus });
    voice({ f, dur: 0.07, type: 'square', vol: 0.05, lp: 1500, slop: 8, at: t, dest: musBus });
  }
  function bgmStep(s, t, sp, panic) {
    const bar = Math.floor(s / 16) % 4, st = s % 16, root = ROOTS[bar];
    // kit
    if (st === 0 || st === 8 || (st === 10 && bar === 3)) voice({ f: 120, f2: 45, dur: 0.14, type: 'sine', vol: 0.45, slop: 0, at: t, dest: musBus });
    if (st === 4 || st === 12) {
      nz({ dur: 0.11, vol: 0.2, freq: 2400, q: 0.7, at: sloppy(t), dest: musBus });
      voice({ f: 220, f2: 160, dur: 0.05, type: 'triangle', vol: 0.06, slop: 0, at: t, dest: musBus });
    }
    if (panic || st % 2 === 0) nz({ dur: 0.025, vol: st % 4 === 2 ? 0.07 : 0.035, freq: 7500, type: 'highpass', at: t, dest: musBus });
    // walking bass on the beats
    if (st % 4 === 0) pluck(root + WALK[bar][st / 4], sloppy(t));
    // honky-tonk piano on the offbeats
    if (st % 4 === 2) piano(CHORDS[bar].map(iv => root + 24 + iv), { dur: 0.16, vol: 0.02, at: sloppy(t), dest: musBus });
    // brass stabs
    if (st === 0 && bar % 2 === 0) brass(CHORDS[bar].map(iv => root + 24 + iv), { dur: sp * 1.5, vol: 0.016, at: t, dest: musBus });
    if (bar === 3 && (st === 12 || st === 14)) brass(CHORDS[bar].map(iv => root + 24 + iv), { dur: sp * 0.9, vol: 0.016, at: sloppy(t), dest: musBus });
    // xylophone lead
    const n = LEAD[s];
    if (n) xylo({ f: midi(n), vol: 0.045, dur: 0.25, at: sloppy(t), dest: musBus });
    // the odd Elfman-ish aside
    if (st === 13 && bar === 3 && Math.random() < 0.5) for (let i = 0; i < 3; i++) tok({ f: 1400 - i * 180, vol: 0.05, at: t + i * sp * 0.66, dest: musBus });
    if (st === 15 && bar === 1 && Math.random() < 0.3) slide({ f: 800, path: [[sp * 2, 1500]], dur: sp * 2, vol: 0.022, at: t, dest: musBus });
  }
  function bgmTick() {
    if (G.state === 'end') { bgm.nextT = AC.currentTime + 0.1; return; }
    const sp = 60 / bpmNow() / 4;
    const panic = G.state === 'play' && G.round.timer && G.timeLeft < 10;
    if (bgm.nextT < AC.currentTime - 0.3) bgm.nextT = AC.currentTime + 0.05;
    while (bgm.nextT < AC.currentTime + 0.12) {
      bgmStep(bgm.step, bgm.nextT, sp, panic);
      bgm.nextT += sp;
      bgm.step = (bgm.step + 1) % 64;
    }
  }

  function updateMotor() {
    const sp = G.state === 'play' ? G.needle.speed : 0;
    const k = Math.min(1, sp / 700), t = AC.currentTime;
    motor.o1.frequency.setTargetAtTime(40 + k * 110, t, 0.05);
    motor.o2.frequency.setTargetAtTime(82 + k * 230, t, 0.05);
    motor.lp.frequency.setTargetAtTime(300 + k * 1900, t, 0.05);
    motor.lfo.frequency.setTargetAtTime(8 + k * 30, t, 0.05);
    motor.g.gain.setTargetAtTime(sp > 0 ? 0.03 + k * 0.08 : 0, t, 0.08);
  }

  G.on('update', () => {
    if (!AC || AC.state !== 'running') return;
    bgmTick();
    updateMotor();
  });

  // ---------- mute button (top-left) + M key ----------
  const BTN = { x: 44, y: 52, r: 18 };
  const hit = (x, y) => Math.hypot(x - BTN.x, y - BTN.y) <= BTN.r + 4;
  G.addUIHit(hit);
  G.on('mousedown', e => {
    if (e.button === 0 && hit(e.clientX, e.clientY)) { init(); setMuted(!muted); return true; }
  });
  G.on('keydown', e => { if (e.code === 'KeyM') setMuted(!muted); });
  function drawMute(ctx) {
    const { OL } = G;
    ctx.save();
    ctx.translate(BTN.x, BTN.y);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, 0, BTN.r, 0, G.TAU);
    ctx.fillStyle = '#0c1824'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = OL; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-9, -4); ctx.lineTo(-4, -4); ctx.lineTo(2, -9); ctx.lineTo(2, 9); ctx.lineTo(-4, 4); ctx.lineTo(-9, 4); ctx.closePath();
    ctx.fillStyle = muted ? '#9aa3c7' : '#5ff3ff'; ctx.fill();
    ctx.lineWidth = 2;
    if (muted) {
      ctx.strokeStyle = '#ff6b6b';
      ctx.beginPath(); ctx.moveTo(6, -5); ctx.lineTo(12, 5); ctx.moveTo(12, -5); ctx.lineTo(6, 5); ctx.stroke();
    } else {
      ctx.strokeStyle = '#5ff3ff';
      ctx.beginPath(); ctx.arc(3, 0, 6, -0.8, 0.8); ctx.stroke();
      ctx.beginPath(); ctx.arc(3, 0, 10, -0.8, 0.8); ctx.stroke();
    }
    ctx.restore();
  }
  G.on('drawHUD', drawMute);
  G.on('drawCoverHUD', drawMute);
})();
